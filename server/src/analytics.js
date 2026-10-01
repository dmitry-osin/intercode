import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

const emptyDay = () => ({ visits: 0, created: 0, started: 0, ended: 0, joins: 0, telemetry: 0, alerts: 0 });

/** Aggregate counters contain no code, participant names, IPs or access tokens. */
export class AnalyticsStore {
  constructor(dataDir) {
    this.file = path.join(dataDir, "analytics.json");
    this.data = { since: Date.now(), days: {}, languages: {}, recent: [] };
    this.queue = Promise.resolve();
  }

  async init() {
    try {
      this.data = JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  record(change) {
    const job = this.queue.catch(() => {}).then(async () => {
      const next = structuredClone(this.data);
      change(next);
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(next));
      await rename(tmp, this.file);
      this.data = next;
    });
    this.queue = job;
    return job;
  }

  day(data, timestamp) {
    const key = new Date(timestamp).toISOString().slice(0, 10);
    return data.days[key] ??= emptyDay();
  }

  visit() {
    return this.record((data) => { this.day(data, Date.now()).visits++; });
  }

  session(meta, previous) {
    return this.record((data) => {
      if (!previous) {
        this.day(data, meta.createdAt).created++;
        data.languages[meta.language] = (data.languages[meta.language] ?? 0) + 1;
      }
      if (meta.startedAt && !previous?.startedAt) this.day(data, meta.startedAt).started++;
      if (meta.closedAt && !previous?.closedAt) this.day(data, meta.closedAt).ended++;
      const summary = {
        id: meta.id, createdAt: meta.createdAt, startedAt: meta.startedAt ?? null,
        closedAt: meta.closedAt ?? null, language: meta.language, status: meta.status,
      };
      data.recent = [summary, ...data.recent.filter((s) => s.id !== meta.id)]
        .sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
    });
  }

  events(events) {
    return this.record((data) => {
      for (const event of events) {
        const day = this.day(data, event.srvTs ?? Date.now());
        day.telemetry++;
        if (event.type === "session_join") day.joins++;
        if (event.sev === "warn" || event.sev === "alert") day.alerts++;
      }
    });
  }

  async snapshot(days, rooms) {
    await this.queue;
    const daily = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() - i);
      const key = date.toISOString().slice(0, 10);
      daily.push({ date: key, ...(this.data.days[key] ?? emptyDay()) });
    }
    const sum = (rows) => rows.reduce((total, day) => {
      for (const key of Object.keys(emptyDay())) total[key] += day[key];
      return total;
    }, emptyDay());
    return {
      since: this.data.since, daily, totals: sum(daily), lifetime: sum(Object.values(this.data.days)),
      languages: this.data.languages, recent: this.data.recent,
      online: [...rooms.values()].reduce((n, room) => n + room.participantCount, 0),
      liveInterviews: [...rooms.values()].filter((room) => room.meta.status === "active" && room.participantCount > 0).length,
    };
  }
}

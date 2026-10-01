import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../src/store.js";

test("statistics survive restart and session deletion; updates do not duplicate interviews", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "intercode-analytics-"));
  try {
    const store = new SessionStore(dir);
    await store.init();
    const now = Date.now();
    const meta = { id: "testsession", createdAt: now, language: "python", status: "active", tokens: { interviewer: "secret" }, initialCode: "private code" };
    await store.saveSessionMeta(meta);
    meta.startedAt = now;
    await Promise.all([store.saveSessionMeta(meta), store.saveSessionMeta(meta)]);
    meta.status = "ended";
    meta.closedAt = now + 1;
    await Promise.all([store.saveSessionMeta(meta), store.saveSessionMeta(meta)]);
    await Promise.all(Array.from({ length: 10 }, () => store.analytics.visit()));
    await store.appendTelemetry(meta.id, [
      { srvTs: now, type: "session_join", sev: "info", p: { name: "private name" } },
      { srvTs: now, type: "paste", sev: "alert" },
    ]);
    await store.deleteSession(meta.id);
    const restarted = new SessionStore(dir);
    await restarted.init();
    const result = await restarted.analytics.snapshot(7, new Map());
    assert.deepEqual(result.totals, { visits: 10, created: 1, started: 1, ended: 1, joins: 1, telemetry: 2, alerts: 1 });
    assert.deepEqual(result.languages, { python: 1 });
    assert.equal(result.daily.length, 7);
    assert.equal(result.recent[0].id, meta.id);
    assert.equal(result.online, 0);
    assert.doesNotMatch(JSON.stringify(result), /secret|private code|private name|tokens/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("period counters use UTC event dates, online comes from live rooms", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "intercode-analytics-"));
  try {
    const store = new SessionStore(dir);
    await store.init();
    await store.analytics.events([{ srvTs: Date.now() - 100 * 86400000, type: "paste", sev: "warn" }]);
    const result = await store.analytics.snapshot(30, new Map([
      ["one", { participantCount: 2, meta: { status: "active" } }],
      ["two", { participantCount: 1, meta: { status: "ended" } }],
    ]));
    assert.equal(result.totals.telemetry, 0);
    assert.equal(result.lifetime.telemetry, 1);
    assert.equal(result.online, 3);
    assert.equal(result.liveInterviews, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

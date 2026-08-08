import { create } from "zustand";
import type { TelemetryEvent } from "@/types";

interface FeedState {
  events: TelemetryEvent[];
  counts: Record<string, number>;
  alertCount: number;
  addEvents: (incoming: TelemetryEvent[]) => void;
  clear: () => void;
}

function summarize(events: TelemetryEvent[]): Pick<FeedState, "counts" | "alertCount"> {
  const counts: Record<string, number> = {};
  let alertCount = 0;
  for (const event of events) {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    if (event.sev === "alert") alertCount += 1;
  }
  return { counts, alertCount };
}

export const useTelemetryFeed = create<FeedState>((set, get) => ({
  events: [],
  counts: {},
  alertCount: 0,
  addEvents: (incoming) => {
    if (incoming.length === 0) return;
    const existing = new Set(get().events.map((event) => event.id));
    const fresh = incoming.filter((event) => !existing.has(event.id));
    if (fresh.length === 0) return;
    const events = [...fresh, ...get().events]
      .sort((a, b) => (b.srvTs ?? b.ts) - (a.srvTs ?? a.ts))
      .slice(0, 5000);
    set({ events, ...summarize(events) });
  },
  clear: () => set({ events: [], counts: {}, alertCount: 0 }),
}));

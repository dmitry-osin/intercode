import { useEffect, useRef } from "react";
import { Bell, ChevronDown, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatTime } from "@/lib/format";
import { saveTelemetryHistory } from "@/session/store";
import { useTelemetryFeed } from "@/telemetry/feed";
import type { TelemetrySeverity } from "@/types";
import { playAlertTone } from "./sound";
import { describeTelemetryEvent, telemetryTypeLabels } from "./telemetryDescriptions";

const severityLabels: Record<TelemetrySeverity, string> = {
  info: "инфо",
  warn: "внимание",
  alert: "критично",
};

function severityClass(severity: TelemetrySeverity): string {
  if (severity === "alert") return "bg-destructive text-white";
  if (severity === "warn") return "bg-[hsl(var(--warn))] text-black";
  return "bg-secondary text-secondary-foreground";
}

export function TelemetryPanel({ sessionId, clockOffset }: { sessionId: string; clockOffset: number }) {
  const { events, counts, alertCount } = useTelemetryFeed();
  const lastAlertId = useRef<string | null>(null);

  useEffect(() => {
    saveTelemetryHistory(sessionId, events);
  }, [events, sessionId]);

  useEffect(() => {
    const latestAlert = events.find((event) => event.sev === "alert");
    if (latestAlert && latestAlert.id !== lastAlertId.current) {
      lastAlertId.current = latestAlert.id;
      playAlertTone();
    }
  }, [events]);

  return (
    <Card className="min-h-[320px]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Телеметрия кандидата
            </CardTitle>
            <CardDescription>Сигналы для интервьюера, а не гарантия честности.</CardDescription>
          </div>
          <Badge variant={alertCount > 0 ? "destructive" : "secondary"} className="gap-1">
            <Bell className="h-3 w-3" />
            {alertCount} alert
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1 pt-2">
          {Object.entries(counts).slice(0, 8).map(([type, count]) => (
            <Badge key={type} variant="outline">
              {telemetryTypeLabels[type as keyof typeof telemetryTypeLabels] ?? type}: {count}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Подозрительных событий пока нет.
          </div>
        ) : (
          <ScrollArea className="h-[360px] pr-3">
            <div className="space-y-2">
              {events.map((event) => (
                <article key={event.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full severity-dot-${event.sev}`} />
                      <div>
                        <strong className="text-sm">{telemetryTypeLabels[event.type]}</strong>
                        <p className="mt-1 text-sm text-muted-foreground">{describeTelemetryEvent(event)}</p>
                      </div>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">{formatTime(event.ts + clockOffset)}</time>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Badge className={severityClass(event.sev)}>{severityLabels[event.sev]}</Badge>
                    <span className="text-xs text-muted-foreground">тип: {event.type}</span>
                  </div>
                  <Collapsible className="mt-3 rounded-lg border bg-muted/40">
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="group h-8 w-full justify-between px-3 text-xs"
                      >
                        Технические детали
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-t px-3 py-2">
                      <dl className="grid gap-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center justify-between gap-3">
                          <dt>Участник</dt>
                          <dd className="font-mono">{event.actor}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>ID события</dt>
                          <dd className="max-w-[210px] truncate font-mono" title={event.id}>{event.id}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>Серверное время</dt>
                          <dd className="font-mono">{event.srvTs ? formatTime(event.srvTs) : "нет"}</dd>
                        </div>
                      </dl>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-2 text-xs text-muted-foreground">
                        {JSON.stringify(event.p, null, 2)}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                </article>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

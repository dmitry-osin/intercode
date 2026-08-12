import { useEffect, useRef } from "react";
import { Bell, Info, ShieldAlert } from "lucide-react";
import { useI18n } from "@/app/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import { saveTelemetryHistory } from "@/session/store";
import { useTelemetryFeed } from "@/telemetry/feed";
import type { TelemetrySeverity, TelemetryType } from "@/types";
import { playAlertTone } from "./sound";
import { describeTelemetryEvent, telemetryTypeLabel } from "./telemetryDescriptions";

/** Цвет карточки события по степени опасности — заменяет отдельный текстовый бейдж
 *  снизу карточки, чтобы список читался быстрее (левая полоса + лёгкий фон). */
function severityCardClass(severity: TelemetrySeverity): string {
  if (severity === "alert") return "border-l-4 border-l-[hsl(var(--alert))] bg-[hsl(var(--alert)/6%)]";
  if (severity === "warn") return "border-l-4 border-l-[hsl(var(--warn))] bg-[hsl(var(--warn)/8%)]";
  return "border-l-4 border-l-[hsl(var(--ok))]";
}

export function TelemetryPanel({
  sessionId,
  clockOffset,
  className,
}: {
  sessionId: string;
  clockOffset: number;
  className?: string;
}) {
  const { t } = useI18n();
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
    <Card className={`flex min-h-0 flex-col overflow-hidden ${className ?? ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              {t("telemetry.title")}
            </CardTitle>
            <CardDescription>{t("telemetry.subtitle")}</CardDescription>
          </div>
          <Badge variant={alertCount > 0 ? "destructive" : "secondary"} className="gap-1">
            <Bell className="h-3 w-3" />
            {t("telemetry.alerts", { count: alertCount })}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1 pt-2">
          {Object.entries(counts).slice(0, 8).map(([type, count]) => (
            <Badge key={type} variant="outline">
              {telemetryTypeLabel(t, type as TelemetryType)}: {count}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {events.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("telemetry.empty")}
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 pr-3">
            <div className="space-y-2">
              {events.map((event) => (
                <article
                  key={event.id}
                  className={cn("rounded-xl border p-3 transition-colors", severityCardClass(event.sev))}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full severity-dot-${event.sev}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <strong className="text-sm">{telemetryTypeLabel(t, event.type)}</strong>
                        <p className="mt-0.5 text-sm text-muted-foreground">{describeTelemetryEvent(t, event)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <time className="text-xs text-muted-foreground">{formatTime(event.ts + clockOffset)}</time>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 text-muted-foreground"
                            aria-label={t("telemetry.details")}
                            title={t("telemetry.details")}
                          >
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 space-y-2 text-xs">
                          <dl className="grid gap-1.5 text-muted-foreground">
                            <div className="flex items-center justify-between gap-3">
                              <dt>{t("telemetry.actor")}</dt>
                              <dd className="font-mono">{event.actor}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt>{t("telemetry.eventId")}</dt>
                              <dd className="max-w-[170px] truncate font-mono" title={event.id}>
                                {event.id}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt>{t("telemetry.serverTime")}</dt>
                              <dd className="font-mono">
                                {event.srvTs ? formatTime(event.srvTs) : t("telemetry.noServerTime")}
                              </dd>
                            </div>
                          </dl>
                          <pre className="overflow-x-auto rounded-lg bg-muted p-2 text-muted-foreground">
                            {JSON.stringify(event.p, null, 2)}
                          </pre>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

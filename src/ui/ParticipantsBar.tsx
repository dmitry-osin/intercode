import { useI18n } from "@/app/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Participant } from "@/types";
import { roleLabelKeys } from "@/types";

export function ParticipantsBar({ participants }: { participants: Participant[] }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("room.participants", { count: participants.length })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("room.participants.empty")}</p>
        ) : (
          participants.map((participant) => (
            <div key={participant.clientId} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: participant.color }}
                aria-hidden="true"
              />
              <span className="truncate text-sm">
                <span className="font-medium">{participant.displayName}</span>{" "}
                <span className="text-muted-foreground">({t(roleLabelKeys[participant.role])})</span>
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

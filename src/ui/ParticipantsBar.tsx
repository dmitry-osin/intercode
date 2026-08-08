import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Participant } from "@/types";
import { roleLabels } from "@/types";

export function ParticipantsBar({ participants }: { participants: Participant[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Участники · {participants.length}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока никого нет онлайн.</p>
        ) : (
          participants.map((participant) => (
            <div key={participant.clientId} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: participant.color }} />
                <span className="truncate text-sm font-medium">{participant.displayName}</span>
              </div>
              <Badge variant="secondary">{roleLabels[participant.role]}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

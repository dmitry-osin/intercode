import { Settings2 } from "lucide-react";
import { useI18n } from "@/app/i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { RoomConfig } from "@/types";

/** Иконка-переключатель античит/телеметрии, доступная интервьюеру прямо в комнате.
 *  Все изменения уходят через collab.sendMeta(...) и применяются в реальном времени
 *  на клиенте кандидата (детекторы переподключаются на новый config). */
export function AntiCheatSettings({
  config,
  onChange,
}: {
  config: RoomConfig;
  onChange: (config: RoomConfig) => void;
}) {
  const { t } = useI18n();
  const patch = (next: Partial<RoomConfig>) => onChange({ ...config, ...next });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t("room.antiCheat.trigger")}
          title={t("room.antiCheat.trigger")}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-medium">{t("room.antiCheat.title")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("room.antiCheat.subtitle")}</p>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("home.defense.block")}</span>
          <Switch checked={config.copyBlocked} onCheckedChange={(checked) => patch({ copyBlocked: checked })} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("home.defense.obfuscate")}</span>
          <Switch
            checked={config.clipboardObfuscation}
            onCheckedChange={(checked) => patch({ clipboardObfuscation: checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("home.defense.corrupt")}</span>
          <Switch
            checked={config.clipboardCorruption}
            onCheckedChange={(checked) => patch({ clipboardCorruption: checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>{t("home.defense.aiPrompt")}</span>
          <Switch
            checked={config.aiPromptInjection}
            onCheckedChange={(checked) => patch({ aiPromptInjection: checked })}
          />
        </label>
        {config.aiPromptInjection && (
          <div className="space-y-2 rounded-lg bg-muted p-3">
            <Label htmlFor="roomAiPromptText" className="text-xs">
              {t("home.defense.aiPromptText")}
            </Label>
            <Textarea
              id="roomAiPromptText"
              value={config.aiPromptText}
              onChange={(event) => patch({ aiPromptText: event.target.value })}
              className="min-h-20 text-xs"
            />
          </div>
        )}
        <label className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
          <span>{t("home.defense.devtools")}</span>
          <Switch
            checked={config.devtoolsHeuristics}
            onCheckedChange={(checked) => patch({ devtoolsHeuristics: checked })}
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}

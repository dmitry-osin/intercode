import { formatDuration } from "@/lib/format";
import type { TelemetryEvent, TelemetryType } from "@/types";

type TFunc = (key: string, vars?: Record<string, string | number>) => string;

const TELEMETRY_TYPES: TelemetryType[] = [
  "copy_attempt",
  "cut_attempt",
  "paste",
  "keystroke_combo",
  "visibility_hidden",
  "visibility_visible",
  "window_blur",
  "window_focus",
  "ctx_menu",
  "typing_burst",
  "devtools_suspect",
  "selection_dump",
  "screenshot_attempt",
  "session_join",
  "session_leave",
  "fullscreen_exit",
];

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function clipboardDefenseLabel(t: TFunc, value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const keys: Record<string, string> = {
    blocked: "tel.defense.blocked",
    obfuscation: "tel.defense.obfuscation",
    corruption: "tel.defense.corruption",
    ai_prompt: "tel.defense.ai_prompt",
  };
  return value.map((item) => (keys[String(item)] ? t(keys[String(item)]) : String(item))).join("; ");
}

function roleLabel(t: TFunc, value: unknown): string {
  if (value === "interviewer") return t("role.interviewer.short");
  if (value === "interviewee") return t("role.interviewee.short");
  if (value === "viewer") return t("role.viewer.short");
  return t("role.participant.short");
}

export function telemetryTypeLabel(t: TFunc, type: TelemetryType): string {
  return TELEMETRY_TYPES.includes(type) ? t(`tel.type.${type}`) : type;
}

export function describeTelemetryEvent(t: TFunc, event: TelemetryEvent): string {
  const payload = event.p;

  switch (event.type) {
    case "copy_attempt":
    case "cut_attempt": {
      const selectionLen = asNumber(payload.selectionLen);
      const action = asString(payload.action);
      const defense = clipboardDefenseLabel(t, payload.defenses);
      const base =
        (event.type === "copy_attempt" ? t("tel.desc.copy") : t("tel.desc.cut")) +
        (selectionLen !== null ? t("tel.desc.clipboard.selection", { len: selectionLen }) : "");
      if (action === "blocked") return `${base}${t("tel.desc.clipboard.blocked")}`;
      if (action === "poisoned") {
        return `${base}${t("tel.desc.clipboard.poisoned", { defense: defense ? ` (${defense})` : "" })}`;
      }
      return `${base}${t("tel.desc.clipboard.logged")}`;
    }
    case "paste": {
      const len = asNumber(payload.len);
      const lines = asNumber(payload.lines);
      return t("tel.desc.paste", {
        len: len ?? "?",
        lines: lines !== null ? t("tel.desc.paste.lines", { count: lines }) : "",
      });
    }
    case "keystroke_combo": {
      const combo = asString(payload.combo) ?? t("tel.desc.combo.unknown");
      return t("tel.desc.combo", { combo });
    }
    case "visibility_hidden":
      return t("tel.desc.visibilityHidden");
    case "visibility_visible": {
      const awayMs = asNumber(payload.awayMs);
      return t("tel.desc.visibilityVisible", {
        away: awayMs !== null ? t("tel.desc.away.after", { duration: formatDuration(awayMs) }) : "",
      });
    }
    case "window_blur":
      return t("tel.desc.windowBlur");
    case "window_focus": {
      const awayMs = asNumber(payload.awayMs);
      return t("tel.desc.windowFocus", {
        away: awayMs !== null ? t("tel.desc.focus.after", { duration: formatDuration(awayMs) }) : "",
      });
    }
    case "ctx_menu":
      return t("tel.desc.ctxMenu");
    case "typing_burst": {
      const chars = asNumber(payload.chars);
      const windowMs = asNumber(payload.windowMs);
      return t("tel.desc.typingBurst", {
        chars: chars ?? t("tel.desc.typingBurst.many"),
        window: windowMs !== null ? t("tel.desc.typingBurst.window", { duration: formatDuration(windowMs) }) : "",
      });
    }
    case "devtools_suspect": {
      const heuristic = asString(payload.heuristic) ?? t("tel.desc.devtools.fallback");
      return t("tel.desc.devtools", { heuristic });
    }
    case "selection_dump": {
      const len = asNumber(payload.len);
      return t("tel.desc.selection", { len: len ?? "?" });
    }
    case "screenshot_attempt": {
      const combo = asString(payload.combo) ?? "PrintScreen";
      return t("tel.desc.screenshot", { combo });
    }
    case "session_join": {
      const name = asString(payload.name) ?? event.actor;
      return t("tel.desc.join", { name, role: roleLabel(t, payload.role) });
    }
    case "session_leave": {
      const name = asString(payload.name) ?? event.actor;
      return t("tel.desc.leave", { name, role: roleLabel(t, payload.role) });
    }
    case "fullscreen_exit":
      return t("tel.desc.fullscreenExit");
    default:
      return telemetryTypeLabel(t, event.type);
  }
}

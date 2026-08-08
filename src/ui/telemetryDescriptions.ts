import { formatDuration } from "@/lib/format";
import type { TelemetryEvent, TelemetryType } from "@/types";

export const telemetryTypeLabels: Record<TelemetryType, string> = {
  copy_attempt: "Попытка копирования",
  cut_attempt: "Попытка вырезания",
  paste: "Вставка текста",
  keystroke_combo: "Подозрительная комбинация клавиш",
  visibility_hidden: "Кандидат покинул вкладку",
  visibility_visible: "Кандидат вернулся во вкладку",
  window_blur: "Окно потеряло фокус",
  window_focus: "Фокус вернулся в окно",
  ctx_menu: "Открыто контекстное меню",
  typing_burst: "Аномально быстрый ввод",
  devtools_suspect: "Подозрение на DevTools",
  selection_dump: "Размер выделения",
  session_join: "Участник подключился",
  session_leave: "Участник отключился",
  fullscreen_exit: "Выход из полноэкранного режима",
};

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function clipboardDefenseLabel(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const labels: Record<string, string> = {
    blocked: "буфер очищен",
    obfuscation: "идентификаторы обфусцированы",
    corruption: "добавлены UUID и дубли строк",
    ai_prompt: "добавлена AI-инструкция",
  };
  return value.map((item) => labels[String(item)] ?? String(item)).join("; ");
}

function roleLabel(value: unknown): string {
  if (value === "interviewer") return "интервьюер";
  if (value === "interviewee") return "собеседуемый";
  if (value === "viewer") return "зритель";
  return "участник";
}

export function describeTelemetryEvent(event: TelemetryEvent): string {
  const payload = event.p;

  switch (event.type) {
    case "copy_attempt":
    case "cut_attempt": {
      const selectionLen = asNumber(payload.selectionLen);
      const action = asString(payload.action);
      const defense = clipboardDefenseLabel(payload.defenses);
      const base = `${event.type === "copy_attempt" ? "Копирование" : "Вырезание"}${selectionLen !== null ? ` выделения ${selectionLen} символов` : ""}`;
      if (action === "blocked") return `${base}: операция заблокирована, буфер очищен.`;
      if (action === "poisoned") return `${base}: clipboard подменён защищённой копией${defense ? ` (${defense})` : ""}.`;
      return `${base}: операция зафиксирована без подмены.`;
    }
    case "paste": {
      const len = asNumber(payload.len);
      const lines = asNumber(payload.lines);
      return `Вставлено ${len ?? "?"} символов${lines !== null ? ` в ${lines} строках` : ""}.`;
    }
    case "keystroke_combo": {
      const combo = asString(payload.combo) ?? "неизвестная комбинация";
      return `Нажата зарегистрированная комбинация ${combo}.`;
    }
    case "visibility_hidden":
      return "Вкладка стала скрытой: кандидат переключился или свернул окно.";
    case "visibility_visible": {
      const awayMs = asNumber(payload.awayMs);
      return `Кандидат вернулся во вкладку${awayMs !== null ? ` спустя ${formatDuration(awayMs)}` : ""}.`;
    }
    case "window_blur":
      return "Окно браузера потеряло фокус.";
    case "window_focus": {
      const awayMs = asNumber(payload.awayMs);
      return `Фокус вернулся в окно${awayMs !== null ? ` после ${formatDuration(awayMs)}` : ""}.`;
    }
    case "ctx_menu":
      return "Правый клик по редактору: открыто контекстное меню.";
    case "typing_burst": {
      const chars = asNumber(payload.chars);
      const windowMs = asNumber(payload.windowMs);
      return `Зафиксирован всплеск ввода: ${chars ?? "много"} символов${windowMs !== null ? ` за ${formatDuration(windowMs)}` : ""} без paste-события.`;
    }
    case "devtools_suspect": {
      const heuristic = asString(payload.heuristic) ?? "эвристика";
      return `Сработала эвристика DevTools (${heuristic}).`;
    }
    case "selection_dump": {
      const len = asNumber(payload.len);
      return `Текущий размер выделения: ${len ?? "?"} символов.`;
    }
    case "session_join": {
      const name = asString(payload.name) ?? event.actor;
      return `${name} подключился как ${roleLabel(payload.role)}.`;
    }
    case "session_leave": {
      const name = asString(payload.name) ?? event.actor;
      return `${name} (${roleLabel(payload.role)}) отключился.`;
    }
    case "fullscreen_exit":
      return "Кандидат вышел из полноэкранного режима.";
    default:
      return telemetryTypeLabels[event.type];
  }
}

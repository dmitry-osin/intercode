import { randomBytes, randomUUID } from "node:crypto";

/** Идентификатор сессии и токены генерируются ТОЛЬКО на сервере (§4 ТЗ). */
export function newSessionId() {
  return randomBytes(9).toString("base64url"); // 12 символов
}

export function newToken() {
  return randomBytes(16).toString("base64url"); // 22 символа
}

export function newEventId() {
  return randomUUID();
}

const ROLE_CODES = { i: "interviewer", e: "interviewee", v: "viewer" };

export function roleFromCode(code) {
  return ROLE_CODES[code] ?? null;
}

const SEVERITY = { info: 0, warn: 1, alert: 2 };

export function maxSeverity(a, b) {
  return (SEVERITY[b] ?? 0) > (SEVERITY[a] ?? 0) ? b : a;
}

/** Реестр типов телеметрии и базовая критичность (зеркало клиентского реестра, §7 ТЗ).
 *  ВАЖНО: ключи должны совпадать с клиентским TelemetryType (src/types/index.ts) —
 *  неизвестные типы отбрасываются в normalizeTelemetryEvent. */
export const TELEMETRY_BASE_SEVERITY = {
  copy_attempt: "alert",
  cut_attempt: "alert",
  paste: "warn",
  keystroke_combo: "warn",
  visibility_hidden: "warn",
  visibility_visible: "warn",
  window_blur: "warn",
  window_focus: "warn",
  ctx_menu: "warn",
  typing_burst: "warn",
  devtools_suspect: "warn",
  selection_dump: "info",
  screenshot_attempt: "warn",
  session_join: "info",
  session_leave: "info",
  fullscreen_exit: "warn",
};

const KNOWN_TYPES = new Set(Object.keys(TELEMETRY_BASE_SEVERITY));
const MAX_PAYLOAD_BYTES = 4096;

/**
 * Валидация и нормализация события телеметрии от клиента.
 * Сервер добавляет srvTs, пересчитывает sev, отсекает мусор.
 * Возвращает null, если событие нужно отбросить.
 */
export function normalizeTelemetryEvent(raw, fallbackActor, config) {
  if (!raw || typeof raw !== "object") return null;
  const type = typeof raw.type === "string" ? raw.type : "";
  if (!KNOWN_TYPES.has(type)) return null;
  // Клиент присылает свой clientId как actor — сохраняем, иначе подставляем роль соединения.
  const actor =
    typeof raw.actor === "string" && raw.actor.length > 0 && raw.actor.length <= 64
      ? raw.actor
      : fallbackActor;
  const ts = Number.isFinite(raw.ts) ? Number(raw.ts) : Date.now();
  let p = raw.p && typeof raw.p === "object" && !Array.isArray(raw.p) ? raw.p : {};
  try {
    if (JSON.stringify(p).length > MAX_PAYLOAD_BYTES) p = { truncated: true };
  } catch {
    p = { truncated: true };
  }
  let sev = TELEMETRY_BASE_SEVERITY[type] ?? "info";
  // Вставка >N символов или >M строк → alert (§6 ТЗ).
  if (type === "paste" && config?.pasteThresholdAlert !== false) {
    const len = Number(p.len ?? 0);
    const lines = Number(p.lines ?? 1);
    if (len > 50 || lines > 3) sev = "alert";
  }
  if (type === "devtools_suspect") sev = "alert";
  return {
    id: typeof raw.id === "string" && raw.id.length <= 64 ? raw.id : newEventId(),
    actor,
    ts,
    srvTs: Date.now(),
    type,
    sev,
    p,
  };
}

const MAX_NAME_LEN = 40;

export function sanitizeDisplayName(raw, fallback) {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().slice(0, MAX_NAME_LEN);
  return trimmed || fallback;
}

/** Ключи RoomConfig, которые кандидат/наблюдатель могут получить с сервера
 *  и которые интервьюер может менять в реальном времени из комнаты (§ анти-чит UI). */
export const CONFIG_KEYS = [
  "copyBlocked",
  "clipboardObfuscation",
  "clipboardCorruption",
  "aiPromptInjection",
  "pasteThresholdAlert",
  "devtoolsHeuristics",
];

/** Валидация патча RoomConfig: пропускаем только известные булевы ключи
 *  плюс текст AI-инструкции (обрезаем по длине). Используется и при создании
 *  сессии, и при live-обновлении настроек интервьюером через WS. */
export function sanitizeConfig(raw) {
  const config = {};
  if (raw && typeof raw === "object") {
    for (const key of CONFIG_KEYS) {
      if (typeof raw[key] === "boolean") config[key] = raw[key];
    }
    if (typeof raw.aiPromptText === "string") {
      config.aiPromptText = raw.aiPromptText.slice(0, 4000);
    }
  }
  return config;
}

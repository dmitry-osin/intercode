import type { Role, RoleCode, SessionMeta } from "@/types";

export function roleFromCode(code: string | null): Role | null {
  if (code === "i") return "interviewer";
  if (code === "e") return "interviewee";
  if (code === "v") return "viewer";
  return null;
}

export function codeFromRole(role: Role): RoleCode {
  if (role === "interviewer") return "i";
  if (role === "interviewee") return "e";
  return "v";
}

export function canEdit(role: Role): boolean {
  return role === "interviewer" || role === "interviewee";
}

export function canControlRoom(role: Role): boolean {
  return role === "interviewer";
}

export function canSeeTelemetry(role: Role): boolean {
  return role === "interviewer";
}

export function validateToken(meta: SessionMeta, role: Role, token: string | null): boolean {
  return Boolean(token && meta.tokens[role] === token);
}

/** Ссылка на комнату для конкретной роли: .../#/s/{id}?r={i|e|v}&k={token}. */
export function sessionLink(meta: SessionMeta, role: Role): string {
  const url = new URL(window.location.href);
  url.hash = `/s/${meta.id}?r=${codeFromRole(role)}&k=${meta.tokens[role]}`;
  url.search = "";
  return url.href;
}

const palette = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be185d", "#4f46e5"];

export function colorForClient(clientId: string): string {
  let hash = 0;
  for (const char of clientId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

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

/** Фиксированный цвет-маркер роли — используется для кружка рядом с именем участника. */
const roleColors: Record<Role, string> = {
  interviewer: "#2563eb", // синий
  interviewee: "#16a34a", // зелёный
  viewer: "#9333ea", // фиолетовый
};

export function roleColor(role: Role): string {
  return roleColors[role];
}

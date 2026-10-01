const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";
let recorded = false;

/** One page load, including reloads; admin page loads are excluded. */
export function recordVisit() {
  if (recorded || /^#\/?admin(?:\?|$)/.test(window.location.hash)) return;
  recorded = true;
  void fetch(`${apiBase}/api/analytics/visit`, { method: "POST", keepalive: true }).catch(() => {});
}

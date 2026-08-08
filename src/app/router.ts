import { useSyncExternalStore } from "react";
import type { BaseLocationHook } from "wouter";

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void): () => void {
  if (listeners.size === 0) window.addEventListener("hashchange", notify);
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) window.removeEventListener("hashchange", notify);
  };
}

function rawHash(): string {
  return window.location.hash.replace(/^#\/?/, "");
}

function currentPath(): string {
  const [path = ""] = rawHash().split("?");
  return `/${path}`;
}

function currentSearch(): string {
  const [, search = ""] = rawHash().split("?");
  return search;
}

export function navigateHash(to: string, options: { replace?: boolean } = {}): void {
  const oldURL = window.location.href;
  const [path = "", search = ""] = to.replace(/^#?\/?/, "").split("?");
  const url = new URL(window.location.href);
  url.hash = `/${path}${search ? `?${search}` : ""}`;
  if (options.replace) window.history.replaceState(null, "", url.href);
  else window.history.pushState(null, "", url.href);
  const event =
    typeof HashChangeEvent === "function"
      ? new HashChangeEvent("hashchange", { oldURL, newURL: url.href })
      : new Event("hashchange");
  window.dispatchEvent(event);
}

export const useIntercodeHashLocation: BaseLocationHook = () => [
  useSyncExternalStore(subscribe, currentPath, () => "/"),
  navigateHash,
];

function useHashSearch(): string {
  return useSyncExternalStore(subscribe, currentSearch, () => "");
}

useIntercodeHashLocation.searchHook = useHashSearch;
useIntercodeHashLocation.hrefs = (href: string) => `#${href}`;

"use client";

import type { WallManifest } from "./types";

const KEY = "lpw-wall-key";
const MANIFEST = "lpw-manifest";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const wallStore = {
  key: () => safe(() => localStorage.getItem(KEY), null),
  setKey: (k: string) => safe(() => localStorage.setItem(KEY, k), undefined),
  clearKey: () => safe(() => (localStorage.removeItem(KEY), localStorage.removeItem(MANIFEST)), undefined),
  manifest: (): WallManifest | null => safe(() => JSON.parse(localStorage.getItem(MANIFEST) ?? "null"), null),
  setManifest: (m: WallManifest) => safe(() => localStorage.setItem(MANIFEST, JSON.stringify(m)), undefined),
};

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/** Ask the service worker how many of these URLs are stored on disk. */
export function countCached(urls: string[]): Promise<number | null> {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) return resolve(null);
    const id = Math.random().toString(36).slice(2);
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "cached-count" && e.data.id === id) {
        navigator.serviceWorker.removeEventListener("message", onMsg);
        resolve(e.data.count);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    sw.postMessage({ type: "count-cached", id, urls });
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener("message", onMsg);
      resolve(null);
    }, 10000);
  });
}


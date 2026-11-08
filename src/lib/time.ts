export function ago(ms: number | Date | null | undefined, now = Date.now()): string {
  if (ms === null || ms === undefined) return "never";
  const t = typeof ms === "number" ? ms : ms.getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function bytes(n: number | null | undefined) {
  if (!n) return "0 MB";
  if (n > 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  return `${Math.max(0.1, n / 1e6).toFixed(1)} MB`;
}

/** Current time for server components (these pages are dynamic, so reading the clock is fine). */
export function serverNow() {
  return new Date().getTime();
}

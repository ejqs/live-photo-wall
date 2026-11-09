"use client";

/**
 * The wall page posts its state over a BroadcastChannel once a second, and the stats window
 * (/wall/stats, same browser) sends commands back. Nothing here goes over the network.
 */

export const STATS_CHANNEL = "lpw-wall-stats";

export type LogKind = "start" | "sync" | "net" | "cache" | "shown" | "skip" | "warn" | "remove" | "admin" | "reload";
export type LogEntry = { at: number; k: LogKind; m: string };

/** bump when WallStatsMessage changes shape, so a stats window can spot a wall running older code */
export const STATS_VERSION = 2;

export type WallStatsMessage = {
  type: "stats";
  v: number;
  wallName: string;
  key: string;
  online: boolean;
  /** ms epoch of the last successful contact with the server */
  lastSyncAt: number | null;
  startedAt: number;
  manifestVersion: number;
  /** the version the server reported on the last heartbeat */
  serverVersion: number | null;
  designVersion: number;
  motionVersion: number;
  ready: number;
  total: number;
  failed: number;
  cachedOnDisk: number | null;
  storage: { usage: number | null; persisted: boolean | null };
  swaps: number;
  every: number;
  changing: number;
  limit: number;
  maxChanging: number;
  priority: number;
  fps: number | null;
  /** frames that took over 50 ms in the last 10 minutes */
  slowFrames: number;
  fontsLoaded: boolean;
  showQr: boolean;
  wakeLock: boolean;
  lastWatchdogReload: number | null;
  upNext: string[];
  /** photo id per cell, reading order */
  cells: (string | null)[];
  /** cells the QR card sits in (optional: older walls don't send it) */
  qrCells?: number[];
  /** cells under a floating QR card, which only show roster photos */
  rosterCells?: number[];
  grid: { cols: number; rows: number };
  /** the wall window's width / height, for the mirror */
  aspect: number;
  warning: string | null;
  fastLane: { photoId: string; at: number } | null;
  log: LogEntry[];
  at: number;
};

export type WallCommand =
  | { type: "command"; cmd: "resync" | "reload" }
  | { type: "note"; k: LogKind; m: string };

const LOG_KEY = "lpw-wall-log";
const WATCHDOG_KEY = "lpw-watchdog-reload";
const MAX_LOG = 300;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** A small event log kept in localStorage, so it survives the wall reloading itself. */
export const wallLog = {
  read: (): LogEntry[] => safe(() => JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[], []),
  add(k: LogKind, m: string): LogEntry[] {
    const next = [{ at: Date.now(), k, m }, ...wallLog.read()].slice(0, MAX_LOG);
    safe(() => localStorage.setItem(LOG_KEY, JSON.stringify(next)), undefined);
    return next;
  },
};

export const watchdogStore = {
  last: () => safe(() => Number(localStorage.getItem(WATCHDOG_KEY)) || null, null),
  mark: () => safe(() => localStorage.setItem(WATCHDOG_KEY, String(Date.now())), undefined),
};

export function formatLogLine(e: LogEntry) {
  return `${new Date(e.at).toLocaleTimeString([], { hour12: false })}  ${e.k.padEnd(6)}  ${e.m}`;
}

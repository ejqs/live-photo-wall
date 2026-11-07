import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { publish } from "./bus";
import { DEFAULTS, type SettingsKey, type SettingsMap } from "./settings-types";

export * from "./settings-types";

function merge<T>(def: T, value: unknown): T {
  if (Array.isArray(def) || typeof def !== "object" || def === null) return (value ?? def) as T;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return def;
  const out: Record<string, unknown> = { ...(def as Record<string, unknown>) };
  for (const [k, v] of Object.entries(value)) {
    const d = (def as Record<string, unknown>)[k];
    out[k] = d !== undefined && typeof d === "object" && d !== null && !Array.isArray(d) ? merge(d, v) : v;
  }
  return out as T;
}

export async function getSetting<K extends SettingsKey>(key: K): Promise<SettingsMap[K]> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return merge(DEFAULTS[key], row?.value);
}

export async function getSettings<K extends SettingsKey>(keys: K[]): Promise<Pick<SettingsMap, K>> {
  const rows = await db.select().from(settings);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(keys.map((k) => [k, merge(DEFAULTS[k], byKey.get(k))])) as Pick<SettingsMap, K>;
}

export async function setSetting<K extends SettingsKey>(key: K, value: SettingsMap[K]): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, version: sql`${settings.version} + 1`, updatedAt: new Date() },
    });
}

export async function updateSetting<K extends SettingsKey>(
  key: K,
  fn: (current: SettingsMap[K]) => SettingsMap[K],
): Promise<SettingsMap[K]> {
  const next = fn(await getSetting(key));
  await setSetting(key, next);
  return next;
}

/** Walls re-download their manifest when this number changes. */
export async function bumpManifest(): Promise<number> {
  const rows = await db
    .insert(settings)
    .values({ key: "manifest", value: { version: 2 } })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: sql`jsonb_build_object('version', coalesce((${settings.value}->>'version')::int, 1) + 1)`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: settings.value });
  const version = (rows[0]?.value as { version: number }).version;
  publish({ type: "manifest", version });
  return version;
}

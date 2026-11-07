import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, walls } from "@/db/schema";
import type { WallManifest } from "@/wall/types";
import { BUILTIN_ID, WHITEN_AND_DROP, checkEffect, paramDefaults } from "@/wallmotion";
import { guestLinkUrl } from "./guest";
import { rotationPhotos } from "./photos";
import { getSettings, type MotionSettings } from "./settings";

export async function wallByKey(key: string) {
  if (!key || key.length > 40) return null;
  return (await db.query.walls.findFirst({ where: eq(walls.key, key.trim().toUpperCase()) })) ?? null;
}

export function assetUrl(id: string) {
  return `/a/${id}`;
}

/** Resolve the active effect (falls back to the built-in one if a custom effect is broken). */
export function activeEffect(motion: MotionSettings) {
  const custom = motion.custom.find((c) => c.id === motion.effectId);
  if (motion.effectId !== BUILTIN_ID && custom) {
    const res = checkEffect(custom.code);
    if (res.ok) {
      return {
        code: custom.code,
        name: res.doc.name,
        params: { ...paramDefaults(res.doc), ...(motion.params[custom.id] ?? {}) },
      };
    }
  }
  return { code: JSON.stringify(WHITEN_AND_DROP), name: WHITEN_AND_DROP.name, params: {} };
}

export async function buildManifest(wall: typeof walls.$inferSelect): Promise<WallManifest> {
  const s = await getSettings(["event", "design", "motion", "playlist", "manifest"]);
  const [list, assetRows, qrUrl] = await Promise.all([rotationPhotos(), db.select().from(assets), guestLinkUrl()]);
  const effect = activeEffect(s.motion);
  return {
    version: s.manifest.version,
    wall: {
      id: wall.id,
      name: wall.name,
      cols: wall.cols ?? s.motion.sliders.cols,
      rows: wall.rows ?? s.motion.sliders.rows,
      showQr: wall.showQr,
      primary: wall.primary,
    },
    eventName: s.event.name,
    design: s.design.published,
    designVersion: s.design.publishedVersion,
    motion: { version: s.motion.version, sliders: s.motion.sliders, effect: effect.code, effectName: effect.name, params: effect.params },
    playlist: s.playlist,
    qrUrl,
    fonts: assetRows.filter((a) => a.kind === "font").map((a) => ({ id: a.id, family: `lpw-${a.id.slice(0, 8)}`, url: assetUrl(a.id) })),
    assets: Object.fromEntries(assetRows.filter((a) => a.kind === "image").map((a) => [a.id, assetUrl(a.id)])),
    photos: list.map((p) => ({
      id: p.id,
      hash: p.hash,
      source: p.source,
      name: p.guestName,
      caption: p.caption,
      w: p.width,
      h: p.height,
      at: (p.decidedAt ?? p.createdAt).getTime(),
    })),
    resyncAt: wall.resyncAt?.getTime() ?? null,
  };
}

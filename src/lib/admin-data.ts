import "server-only";
import { asc, desc, eq, sum } from "drizzle-orm";
import { db } from "@/db";
import { photos, walls } from "@/db/schema";
import { imgUrl } from "@/wall/types";
import type { QueueItem } from "@/components/admin/approval-queue";

export async function pendingItems(limit = 200): Promise<QueueItem[]> {
  const rows = await db.select().from(photos).where(eq(photos.status, "pending")).orderBy(asc(photos.createdAt)).limit(limit);
  return rows.map((p) => ({
    id: p.id,
    thumb: imgUrl("thumb", p.hash),
    view: imgUrl("view", p.hash),
    who: p.guestName ?? "Guest",
    caption: p.caption,
    createdAt: p.createdAt.getTime(),
    takenAt: p.takenAt?.getTime() ?? null,
    w: p.width,
    h: p.height,
  }));
}

export async function wallList() {
  return db.select().from(walls).orderBy(desc(walls.primary), asc(walls.createdAt));
}

export async function totalBytes() {
  const [r] = await db.select({ n: sum(photos.bytes) }).from(photos);
  return Number(r?.n ?? 0);
}

export const ONLINE_MS = 45_000;

export type PhotoRow = {
  id: string;
  thumb: string;
  view: string;
  source: "guest" | "roster";
  who: string;
  caption: string | null;
  originalCaption: string | null;
  fileName: string | null;
  status: "pending" | "approved" | "rejected";
  removed: boolean;
  firstShownAt: number | null;
  createdAt: number;
};

export async function photoRows(): Promise<PhotoRow[]> {
  const rows = await db.select().from(photos).orderBy(desc(photos.createdAt)).limit(5000);
  return rows.map((p) => ({
    id: p.id,
    thumb: imgUrl("thumb", p.hash),
    view: imgUrl("view", p.hash),
    source: p.source,
    who: p.guestName ?? (p.source === "roster" ? "Roster" : "Guest"),
    caption: p.caption,
    originalCaption: p.originalCaption,
    fileName: p.fileName,
    status: p.status,
    removed: !!p.removedAt,
    firstShownAt: p.firstShownAt?.getTime() ?? null,
    createdAt: p.createdAt.getTime(),
  }));
}

export type AssetItem = { id: string; kind: "font" | "image"; name: string; url: string; width: number | null; height: number | null; bytes: number };

export async function assetList(): Promise<AssetItem[]> {
  const { assets } = await import("@/db/schema");
  const rows = await db.select().from(assets).orderBy(asc(assets.createdAt));
  return rows.map((a) => ({ id: a.id, kind: a.kind, name: a.name, url: `/a/${a.id}`, width: a.width, height: a.height, bytes: a.bytes }));
}

/** A manifest for previews in the admin (design editor, motion preview). Not tied to a real wall. */
export async function previewManifest(limit = 80) {
  const { buildManifest } = await import("@/lib/manifest");
  const m = await buildManifest({
    id: "preview",
    name: "Preview",
    key: "PREVIEW",
    primary: false,
    cols: null,
    rows: null,
    showQr: true,
    resyncAt: null,
    lastSeenAt: null,
    status: null,
    createdAt: new Date(),
  });
  return { ...m, photos: m.photos.slice(0, limit) };
}

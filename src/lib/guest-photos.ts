import "server-only";
import { and, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { photos, reservations, walls } from "@/db/schema";
import { imgUrl } from "@/wall/types";

export type GuestPhotoStatus = "pending" | "approved" | "hidden";

export type GuestPhoto = {
  id: string;
  thumb: string;
  view: string;
  caption: string | null;
  status: GuestPhotoStatus;
  createdAt: number;
  firstShownAt: number | null;
  reservation: { showAt: number; row: number; col: number; rows: number; cols: number; hold: number; wallName: string } | null;
};

/** A guest's own photos. Rejected or removed photos are reported only as "hidden" (never "rejected"). */
export async function myPhotos(guestId: string): Promise<GuestPhoto[]> {
  const rows = await db.select().from(photos).where(eq(photos.guestId, guestId)).orderBy(desc(photos.createdAt)).limit(100);
  const ids = rows.map((r) => r.id);
  const res = ids.length
    ? await db
        .select({ r: reservations, wallName: walls.name })
        .from(reservations)
        .innerJoin(walls, eq(walls.id, reservations.wallId))
        .where(and(inArray(reservations.photoId, ids), gt(reservations.showAt, new Date(Date.now() - 60_000))))
        .orderBy(desc(reservations.showAt))
    : [];
  const byPhoto = new Map<string, (typeof res)[number]>();
  for (const x of res) if (!byPhoto.has(x.r.photoId)) byPhoto.set(x.r.photoId, x);
  return rows.map((p) => {
    const status: GuestPhotoStatus = p.status === "rejected" || p.removedAt ? "hidden" : p.status === "approved" ? "approved" : "pending";
    const r = status === "approved" ? byPhoto.get(p.id) : undefined;
    return {
      id: p.id,
      thumb: imgUrl("thumb", p.hash),
      view: imgUrl("view", p.hash),
      caption: p.caption,
      status,
      createdAt: p.createdAt.getTime(),
      firstShownAt: p.firstShownAt?.getTime() ?? null,
      reservation: r
        ? { showAt: r.r.showAt.getTime(), row: r.r.row, col: r.r.col, rows: r.r.rows, cols: r.r.cols, hold: r.r.holdSeconds, wallName: r.wallName }
        : null,
    };
  });
}

export async function uploadsUsed(guestId: string) {
  const [r] = await db.select({ n: count() }).from(photos).where(eq(photos.guestId, guestId));
  return r?.n ?? 0;
}

export type GalleryItem = { id: string; thumb: string; view: string; name: string | null; caption: string | null; w: number; h: number; at: number };

export async function galleryItems(): Promise<GalleryItem[]> {
  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.status, "approved"), isNull(photos.removedAt), isNull(photos.filesDeletedAt), eq(photos.source, "guest")))
    .orderBy(desc(photos.decidedAt))
    .limit(2000);
  return rows.map((p) => ({
    id: p.id,
    thumb: imgUrl("thumb", p.hash),
    view: imgUrl("view", p.hash),
    name: p.guestName,
    caption: p.caption,
    w: p.width,
    h: p.height,
    at: (p.decidedAt ?? p.createdAt).getTime(),
  }));
}

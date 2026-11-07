import "server-only";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { photos, removals, type PhotoSource } from "@/db/schema";
import { publish } from "./bus";
import { processPhoto } from "./images";
import { bumpManifest, getSetting } from "./settings";
import { HttpError } from "./session";
import { keys, storage } from "./storage";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type IngestInput = {
  buffer: Buffer;
  source: PhotoSource;
  guestId?: string | null;
  guestName?: string | null;
  caption?: string | null;
  fileName?: string | null;
  takenAt?: Date | null;
  takenAtFromExif?: boolean;
  camera?: string | null;
};

export async function ingestPhoto(input: IngestInput) {
  if (input.buffer.length > MAX_UPLOAD_BYTES) throw new HttpError(413, "That photo is larger than 25 MB.");
  let img;
  try {
    img = await processPhoto(input.buffer, { takenAt: input.takenAt, takenAtFromExif: input.takenAtFromExif, camera: input.camera });
  } catch (e) {
    console.error("image processing failed", e);
    throw new HttpError(415, "We couldn't read that file. Try a JPG or PNG.");
  }

  if (input.source === "roster") {
    const dup = await db.query.photos.findFirst({ where: and(eq(photos.hash, img.hash), eq(photos.source, "roster")) });
    if (dup) return { photo: dup, duplicate: true };
  }

  const s = storage();
  await Promise.all([
    s.put(keys.orig(img.hash), img.original, "image/jpeg"),
    s.put(keys.view(img.hash), img.view, "image/webp"),
    s.put(keys.thumb(img.hash), img.thumb, "image/webp"),
  ]);

  const autoApprove = input.source === "roster" || (await getSetting("guest")).autoApprove;
  const caption = input.caption?.trim().slice(0, 140) || null;
  const [row] = await db
    .insert(photos)
    .values({
      source: input.source,
      status: autoApprove ? "approved" : "pending",
      decidedAt: autoApprove ? new Date() : null,
      decidedBy: autoApprove ? (input.source === "roster" ? "roster" : "auto") : null,
      guestId: input.guestId ?? null,
      guestName: input.guestName?.trim().slice(0, 60) || null,
      caption,
      originalCaption: caption,
      fileName: input.fileName?.slice(0, 200) ?? null,
      hash: img.hash,
      width: img.width,
      height: img.height,
      bytes: img.original.length,
      takenAt: img.takenAt,
      takenAtSource: img.takenAtSource,
      camera: img.camera,
      sortKey: input.source === "roster" ? sortKeyFor(input.fileName ?? img.hash) : null,
    })
    .returning();

  if (row.status === "approved") {
    await bumpManifest();
    if (row.source === "guest") {
      publish({ type: "approved", photoId: row.id });
      publish({ type: "gallery" });
      if (row.guestId) publish({ type: "guest", guestId: row.guestId, photoId: row.id, status: row.status });
    }
  } else {
    publish({ type: "queue", pending: await pendingCount() });
  }
  return { photo: row, duplicate: false };
}

/** Natural sort key so "2.jpg" plays before "10.jpg". */
export function sortKeyFor(name: string) {
  return name.toLowerCase().replace(/\d+/g, (d) => d.padStart(10, "0"));
}

export async function pendingCount() {
  const [r] = await db.select({ n: count() }).from(photos).where(eq(photos.status, "pending"));
  return r?.n ?? 0;
}

export async function decide(ids: string[], decision: "approved" | "rejected", by: string) {
  if (!ids.length) return [];
  const rows = await db
    .update(photos)
    .set({ status: decision, decidedAt: new Date(), decidedBy: by })
    .where(and(inArray(photos.id, ids), eq(photos.status, "pending")))
    .returning();
  if (!rows.length) return rows;
  if (decision === "approved") {
    await bumpManifest();
    for (const r of rows) publish({ type: "approved", photoId: r.id });
    publish({ type: "gallery" });
  }
  for (const r of rows) if (r.guestId) publish({ type: "guest", guestId: r.guestId, photoId: r.id, status: r.status });
  publish({ type: "queue", pending: await pendingCount() });
  return rows;
}

/** Undo a decision (back to the queue). */
export async function reopen(id: string) {
  const [r] = await db.update(photos).set({ status: "pending", decidedAt: null, decidedBy: null }).where(eq(photos.id, id)).returning();
  if (r) {
    await bumpManifest();
    publish({ type: "gallery" });
    if (r.guestId) publish({ type: "guest", guestId: r.guestId, photoId: r.id, status: r.status });
    publish({ type: "queue", pending: await pendingCount() });
  }
  return r;
}

export async function removeFromWall(id: string, by: string) {
  const [r] = await db.update(photos).set({ removedAt: new Date() }).where(and(eq(photos.id, id), isNull(photos.removedAt))).returning();
  if (!r) return null;
  const [log] = await db.insert(removals).values({ photoId: id, by }).returning();
  await bumpManifest();
  publish({ type: "gallery" });
  if (r.guestId) publish({ type: "guest", guestId: r.guestId, photoId: r.id, status: "removed" });
  return { photo: r, removalId: log.id };
}

export async function putBack(id: string) {
  const [r] = await db.update(photos).set({ removedAt: null }).where(eq(photos.id, id)).returning();
  if (!r) return null;
  await db.update(removals).set({ undoneAt: new Date() }).where(and(eq(removals.photoId, id), isNull(removals.undoneAt)));
  await bumpManifest();
  publish({ type: "gallery" });
  if (r.guestId) publish({ type: "guest", guestId: r.guestId, photoId: r.id, status: r.status });
  return r;
}

export async function setCaption(id: string, caption: string) {
  const clean = caption.trim().slice(0, 140) || null;
  const [r] = await db.update(photos).set({ caption: clean }).where(eq(photos.id, id)).returning();
  if (r?.status === "approved") {
    await bumpManifest();
    publish({ type: "gallery" });
  }
  return r;
}

/** Delete a roster photo entirely (files are kept if another row uses the same hash). */
export async function deletePhoto(id: string) {
  const [r] = await db.delete(photos).where(eq(photos.id, id)).returning();
  if (!r) return null;
  const [{ n }] = await db.select({ n: count() }).from(photos).where(eq(photos.hash, r.hash));
  if (n === 0) {
    const s = storage();
    await Promise.allSettled([s.delete(keys.orig(r.hash)), s.delete(keys.view(r.hash)), s.delete(keys.thumb(r.hash))]);
  }
  await bumpManifest();
  publish({ type: "gallery" });
  return r;
}

export async function counts() {
  const rows = await db
    .select({ source: photos.source, status: photos.status, removed: sql<boolean>`${photos.removedAt} is not null`, n: count() })
    .from(photos)
    .groupBy(photos.source, photos.status, sql`${photos.removedAt} is not null`);
  const c = { roster: 0, guestApproved: 0, pending: 0, rejected: 0, removed: 0, inRotation: 0 };
  for (const r of rows) {
    if (r.removed) c.removed += r.n;
    if (r.source === "roster" && r.status === "approved" && !r.removed) c.roster += r.n;
    if (r.source === "guest" && r.status === "approved" && !r.removed) c.guestApproved += r.n;
    if (r.status === "pending") c.pending += r.n;
    if (r.status === "rejected") c.rejected += r.n;
  }
  c.inRotation = c.roster + c.guestApproved;
  return c;
}

/** Photos currently in the wall rotation, in roster order. */
export async function rotationPhotos() {
  return db
    .select()
    .from(photos)
    .where(and(eq(photos.status, "approved"), isNull(photos.removedAt), isNull(photos.filesDeletedAt)))
    .orderBy(asc(photos.source), asc(photos.sortKey), asc(photos.decidedAt));
}

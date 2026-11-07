import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { photos, reservations } from "@/db/schema";
import { publish } from "@/lib/bus";
import { wallFromRequest } from "@/lib/wall-auth";

export const dynamic = "force-dynamic";

const Body = z.object({
  photoId: z.string().uuid(),
  row: z.number().int().min(0).max(64),
  col: z.number().int().min(0).max(64),
  rows: z.number().int().min(1).max(64),
  cols: z.number().int().min(1).max(64),
  /** ms from now until the photo is visible (avoids clock skew between wall and server) */
  inMs: z.number().min(0).max(120_000),
  hold: z.number().min(0).max(600),
});

/** Fast lane: a wall announces where and when a newly approved photo will appear. */
export async function POST(request: Request) {
  const wall = await wallFromRequest(request);
  if (!wall) return Response.json({ error: "Unknown wall key" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad reservation" }, { status: 400 });
  const r = parsed.data;
  const photo = await db.query.photos.findFirst({ where: eq(photos.id, r.photoId) });
  if (!photo) return Response.json({ error: "Unknown photo" }, { status: 404 });
  const showAt = Date.now() + r.inMs;
  await db.insert(reservations).values({ photoId: r.photoId, wallId: wall.id, row: r.row, col: r.col, rows: r.rows, cols: r.cols, showAt: new Date(showAt), holdSeconds: r.hold });
  publish({ type: "reservation", guestId: photo.guestId, photoId: photo.id, row: r.row, col: r.col, rows: r.rows, cols: r.cols, showAt, hold: r.hold, wallName: wall.name });
  return Response.json({ ok: true });
}

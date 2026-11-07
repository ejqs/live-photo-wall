import { inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { publish } from "@/lib/bus";
import { wallFromRequest } from "@/lib/wall-auth";

export const dynamic = "force-dynamic";

const Body = z.object({ ids: z.array(z.string().uuid()).max(500) });

/** Walls report which photos went up, for "first shown" in exports and "On the wall" for guests. */
export async function POST(request: Request) {
  const wall = await wallFromRequest(request);
  if (!wall) return Response.json({ error: "Unknown wall key" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.ids.length) return Response.json({ ok: true });
  const counts = new Map<string, number>();
  for (const id of parsed.data.ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const firstTime = await db
    .update(photos)
    .set({ firstShownAt: sql`coalesce(${photos.firstShownAt}, now())`, showCount: sql`${photos.showCount} + 1` })
    .where(inArray(photos.id, [...counts.keys()]))
    .returning({ id: photos.id, guestId: photos.guestId, status: photos.status, showCount: photos.showCount });
  for (const p of firstTime) if (p.guestId && p.showCount === 1) publish({ type: "guest", guestId: p.guestId, photoId: p.id, status: p.status });
  return Response.json({ ok: true });
}

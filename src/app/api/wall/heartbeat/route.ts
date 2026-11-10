import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { walls } from "@/db/schema";
import { BUILD_ID } from "@/lib/build";
import { publish } from "@/lib/bus";
import { getSetting } from "@/lib/settings";
import { wallFromRequest } from "@/lib/wall-auth";

export const dynamic = "force-dynamic";

const Status = z.object({
  manifestVersion: z.number().int(),
  cached: z.number().int().min(0),
  total: z.number().int().min(0),
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  userAgent: z.string().max(300),
  online: z.boolean(),
  installed: z.boolean(),
  wakeLock: z.boolean(),
  swaps: z.number().int().min(0),
  warning: z.string().max(300).nullable().optional(),
});

/** Walls check in every 15 s; the answer tells them if a newer manifest, a resync or a new deploy is waiting. */
export async function POST(request: Request) {
  const wall = await wallFromRequest(request);
  if (!wall) return Response.json({ error: "Unknown wall key" }, { status: 404 });
  const parsed = Status.safeParse(await request.json().catch(() => null));
  if (parsed.success) {
    await db.update(walls).set({ lastSeenAt: new Date(), status: parsed.data }).where(eq(walls.id, wall.id));
    publish({ type: "walls" });
  }
  const manifest = await getSetting("manifest");
  return Response.json({ version: manifest.version, resyncAt: wall.resyncAt?.getTime() ?? null, build: BUILD_ID });
}

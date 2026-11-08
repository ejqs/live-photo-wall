import { z } from "zod";
import { putBack, removeFromWall } from "@/lib/photos";
import { wallFromRequest } from "@/lib/wall-auth";

export const dynamic = "force-dynamic";

const Body = z.object({ photoId: z.string().uuid(), undo: z.boolean().optional() });

/** Take a photo out of the rotation from the stats screen (or put it back). */
export async function POST(request: Request) {
  const wall = await wallFromRequest(request);
  if (!wall) return Response.json({ error: "Unknown wall key" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  if (parsed.data.undo) {
    const r = await putBack(parsed.data.photoId);
    return Response.json({ ok: !!r });
  }
  const r = await removeFromWall(parsed.data.photoId, `wall:${wall.name}`);
  return Response.json({ ok: !!r });
}

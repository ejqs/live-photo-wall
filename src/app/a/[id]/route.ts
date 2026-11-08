import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { cachedBlob, IMMUTABLE } from "@/lib/blob-cache";

export async function GET(_request: Request, ctx: RouteContext<"/a/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const row = await db.query.assets.findFirst({ where: eq(assets.id, id) });
  if (!row) return new Response("Not found", { status: 404 });
  const buf = await cachedBlob(row.key);
  if (!buf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": row.mime, "Cache-Control": IMMUTABLE, "Access-Control-Allow-Origin": "*" },
  });
}

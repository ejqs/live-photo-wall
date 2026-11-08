import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exportsTable } from "@/db/schema";
import { getMe } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Download a finished export: redirect to a signed bucket link, or stream it from local disk. */
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/exports/[id]">) {
  const me = await getMe();
  if (!me || me.role === "moderator") return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const row = await db.query.exportsTable.findFirst({ where: eq(exportsTable.id, id) });
  if (!row?.key || row.status !== "done") return new Response("Not ready", { status: 404 });
  if (row.expiresAt && row.expiresAt < new Date()) return new Response("This link has expired. Prepare a new one.", { status: 410 });
  const ev = await getSetting("event");
  const ext = row.kind === "zip" ? "zip" : "mp4";
  const name = `${ev.name.replace(/[^\w\- ]+/g, "").trim() || "photos"}-${row.kind === "zip" ? "photos" : "wall"}.${ext}`;
  const signed = await storage().signedUrl(row.key, 3600, name);
  if (signed) return Response.redirect(signed, 302);
  const stream = await storage().stream(row.key);
  if (!stream) return new Response("Missing file", { status: 404 });
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": row.kind === "zip" ? "application/zip" : "video/mp4",
      "Content-Disposition": `attachment; filename="${name}"`,
      ...(row.bytes ? { "Content-Length": String(row.bytes) } : {}),
    },
  });
}

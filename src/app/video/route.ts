import { Readable } from "node:stream";
import { latestVideo } from "@/lib/landing";
import { getSetting } from "@/lib/settings";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** The wall video on the public landing page (only when the admin turned it on). */
export async function GET() {
  const landing = await getSetting("landing");
  if (!landing.published || !landing.showVideo) return new Response("Not found", { status: 404 });
  const row = await latestVideo();
  if (!row?.key) return new Response("Not found", { status: 404 });
  const signed = await storage().signedUrl(row.key, 6 * 3600);
  if (signed) return Response.redirect(signed, 302);
  const stream = await storage().stream(row.key);
  if (!stream) return new Response("Not found", { status: 404 });
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: { "Content-Type": "video/mp4", ...(row.bytes ? { "Content-Length": String(row.bytes) } : {}), "Cache-Control": "private, max-age=3600" },
  });
}

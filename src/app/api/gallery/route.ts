import crypto from "node:crypto";
import { galleryItems } from "@/lib/guest-photos";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Everyone's approved photos. Cheap to poll: answers 304 when nothing changed. */
export async function GET(request: Request) {
  const s = await getSettings(["guest", "landing"]);
  if (!s.guest.gallery && !(s.landing.published && s.landing.galleryLink)) return Response.json({ items: [] });
  const items = await galleryItems();
  const etag = `"${crypto.createHash("sha1").update(JSON.stringify(items.map((i) => [i.id, i.caption]))).digest("base64url")}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return Response.json({ items }, { headers: { ETag: etag, "Cache-Control": "no-cache" } });
}

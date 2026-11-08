import { cachedBlob, IMMUTABLE } from "@/lib/blob-cache";
import { keys } from "@/lib/storage";

const KINDS = { view: { ext: "webp", type: "image/webp" }, thumb: { ext: "webp", type: "image/webp" }, orig: { ext: "jpg", type: "image/jpeg" } } as const;

export async function GET(request: Request, ctx: RouteContext<"/img/[kind]/[file]">) {
  const { kind, file } = await ctx.params;
  const k = KINDS[kind as keyof typeof KINDS];
  const m = /^([a-f0-9]{40})\.(webp|jpg)$/.exec(file);
  if (!k || !m || m[2] !== k.ext) return new Response("Not found", { status: 404 });
  const hash = m[1];
  if (request.headers.get("if-none-match") === `"${hash}"`) return new Response(null, { status: 304, headers: { ETag: `"${hash}"`, "Cache-Control": IMMUTABLE } });
  const key = kind === "view" ? keys.view(hash) : kind === "thumb" ? keys.thumb(hash) : keys.orig(hash);
  const buf = await cachedBlob(key);
  if (!buf) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": k.type, "Cache-Control": IMMUTABLE, ETag: `"${hash}"`, "Content-Length": String(buf.length) },
  });
}

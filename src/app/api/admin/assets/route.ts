import path from "node:path";
import sharp from "sharp";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { bumpManifest } from "@/lib/settings";
import { HttpError, jsonError, requireRole } from "@/lib/session";
import { keys, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const FONT_TYPES: Record<string, string> = { ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2" };
const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

/** Upload a font, a PNG/SVG overlay or a logo. Files live in the bucket, never in the repo. */
export async function POST(request: Request) {
  try {
    await requireRole("admin");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file");
    if (file.size > 15 * 1024 * 1024) throw new HttpError(413, "Keep fonts and overlays under 15 MB.");
    const ext = path.extname(file.name).toLowerCase();
    const isFont = ext in FONT_TYPES;
    const mime = FONT_TYPES[ext] ?? IMAGE_TYPES[ext];
    if (!mime) throw new HttpError(415, "Use .ttf, .otf, .woff2 for fonts and .png, .svg or .webp for overlays.");
    const buf = Buffer.from(await file.arrayBuffer());
    let width: number | null = null;
    let height: number | null = null;
    if (!isFont) {
      if (ext === ".svg" && /<script|on\w+\s*=|javascript:/i.test(buf.toString("utf8"))) throw new HttpError(415, "That SVG contains scripts. Export it again without them.");
      try {
        const m = await sharp(buf).metadata();
        width = m.width ?? null;
        height = m.height ?? null;
      } catch {
        throw new HttpError(415, "We couldn't read that image.");
      }
    }
    const id = crypto.randomUUID();
    const key = keys.asset(id, ext);
    await storage().put(key, buf, mime);
    const [row] = await db
      .insert(assets)
      .values({ id, kind: isFont ? "font" : "image", name: file.name.slice(0, 120), key, mime, width, height, bytes: buf.length })
      .returning();
    await bumpManifest();
    return Response.json({ asset: { id: row.id, kind: row.kind, name: row.name, url: `/a/${row.id}`, width, height } });
  } catch (e) {
    return jsonError(e);
  }
}

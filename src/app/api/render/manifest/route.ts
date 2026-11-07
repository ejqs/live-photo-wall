import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exportsTable } from "@/db/schema";
import { buildManifest } from "@/lib/manifest";
import { checkRenderToken, type Mp4Options } from "@/lib/render-token";

export const dynamic = "force-dynamic";

/** The manifest the MP4 renderer plays. Authorized by an HMAC token for one export. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("export") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id) || !checkRenderToken(id, url.searchParams.get("token"))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const row = await db.query.exportsTable.findFirst({ where: eq(exportsTable.id, id) });
  if (!row || row.kind !== "mp4") return Response.json({ error: "Not found" }, { status: 404 });
  const o = row.options as Mp4Options;
  const m = await buildManifest({
    id: "render",
    name: "Video",
    key: "RENDER",
    primary: false,
    cols: null,
    rows: null,
    showQr: false,
    resyncAt: null,
    lastSeenAt: null,
    status: null,
    createdAt: new Date(),
  });
  const [w, h] = o.size.split("x").map(Number);
  // a vertical video keeps the cells roughly square
  const wall = h > w ? { ...m.wall, cols: m.wall.rows, rows: m.wall.cols } : m.wall;
  return Response.json(
    { ...m, wall, photos: m.photos.filter((p) => (p.source === "guest" ? o.guests : o.roster)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

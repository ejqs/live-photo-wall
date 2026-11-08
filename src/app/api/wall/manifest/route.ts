import { buildManifest } from "@/lib/manifest";
import { wallFromRequest } from "@/lib/wall-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wall = await wallFromRequest(request);
  if (!wall) return Response.json({ error: "Unknown wall key" }, { status: 404 });
  const m = await buildManifest(wall);
  return Response.json(m, { headers: { "Cache-Control": "no-store" } });
}

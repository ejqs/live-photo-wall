import { sseResponse } from "@/lib/bus";
import { wallFromRequest } from "@/lib/wall-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wall = await wallFromRequest(request);
  if (!wall) return new Response("Unknown wall key", { status: 404 });
  return sseResponse(request, {
    filter: (e) => {
      if (e.type === "manifest") return e;
      if (e.type === "resync" && (e.wallId === null || e.wallId === wall.id)) return e;
      if (e.type === "approved") return e;
      return null;
    },
  });
}

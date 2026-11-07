import { sseResponse } from "@/lib/bus";
import { getMe } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getMe())) return new Response("Unauthorized", { status: 401 });
  return sseResponse(request, {
    filter: (e) => (e.type === "queue" || e.type === "walls" || e.type === "exports" || e.type === "approved" || e.type === "manifest" ? e : null),
  });
}

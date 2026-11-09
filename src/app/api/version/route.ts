import { BUILD_ID } from "@/lib/build";

export const dynamic = "force-dynamic";

/** Open pages poll this to notice a new deploy. */
export function GET() {
  return Response.json({ build: BUILD_ID }, { headers: { "Cache-Control": "no-store" } });
}

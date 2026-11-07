import { guestIdFromCookie } from "@/lib/guest";
import { myPhotos } from "@/lib/guest-photos";

export const dynamic = "force-dynamic";

export async function GET() {
  const id = await guestIdFromCookie();
  if (!id) return Response.json({ photos: [] });
  return Response.json({ photos: await myPhotos(id) }, { headers: { "Cache-Control": "no-store" } });
}

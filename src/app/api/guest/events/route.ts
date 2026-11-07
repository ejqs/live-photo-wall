import { sseResponse } from "@/lib/bus";
import { guestIdFromCookie } from "@/lib/guest";

export const dynamic = "force-dynamic";

/** Live updates for one guest: their photo status changes and fast-lane countdowns. */
export async function GET(request: Request) {
  const id = await guestIdFromCookie();
  return sseResponse(request, {
    filter: (e) => {
      if (e.type === "gallery") return { type: "gallery" };
      if (!id) return null;
      if (e.type === "guest" && e.guestId === id) return { type: "photo", photoId: e.photoId };
      if (e.type === "reservation" && e.guestId === id) {
        // send "time remaining" so phone clock skew does not matter
        return { type: "reservation", photoId: e.photoId, row: e.row, col: e.col, rows: e.rows, cols: e.cols, inMs: e.showAt - Date.now(), hold: e.hold, wallName: e.wallName };
      }
      return null;
    },
    heartbeatMs: 20000,
  });
}

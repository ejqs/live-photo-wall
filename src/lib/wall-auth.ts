import "server-only";
import { wallByKey } from "./manifest";

export function keyFrom(request: Request): string {
  return request.headers.get("x-wall-key") ?? new URL(request.url).searchParams.get("key") ?? "";
}

export async function wallFromRequest(request: Request) {
  return wallByKey(keyFrom(request));
}

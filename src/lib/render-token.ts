import crypto from "node:crypto";

/** A token that lets the headless renderer read one export's manifest without signing in. */
export function renderToken(exportId: string) {
  const secret = process.env.BETTER_AUTH_SECRET ?? "dev-secret";
  return crypto.createHmac("sha256", secret).update(`render:${exportId}`).digest("base64url");
}

export function checkRenderToken(exportId: string, token: string | null) {
  if (!token) return false;
  const a = Buffer.from(renderToken(exportId));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type Mp4Options = { length: "all" | "180" | "60" | "30"; size: "1920x1080" | "3840x2160" | "1080x1920"; guests: boolean; roster: boolean };

import "server-only";
import crypto from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { guestLinks, guests } from "@/db/schema";
import { appUrl } from "./env";
import { getSetting } from "./settings";

const COOKIE = "lpw_guest";

function secret() {
  return process.env.BETTER_AUTH_SECRET ?? "dev-secret";
}

function sign(id: string) {
  return crypto.createHmac("sha256", secret()).update(`guest:${id}`).digest("base64url").slice(0, 22);
}

/** The guest id from the signed cookie, if any. */
export async function guestIdFromCookie(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, mac] = raw.split(".");
  if (!id || !mac || mac.length !== 22) return null;
  const expected = sign(id);
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return id;
}

export async function currentGuest() {
  const id = await guestIdFromCookie();
  if (!id) return null;
  return (await db.query.guests.findFirst({ where: eq(guests.id, id) })) ?? null;
}

/** Find or create the guest for this browser, updating their name. */
export async function ensureGuest(name: string) {
  const clean = name.trim().slice(0, 60);
  const existing = await currentGuest();
  if (existing) {
    if (existing.name !== clean && clean) await db.update(guests).set({ name: clean }).where(eq(guests.id, existing.id));
    return { ...existing, name: clean || existing.name };
  }
  const [g] = await db.insert(guests).values({ name: clean }).returning();
  (await cookies()).set(COOKIE, `${g.id}.${sign(g.id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: appUrl().startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 120,
  });
  return g;
}

/** Is this guest link usable right now? */
export async function isValidLink(slug: string): Promise<boolean> {
  const row = await db.query.guestLinks.findFirst({
    where: and(eq(guestLinks.slug, slug), or(isNull(guestLinks.expiresAt), gt(guestLinks.expiresAt, new Date()))),
  });
  return !!row;
}

/** The current (non-expiring) guest link, created on first use. */
export async function currentLinkSlug(): Promise<string> {
  const row = await db.query.guestLinks.findFirst({ where: isNull(guestLinks.expiresAt) });
  if (row) return row.slug;
  const slug = newSlug();
  await db.insert(guestLinks).values({ slug }).onConflictDoNothing();
  return slug;
}

export function newSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function publicBaseUrl(): Promise<string> {
  const ev = await getSetting("event");
  return (ev.publicUrl || appUrl()).replace(/\/+$/, "");
}

export async function guestLinkUrl(): Promise<string> {
  return `${await publicBaseUrl()}/u/${await currentLinkSlug()}`;
}

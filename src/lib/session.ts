import "server-only";
import { count } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth, type Role } from "./auth";

const RANK: Record<Role, number> = { moderator: 1, admin: 2, owner: 3 };

export type Me = { id: string; name: string; email: string; role: Role };

export async function getMe(): Promise<Me | null> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const role = ((s.user as { role?: string }).role ?? "moderator") as Role;
  return { id: s.user.id, name: s.user.name, email: s.user.email, role };
}

export function can(me: Pick<Me, "role"> | null, min: Role) {
  return !!me && RANK[me.role] >= RANK[min];
}

/** For pages: redirect to sign-in (or to the overview when the role is too low). */
export async function requirePage(min: Role = "moderator"): Promise<Me> {
  const me = await getMe();
  if (!me) redirect("/sign-in");
  if (!can(me, min)) redirect("/admin");
  return me;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** For server actions and route handlers. */
export async function requireRole(min: Role = "moderator"): Promise<Me> {
  const me = await getMe();
  if (!me) throw new HttpError(401, "Please sign in again.");
  if (!can(me, min)) throw new HttpError(403, "You don't have access to that.");
  return me;
}

export async function hasAnyUser() {
  const [r] = await db.select({ n: count() }).from(user);
  return (r?.n ?? 0) > 0;
}

/** Create an account directly (sign-up is disabled; the owner adds people on the Team page). */
export async function createAccount(input: { name: string; email: string; password: string; role: Role }) {
  const ctx = await auth.$context;
  const email = input.email.trim().toLowerCase();
  if (await ctx.internalAdapter.findUserByEmail(email)) throw new HttpError(409, "Someone already uses that email.");
  if (input.password.length < 10) throw new HttpError(400, "Use a password of at least 10 characters.");
  const hash = await ctx.password.hash(input.password);
  const created = await ctx.internalAdapter.createUser({
    email,
    name: input.name.trim() || email,
    emailVerified: true,
    role: input.role,
  }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: hash,
  });
  return created;
}

export function jsonError(e: unknown): Response {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

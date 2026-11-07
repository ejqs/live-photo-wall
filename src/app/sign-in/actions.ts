"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createAccount, hasAnyUser, HttpError } from "@/lib/session";

const Setup = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email().max(200),
  password: z.string().min(10).max(256),
});

/** First run only: create the owner account and sign in. */
export async function setupOwner(input: z.infer<typeof Setup>): Promise<{ error?: string }> {
  if (await hasAnyUser()) return { error: "This app already has an owner. Sign in instead." };
  const parsed = Setup.safeParse(input);
  if (!parsed.success) return { error: "Check your name, email, and a password of at least 10 characters." };
  // On a public deploy, set OWNER_EMAIL so nobody else can claim the owner account first.
  const allowed = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (allowed && parsed.data.email.toLowerCase() !== allowed) return { error: "Use the owner email configured for this deployment." };
  try {
    await createAccount({ ...parsed.data, role: "owner" });
    await auth.api.signInEmail({ body: { email: parsed.data.email, password: parsed.data.password }, headers: await headers() });
    return {};
  } catch (e) {
    return { error: e instanceof HttpError ? e.message : "Could not create the account." };
  }
}

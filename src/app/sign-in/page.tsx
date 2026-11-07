import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe, hasAnyUser } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if (await getMe()) redirect("/admin");
  const firstRun = !(await hasAnyUser());
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <SignInForm firstRun={firstRun} />
    </main>
  );
}

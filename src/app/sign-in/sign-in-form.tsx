"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { setupOwner } from "./actions";

export function SignInForm({ firstRun }: { firstRun: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "");
    const password = String(f.get("password") ?? "");
    setError(null);
    start(async () => {
      if (firstRun) {
        const res = await setupOwner({ name: String(f.get("name") ?? ""), email, password });
        if (res.error) return setError(res.error);
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) return setError(res.error.status === 429 ? "Too many attempts. Wait a minute and try again." : "That email and password don't match.");
      }
      router.replace("/admin");
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{firstRun ? "Set up the photo wall" : "Sign in"}</CardTitle>
        <CardDescription>
          {firstRun ? "Create the owner account. You can add admins and moderators later." : "Admins and moderators sign in here."}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent>
          <FieldGroup>
            {firstRun && (
              <Field>
                <FieldLabel htmlFor="name">Your name</FieldLabel>
                <Input id="name" name="name" autoComplete="name" required />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input id="password" name="password" type="password" autoComplete={firstRun ? "new-password" : "current-password"} minLength={firstRun ? 10 : undefined} required />
              {firstRun && <FieldDescription>At least 10 characters.</FieldDescription>}
            </Field>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {firstRun ? "Create owner account" : "Sign in"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

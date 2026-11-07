"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerServiceWorker, wallStore } from "@/wall/storage";

export function PairWall() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    registerServiceWorker();
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("key");
    if (fromUrl) {
      wallStore.setKey(fromUrl.toUpperCase());
      router.replace("/wall/play");
    } else if (wallStore.key() && params.get("change") !== "1") router.replace("/wall/play");
  }, [router]);

  async function pair(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const k = key.trim().toUpperCase();
    try {
      const res = await fetch(`/api/wall/manifest?key=${encodeURIComponent(k)}`);
      if (!res.ok) throw new Error();
      wallStore.clearKey();
      wallStore.setKey(k);
      router.replace("/wall/play");
    } catch {
      setError("That key doesn't match a wall. Check it on the Walls page in the admin.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={pair} className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Pair this display</h1>
          <p className="text-sm text-zinc-400">Enter the wall key from the Walls page. Then install this page as an app so it opens full screen and keeps working offline.</p>
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="wall-key">Wall key</FieldLabel>
            <Input id="wall-key" value={key} onChange={(e) => setKey(e.target.value)} autoCapitalize="characters" autoComplete="off" className="font-mono uppercase" required />
            <FieldDescription>Six letters and numbers, like K7M2QX.</FieldDescription>
          </Field>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" variant="secondary" disabled={busy}>
            Pair
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
}

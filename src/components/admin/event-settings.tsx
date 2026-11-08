"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveEventSettings } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { EventSettings } from "@/lib/settings-types";

/** ISO -> value for <input type="datetime-local"> in the browser's time zone */
function toLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventSettingsForm({ initial, appUrl }: { initial: EventSettings; appUrl: string }) {
  const [name, setName] = useState(initial.name);
  const [endsAt, setEndsAt] = useState(toLocal(initial.endsAt));
  const [retention, setRetention] = useState(String(initial.retentionDays));
  const [publicUrl, setPublicUrl] = useState(initial.publicUrl ?? "");
  const [pending, start] = useTransition();
  const deleteOn = endsAt ? new Date(new Date(endsAt).getTime() + Number(retention || 0) * 86400_000) : null;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Event</CardTitle>
        <CardDescription>Used on the wall, the guest page and the landing page.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="e-name">Event name</FieldLabel>
            <Input id="e-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="e-end">Event ends</FieldLabel>
            <Input id="e-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            <FieldDescription>The landing page switches to its after-the-event text at this time.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="e-ret">Keep photos for (days after the event)</FieldLabel>
            <Input id="e-ret" type="number" min={1} max={3650} value={retention} onChange={(e) => setRetention(e.target.value)} className="w-32" />
            <FieldDescription>
              {deleteOn
                ? `Guest photo files are deleted on ${deleteOn.toLocaleDateString()}. Download the zip before then.`
                : "Set an end time to start the countdown. Nothing is deleted until then."}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="e-url">Public address (optional)</FieldLabel>
            <Input id="e-url" type="url" placeholder={appUrl} value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} />
            <FieldDescription>Set this when you add your own domain in Railway, so the QR codes use it.</FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveEventSettings({
                name,
                endsAt: endsAt ? new Date(endsAt).toISOString() : null,
                retentionDays: Number(retention),
                publicUrl: publicUrl.trim() || null,
              });
              if (!r.ok) toast.error(r.error);
              else toast.success("Saved");
            })
          }
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveLanding } from "@/app/admin/actions";
import { SwitchRow } from "@/components/admin/controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { LandingSettings } from "@/lib/settings-types";

export function LandingSettingsForm({ initial, url, ended }: { initial: LandingSettings; url: string; ended: boolean }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [pending, start] = useTransition();
  const set = <K extends keyof LandingSettings>(k: K, v: LandingSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const dirty = saved !== JSON.stringify(s);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
        <Button size="sm" variant="outline" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            Open the page
          </a>
        </Button>
        <Button
          size="sm"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await saveLanding(s);
              if (!r.ok) toast.error(r.error);
              else {
                setSaved(JSON.stringify(s));
                toast.success("Saved");
              }
            })
          }
        >
          Save
        </Button>
      </div>
      <Card className="gap-4 py-4">
        <CardHeader>
          <CardTitle>Event page</CardTitle>
          <CardDescription>
            A simple public page at the root of your domain with the event name, a link to add photos and, after the event, the gallery. Right now it&apos;s in {ended ? "after the event" : "during the event"} mode.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SwitchRow label="Published" hint="When off, the root of your domain goes to the sign-in page." checked={s.published} onChange={(v) => set("published", v)} />
            <Field>
              <FieldLabel htmlFor="l-during">Intro during the event</FieldLabel>
              <Textarea id="l-during" rows={3} maxLength={400} value={s.introDuring} onChange={(e) => set("introDuring", e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="l-after">Intro after the event</FieldLabel>
              <Textarea id="l-after" rows={3} maxLength={400} value={s.introAfter} onChange={(e) => set("introAfter", e.target.value)} />
              <FieldDescription>Switches automatically at the end time in Event settings.</FieldDescription>
            </Field>
            <SwitchRow label="Show a strip of approved photos" checked={s.liveStrip} onChange={(v) => set("liveStrip", v)} />
            <SwitchRow label="Link to the gallery" checked={s.galleryLink} onChange={(v) => set("galleryLink", v)} />
            <SwitchRow label="Show the wall video after the event" hint="Uses the latest finished MP4 export." checked={s.showVideo} onChange={(v) => set("showVideo", v)} />
          </FieldGroup>
        </CardContent>
      </Card>
      <Card className="gap-4 py-4">
        <CardHeader>
          <CardTitle>Your own domain</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Add the domain to the web service in Railway (Settings, Networking, Custom domain) and create the DNS record it shows you. Then set BETTER_AUTH_URL to the new address, and put it in Event settings as the public address so the QR uses it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { DownloadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteExport, requestExport } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ExportView } from "@/lib/export-view";
import { ago, bytes as fmtBytes } from "@/lib/time";

export function DownloadsPanel({
  zip,
  mp4,
  counts,
  bytes,
}: {
  zip: ExportView | null;
  mp4: ExportView | null;
  counts: { guests: number; roster: number; hidden: number };
  bytes: number;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const busy = [zip, mp4].some((e) => e?.status === "queued" || e?.status === "running");
  // the video worker is a separate service, so poll for its progress
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [busy, router]);
  const [z, setZ] = useState({ guests: true, roster: true, hidden: false });
  const [v, setV] = useState({ length: "all", size: "1920x1080", guests: true, roster: true });
  const zipCount = (z.guests ? counts.guests : 0) + (z.roster ? counts.roster : 0) + (z.hidden ? counts.hidden : 0);
  const total = counts.guests + counts.roster + counts.hidden;
  const estimate = total ? (bytes / total) * zipCount : 0;

  const go = (kind: "zip" | "mp4") =>
    start(async () => {
      const r = await requestExport(kind, kind === "zip" ? z : v);
      if (r.ok) toast.success(kind === "zip" ? "Preparing the zip. You can leave this page." : "Rendering the video. This takes a while; you can leave this page.");
      else toast.error(r.error);
    });

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Download all photos</CardTitle>
          <CardDescription>
            A zip of full-size photos sorted into folders, with captions.csv (file, shared by, caption, date taken, first time on the wall). The link stays valid for 7 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldSet>
            <FieldLegend variant="label">Include</FieldLegend>
            {(
              [
                ["guests", `Guest photos (approved) · ${counts.guests}`],
                ["roster", `Roster · ${counts.roster}`],
                ["hidden", `Not approved or taken down · ${counts.hidden}`],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} orientation="horizontal">
                <Checkbox id={`zip-${k}`} checked={z[k]} onCheckedChange={(c) => setZ((s) => ({ ...s, [k]: c === true }))} />
                <FieldLabel htmlFor={`zip-${k}`} className="font-normal">
                  {label}
                </FieldLabel>
              </Field>
            ))}
          </FieldSet>
          <ExportStatus e={zip} onDelete={(id) => start(async () => void (await deleteExport(id)))} />
        </CardContent>
        <CardFooter>
          <Button disabled={pending || zipCount === 0 || zip?.status === "running" || zip?.status === "queued"} onClick={() => go("zip")}>
            Prepare zip ({zipCount} photos · about {fmtBytes(estimate)})
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Download the wall as a video</CardTitle>
          <CardDescription>
            An MP4 of the wall playing your photos with your design and motion, rendered on the server frame by frame, so it never stutters. The QR and status badge are left out.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSet>
              <FieldLegend variant="label">Length</FieldLegend>
              <RadioGroup value={v.length} onValueChange={(length) => setV((s) => ({ ...s, length }))}>
                {[
                  ["all", "Every photo once"],
                  ["180", "3 minutes"],
                  ["60", "1 minute"],
                  ["30", "30 seconds"],
                ].map(([val, label]) => (
                  <Field key={val} orientation="horizontal">
                    <RadioGroupItem value={val} id={`len-${val}`} />
                    <FieldLabel htmlFor={`len-${val}`} className="font-normal">
                      {label}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">Size</FieldLegend>
              <RadioGroup value={v.size} onValueChange={(size) => setV((s) => ({ ...s, size }))}>
                {[
                  ["1920x1080", "1920 × 1080"],
                  ["3840x2160", "3840 × 2160 (4K)"],
                  ["1080x1920", "1080 × 1920 (vertical)"],
                ].map(([val, label]) => (
                  <Field key={val} orientation="horizontal">
                    <RadioGroupItem value={val} id={`size-${val}`} />
                    <FieldLabel htmlFor={`size-${val}`} className="font-normal">
                      {label}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>
          </div>
          <FieldSet>
            <FieldLegend variant="label">Photos</FieldLegend>
            {(
              [
                ["guests", "Guest photos"],
                ["roster", "Roster"],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} orientation="horizontal">
                <Checkbox id={`mp4-${k}`} checked={v[k]} onCheckedChange={(c) => setV((s) => ({ ...s, [k]: c === true }))} />
                <FieldLabel htmlFor={`mp4-${k}`} className="font-normal">
                  {label}
                </FieldLabel>
              </Field>
            ))}
          </FieldSet>
          <ExportStatus e={mp4} onDelete={(id) => start(async () => void (await deleteExport(id)))} />
        </CardContent>
        <CardFooter>
          <Button disabled={pending || (!v.guests && !v.roster) || mp4?.status === "running" || mp4?.status === "queued"} onClick={() => go("mp4")}>
            Render MP4
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function ExportStatus({ e, onDelete }: { e: ExportView | null; onDelete: (id: string) => void }) {
  if (!e) return <p className="text-sm text-muted-foreground">Last export: none yet.</p>;
  if (e.status === "queued") return <p className="text-sm text-muted-foreground">Waiting to start… {e.options && "size" in e.options ? "Videos are rendered by the worker service." : ""}</p>;
  if (e.status === "running")
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm">Preparing… {Math.round(e.progress * 100)}%</span>
        <Progress value={e.progress * 100} />
      </div>
    );
  if (e.status === "failed") return <p className="text-sm text-destructive">Last export failed: {e.error ?? "unknown error"}. Try again.</p>;
  // eslint-disable-next-line react-hooks/purity -- re-rendered by the refresh poll; a stale minute is fine
  const expired = e.expiresAt !== null && e.expiresAt < Date.now();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {expired ? (
        <span className="text-muted-foreground">Last export expired {ago(e.expiresAt)}.</span>
      ) : (
        <>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/admin/exports/${e.id}`}>
              <DownloadIcon data-icon="inline-start" />
              Download ({fmtBytes(e.bytes)})
            </a>
          </Button>
          <span className="text-muted-foreground">Ready {ago(e.finishedAt)} · link valid until {new Date(e.expiresAt ?? 0).toLocaleDateString()}</span>
        </>
      )}
      <Button size="sm" variant="ghost" onClick={() => onDelete(e.id)}>
        Delete
      </Button>
    </div>
  );
}

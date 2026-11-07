"use client";

import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createWall, deleteWall, forceResync, newWallKey, updateWall } from "@/app/admin/actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { WallStatus } from "@/db/schema";
import { ago } from "@/lib/time";

type Wall = { id: string; name: string; key: string; primary: boolean; cols: number | null; rows: number | null; showQr: boolean; lastSeenAt: number | null; status: WallStatus | null };

export function WallsManager({ walls, base, manifestVersion, defaultGrid, now }: { walls: Wall[]; base: string; manifestVersion: number; defaultGrid: { cols: number; rows: number }; now: number }) {
  const [name, setName] = useState("");
  const [busy, start] = useTransition();
  const done = (r: { ok: boolean; error?: string }, msg?: string): void => {
    if (!r.ok) toast.error(r.error ?? "Failed");
    else if (msg) toast.success(msg);
  };
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Set up a display</CardTitle>
          <CardDescription>Do this a day before. Playback starts when one screen of photos is cached; the rest fills in while it plays.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
            <li>
              On the display computer, open <code className="font-mono">{base}/wall</code> in Chrome or Edge and enter the wall key below.
            </li>
            <li>Install it as an app (the install icon in the address bar) so it opens full screen and works offline. Press F for full screen, S for the status badge.</li>
            <li>Turn off the computer&apos;s sleep and screen saver. The wall also asks the browser to keep the screen awake.</li>
            <li>
              Open <code className="font-mono">{base}/wall/stats</code> on a second screen to see swaps, sync and what is up next.
            </li>
          </ol>
        </CardContent>
        <CardFooter className="flex-wrap gap-2">
          <form
            className="flex w-full max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createWall(name || "Main LED wall");
                done(r, `Added. Wall key: ${r.ok ? r.data : ""}`);
                if (r.ok) setName("");
              });
            }}
          >
            <Input placeholder="Main LED wall" value={name} onChange={(e) => setName(e.target.value)} aria-label="New wall name" />
            <Button type="submit" disabled={busy}>
              Add a wall
            </Button>
          </form>
          <Button
            variant="outline"
            disabled={busy || !walls.length}
            onClick={() => start(async () => done(await forceResync(null), "Every wall will reload in a moment."))}
          >
            Force resync all
          </Button>
        </CardFooter>
      </Card>

      {walls.map((w) => {
        const online = !!w.lastSeenAt && now - w.lastSeenAt < 45_000;
        return (
          <Card key={w.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {w.name}
                {w.primary && <Badge variant="secondary">Fast lane</Badge>}
              </CardTitle>
              <CardDescription>
                <span className={online ? "text-emerald-600" : "text-amber-600"}>●</span>{" "}
                {online
                  ? w.status?.manifestVersion === manifestVersion
                    ? "Online · synced"
                    : `Online · updating to v${manifestVersion}`
                  : w.lastSeenAt
                    ? `Offline · playing from cache · last seen ${ago(w.lastSeenAt, now)}`
                    : "Not paired yet"}
                {w.status && ` · ${w.status.width} × ${w.status.height} · ${w.status.cached}/${w.status.total} cached · ${w.status.installed ? "installed" : "in a browser tab"} · ${w.status.wakeLock ? "wake lock on" : "no wake lock"}`}
              </CardDescription>
              <CardAction className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => start(async () => done(await forceResync(w.id), "Reloading in a moment."))}>
                  Force resync
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>Wall key</FieldLabel>
                  <div className="flex items-center gap-2">
                    <code className="rounded-md bg-muted px-3 py-1.5 font-mono text-lg tracking-widest">{w.key}</code>
                    <Button size="icon-sm" variant="ghost" aria-label="Copy pairing link" onClick={() => { navigator.clipboard?.writeText(`${base}/wall?key=${w.key}`); toast.success("Pairing link copied"); }}>
                      <CopyIcon />
                    </Button>
                    <Button size="icon-sm" variant="ghost" asChild aria-label="Open this wall here">
                      <a href={`/wall?key=${w.key}`} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon />
                      </a>
                    </Button>
                  </div>
                  <FieldDescription>Anyone with the key can show the wall and take photos out of rotation from the stats screen.</FieldDescription>
                </Field>
                <WallNameField wall={w} />
                <GridField wall={w} defaultGrid={defaultGrid} />
                <Field>
                  <FieldLabel>Options</FieldLabel>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Switch id={`qr-${w.id}`} checked={w.showQr} onCheckedChange={(v) => start(async () => done(await updateWall(w.id, { showQr: v })))} />
                      <Label htmlFor={`qr-${w.id}`}>Show the guest QR on this wall</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id={`fast-${w.id}`} checked={w.primary} onCheckedChange={(v) => start(async () => done(await updateWall(w.id, { primary: v })))} />
                      <Label htmlFor={`fast-${w.id}`}>Fast lane: guests get a countdown and a map of this wall</Label>
                    </div>
                  </div>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => start(async () => done(await newWallKey(w.id), "New key made. Pair the display again."))}>
                New key
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={busy}>
                    Remove wall
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {w.name}?</AlertDialogTitle>
                    <AlertDialogDescription>The display stops receiving updates and asks to be paired again.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => start(async () => done(await deleteWall(w.id)))}>Remove</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

function WallNameField({ wall }: { wall: Wall }) {
  const [name, setName] = useState(wall.name);
  const [busy, start] = useTransition();
  return (
    <Field>
      <FieldLabel htmlFor={`name-${wall.id}`}>Name</FieldLabel>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updateWall(wall.id, { name });
            if (!r.ok) toast.error(r.error);
          });
        }}
      >
        <Input id={`name-${wall.id}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <Button type="submit" variant="outline" disabled={busy || name === wall.name}>
          Save
        </Button>
      </form>
    </Field>
  );
}

function GridField({ wall, defaultGrid }: { wall: Wall; defaultGrid: { cols: number; rows: number } }) {
  const [cols, setCols] = useState(wall.cols ? String(wall.cols) : "");
  const [rows, setRows] = useState(wall.rows ? String(wall.rows) : "");
  const [busy, start] = useTransition();
  return (
    <Field>
      <FieldLabel>Grid on this wall</FieldLabel>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updateWall(wall.id, { cols: cols ? Number(cols) : null, rows: rows ? Number(rows) : null });
            if (!r.ok) toast.error(r.error);
            else toast.success("Grid saved.");
          });
        }}
      >
        <Input type="number" min={1} max={24} value={cols} onChange={(e) => setCols(e.target.value)} placeholder={String(defaultGrid.cols)} aria-label="Columns" className="w-20" />
        <span>×</span>
        <Input type="number" min={1} max={16} value={rows} onChange={(e) => setRows(e.target.value)} placeholder={String(defaultGrid.rows)} aria-label="Rows" className="w-20" />
        <Button type="submit" variant="outline" disabled={busy}>
          Save
        </Button>
      </form>
      <FieldDescription>Leave empty to use the Motion page grid ({defaultGrid.cols} × {defaultGrid.rows}). Cells stretch to fit any resolution.</FieldDescription>
    </Field>
  );
}

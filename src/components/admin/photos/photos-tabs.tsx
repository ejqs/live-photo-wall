"use client";

import { SearchIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approveAllPending,
  approvePhotos,
  deleteRosterPhotos,
  editCaption,
  putBackOnWall,
  setAutoApprove,
  setPlaylist,
  takeOffWall,
  undoDecision,
} from "@/app/admin/actions";
import { ApprovalQueue, type QueueItem } from "@/components/admin/approval-queue";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PhotoRow } from "@/lib/admin-data";
import type { PlaylistSettings } from "@/lib/settings-types";
import { RosterUploader } from "./roster-uploader";

export function PhotosTabs(props: {
  tab: string;
  pending: QueueItem[];
  rows: PhotoRow[];
  autoApprove: boolean;
  playlist: PlaylistSettings;
  canAdmin: boolean;
  version: number;
}) {
  const router = useRouter();
  const path = usePathname();
  const approved = props.rows.filter((r) => r.source === "guest" && r.status === "approved");
  const roster = props.rows.filter((r) => r.source === "roster");
  const hidden = props.rows.filter((r) => r.source === "guest" && (r.status === "rejected" || r.removed));
  return (
    <Tabs value={props.tab} onValueChange={(t) => router.replace(`${path}?tab=${t}`, { scroll: false })}>
      <TabsList className="flex-wrap">
        <TabsTrigger value="queue">Guest queue · {props.pending.length}</TabsTrigger>
        <TabsTrigger value="approved">Approved · {approved.filter((r) => !r.removed).length}</TabsTrigger>
        <TabsTrigger value="roster">Roster · {roster.length}</TabsTrigger>
        <TabsTrigger value="hidden">Not shown · {hidden.length}</TabsTrigger>
      </TabsList>
      <TabsContent value="queue" className="mt-4">
        <QueueTab pending={props.pending} autoApprove={props.autoApprove} />
      </TabsContent>
      <TabsContent value="approved" className="mt-4">
        <ApprovedTab rows={approved} />
      </TabsContent>
      <TabsContent value="roster" className="mt-4">
        <RosterTab rows={roster} playlist={props.playlist} canAdmin={props.canAdmin} version={props.version} />
      </TabsContent>
      <TabsContent value="hidden" className="mt-4">
        <HiddenTab rows={hidden} />
      </TabsContent>
    </Tabs>
  );
}

function QueueTab({ pending, autoApprove }: { pending: QueueItem[]; autoApprove: boolean }) {
  const [busy, start] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="auto-approve"
            checked={autoApprove}
            disabled={busy}
            onCheckedChange={(v) => start(async () => void (await setAutoApprove(v)))}
          />
          <Label htmlFor="auto-approve">Auto-approve guest photos (only for trusted crowds)</Label>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={!pending.length || busy}>
              Approve all ({pending.length})
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve all {pending.length} photos?</AlertDialogTitle>
              <AlertDialogDescription>They all go into the wall rotation. You can still take any of them down later.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  start(async () => {
                    const r = await approveAllPending();
                    if (r.ok) toast.success(`Approved ${r.data} photos.`);
                    else toast.error(r.error);
                  })
                }
              >
                Approve all
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <ApprovalQueue items={pending} />
    </div>
  );
}

function useSearch(rows: PhotoRow[]) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => [r.who, r.caption, r.fileName].some((x) => x?.toLowerCase().includes(s)));
  }, [rows, q]);
  const box = (
    <InputGroup className="max-w-sm">
      <InputGroupInput placeholder="Search name, caption or file" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search photos" />
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
    </InputGroup>
  );
  return { filtered, box };
}

function ApprovedTab({ rows }: { rows: PhotoRow[] }) {
  const { filtered, box } = useSearch(rows);
  if (!rows.length)
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>No approved guest photos yet</EmptyTitle>
          <EmptyDescription>Approve photos in the queue and they show up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {box}
        <span className="text-sm text-muted-foreground">Edit a caption, or take a photo off the wall. Removing swaps it out within a second.</span>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((r) => (
          <ApprovedItem key={r.id} row={r} />
        ))}
      </ul>
    </div>
  );
}

function ApprovedItem({ row }: { row: PhotoRow }) {
  const [caption, setCaption] = useState(row.caption ?? "");
  const [busy, start] = useTransition();
  const edited = (row.caption ?? "") !== (row.originalCaption ?? "");
  return (
    <li className="flex gap-3 rounded-lg border bg-card p-3">
      <a href={row.view} target="_blank" rel="noreferrer" className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.thumb} alt="" className={`size-24 rounded-md object-cover ${row.removed ? "opacity-40 grayscale" : ""}`} loading="lazy" />
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <strong className="truncate text-sm">{row.who}</strong>
          <Badge variant={row.removed ? "outline" : "secondary"}>{row.removed ? "Taken down" : row.firstShownAt ? "On the wall" : "In rotation"}</Badge>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await editCaption(row.id, caption);
              if (r.ok) toast.success("Caption saved.");
              else toast.error(r.error);
            });
          }}
        >
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} aria-label={`Caption for ${row.who}'s photo`} placeholder="No caption" className="h-8 text-sm" />
          <Button type="submit" size="sm" variant="outline" disabled={busy || caption === (row.caption ?? "")}>
            Save
          </Button>
        </form>
        {edited && <span className="truncate text-xs text-muted-foreground">Original: {row.originalCaption || "(none)"}</span>}
        <div className="mt-auto">
          <Button
            size="sm"
            variant={row.removed ? "outline" : "ghost"}
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = row.removed ? await putBackOnWall(row.id) : await takeOffWall(row.id);
                if (!r.ok) toast.error(r.error);
                else if (!row.removed) toast("Taken off the wall.", { action: { label: "Undo", onClick: () => start(async () => void (await putBackOnWall(row.id))) } });
              })
            }
          >
            {row.removed ? "Put back" : "Remove from wall"}
          </Button>
        </div>
      </div>
    </li>
  );
}

function RosterTab({ rows, playlist, canAdmin, version }: { rows: PhotoRow[]; playlist: PlaylistSettings; canAdmin: boolean; version: number }) {
  const { filtered, box } = useSearch(rows);
  const [busy, start] = useTransition();
  const sorted = useMemo(() => [...filtered].sort((a, b) => (a.fileName ?? "").localeCompare(b.fileName ?? "", undefined, { numeric: true })), [filtered]);
  return (
    <div className="flex flex-col gap-4">
      {canAdmin && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <RosterUploader />
          <Card>
            <CardHeader>
              <CardTitle>Play order</CardTitle>
              <CardDescription>Newly approved guest photos always jump the queue once, then join the loop.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="order">Order</FieldLabel>
                <Select
                  value={playlist.order}
                  onValueChange={(order) => start(async () => void (await setPlaylist({ ...playlist, order: order as PlaylistSettings["order"] })))}
                  disabled={busy}
                >
                  <SelectTrigger id="order" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="filename">File name (2 before 10), then guests oldest to newest</SelectItem>
                      <SelectItem value="random">Random</SelectItem>
                      <SelectItem value="guests-first">Newest guest photos first, then roster</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>Playlist v{version}. Walls pick up changes within seconds.</FieldDescription>
              </Field>
              <Button asChild variant="outline" size="sm" className="self-start">
                <Link href="/wall/stats" target="_blank">
                  See what&apos;s up next
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {box}
        <span className="text-sm text-muted-foreground">{rows.length} roster photos</span>
      </div>
      {rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No roster photos yet</EmptyTitle>
            <EmptyDescription>Drop a folder of your own photos above. They play in file-name order.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {sorted.map((r) => (
            <li key={r.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.thumb} alt={r.fileName ?? ""} title={r.fileName ?? ""} className={`aspect-square w-full rounded-md object-cover ${r.removed ? "opacity-40 grayscale" : ""}`} loading="lazy" />
              <span className="block truncate pt-0.5 text-[11px] text-muted-foreground">{r.fileName}</span>
              {canAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon-sm" variant="secondary" className="absolute top-1 right-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" aria-label={`Delete ${r.fileName}`}>
                      <Trash2Icon />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {r.fileName}?</AlertDialogTitle>
                      <AlertDialogDescription>It leaves the wall and is deleted from storage. This can&apos;t be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => start(async () => void (await deleteRosterPhotos([r.id])))}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HiddenTab({ rows }: { rows: PhotoRow[] }) {
  const [busy, start] = useTransition();
  if (!rows.length)
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>Rejected or taken-down photos land here. Guests only see a small gray &quot;not shown&quot; link.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.thumb} alt="" className="aspect-square w-full rounded-md object-cover opacity-60" loading="lazy" />
          <span className="truncate text-xs">{r.who}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const res = r.removed ? await putBackOnWall(r.id) : await undoDecision(r.id).then((x) => (x.ok ? approvePhotos([r.id]) : x));
                if (!res.ok) toast.error(res.error);
              })
            }
          >
            {r.removed ? "Put back" : "Approve after all"}
          </Button>
        </li>
      ))}
    </ul>
  );
}

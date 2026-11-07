"use client";

import { SearchIcon, Undo2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { STATS_CHANNEL, wallStore } from "@/wall/storage";
import { imgUrl, type WallManifest, type WallPhoto } from "@/wall/types";
import type { WallStatsMessage } from "../play/wall-app";

type Removed = { photo: WallPhoto; at: number; undone: boolean };

/**
 * Opened in a second window on the wall computer. It reads what the wall is doing over a
 * BroadcastChannel (same browser), and can take a photo off every wall in a hurry.
 */
export function StatsApp() {
  const [stats, setStats] = useState<WallStatsMessage | null>(null);
  const [manifest, setManifest] = useState<WallManifest | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "guest" | "roster">("all");
  const [confirming, setConfirming] = useState<WallPhoto | null>(null);
  const [removed, setRemoved] = useState<Removed[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setManifest(wallStore.manifest());
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(STATS_CHANNEL);
      bc.onmessage = (e) => {
        if (e.data?.type !== "stats") return;
        setStats(e.data);
        setManifest((m) => (m && m.version === e.data.manifestVersion ? m : wallStore.manifest()));
      };
    } catch {}
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      bc?.close();
      clearInterval(t);
    };
  }, []);

  const byId = useMemo(() => new Map((manifest?.photos ?? []).map((p) => [p.id, p])), [manifest]);
  const removedIds = new Set(removed.filter((r) => !r.undone).map((r) => r.photo.id));
  const upNext = (stats?.upNext ?? []).map((id) => byId.get(id)).filter((p): p is WallPhoto => !!p && !removedIds.has(p.id));
  const onScreen = (stats?.onScreen ?? []).map((id) => byId.get(id)).filter((p): p is WallPhoto => !!p);
  const needle = q.trim().toLowerCase();
  const match = (p: WallPhoto) =>
    (filter === "all" || p.source === filter) && (!needle || [p.name, p.caption].some((s) => s?.toLowerCase().includes(needle)));

  const key = stats?.key ?? wallStore.key();
  const call = async (photoId: string, undo = false) => {
    if (!key) {
      toast.error("This window doesn't know the wall key. Open it on the wall computer.");
      return false;
    }
    try {
      const res = await fetch("/api/wall/remove", { method: "POST", headers: { "Content-Type": "application/json", "x-wall-key": key }, body: JSON.stringify({ photoId, undo }) });
      return res.ok && (await res.json()).ok;
    } catch {
      return false;
    }
  };

  const remove = async (p: WallPhoto) => {
    setConfirming(null);
    const ok = await call(p.id);
    if (!ok) {
      toast.error("Couldn't reach the server. Try again, or take it down from the admin on a phone.");
      return;
    }
    setRemoved((r) => [{ photo: p, at: Date.now(), undone: false }, ...r]);
    toast.success("Taken off every wall. It leaves this screen at its next swap.", { action: { label: "Undo", onClick: () => undo(p) } });
  };
  const undo = async (p: WallPhoto) => {
    if (await call(p.id, true)) setRemoved((r) => r.map((x) => (x.photo.id === p.id ? { ...x, undone: true } : x)));
    else toast.error("Couldn't put it back.");
  };

  const stale = !stats || now - stats.at > 5000;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-5 text-sm">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{stats?.wallName ?? manifest?.wall.name ?? "Wall"} · stats</h1>
        {stale ? (
          <Badge variant="destructive">Not hearing from the wall. Is it open in this browser?</Badge>
        ) : (
          <>
            <Badge variant={stats.online ? "secondary" : "destructive"}>{stats.online ? "Online" : "Offline"}</Badge>
            <span className="text-muted-foreground">
              v{stats.manifestVersion} · {stats.ready}/{stats.total} ready{stats.cachedOnDisk !== null ? ` · ${stats.cachedOnDisk} on disk` : ""} · {stats.grid.cols}×{stats.grid.rows} · {stats.swaps} swaps
            </span>
            {stats.warning && <span className="text-amber-400">{stats.warning}</span>}
            {stats.fastLane && stats.fastLane.at > now - 15000 && (
              <Badge>New guest photo {stats.fastLane.at > now ? `in ${Math.ceil((stats.fastLane.at - now) / 1000)} s` : "just landed"}</Badge>
            )}
          </>
        )}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">On screen now</h2>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {onScreen.map((p) => (
            <Thumb key={p.id} p={p} onRemove={() => setConfirming(p)} small />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-medium">Up next</h2>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name or caption" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-64 pl-8" />
          </div>
          <ToggleGroup type="single" size="sm" variant="outline" value={filter} onValueChange={(v) => v && setFilter(v as typeof filter)}>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="guest">Guests</ToggleGroupItem>
            <ToggleGroupItem value="roster">Roster</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
          {upNext.filter(match).slice(0, 200).map((p) => (
            <li key={p.id} className="relative">
              <span className="absolute top-1 left-1 z-10 rounded bg-black/70 px-1.5 font-mono text-[11px]">#{upNext.indexOf(p) + 1}</span>
              <Thumb p={p} onRemove={() => setConfirming(p)} />
            </li>
          ))}
        </ol>
        {!upNext.length && <p className="text-muted-foreground">Nothing queued yet.</p>}
      </section>

      {removed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Taken down from this window</h2>
          <ul className="flex flex-col gap-1">
            {removed.map((r) => (
              <li key={r.photo.id + r.at} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl("thumb", r.photo.hash)} alt="" className="size-10 rounded object-cover" />
                <span className="flex-1">
                  {r.photo.name ?? (r.photo.source === "roster" ? "Roster" : "Guest")} · {new Date(r.at).toLocaleTimeString()}
                  {r.undone && " · put back"}
                </span>
                {!r.undone && (
                  <Button size="sm" variant="outline" onClick={() => undo(r.photo)}>
                    <Undo2Icon data-icon="inline-start" />
                    Put back
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take this photo off every wall?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.caption ? `“${confirming.caption}” ` : ""}
              {confirming?.name ? `from ${confirming.name}. ` : ""}You can put it back afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirming && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl("view", confirming.hash)} alt="" className="max-h-72 w-full rounded object-contain" />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && remove(confirming)}>Take it down</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Thumb({ p, onRemove, small }: { p: WallPhoto; onRemove: () => void; small?: boolean }) {
  return (
    <button type="button" onClick={onRemove} title="Take off the wall" className={small ? "group relative size-20 shrink-0 overflow-hidden rounded" : "group relative block aspect-[4/3] w-full overflow-hidden rounded"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgUrl("thumb", p.hash)} alt={p.caption ?? ""} className="size-full object-cover" loading="lazy" />
      {!small && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 px-1.5 pt-4 pb-1 text-left text-[11px]">
          {p.name ?? (p.source === "roster" ? "Roster" : "Guest")}
          {p.caption ? ` · ${p.caption}` : ""}
        </span>
      )}
      <span className="absolute inset-0 hidden items-center justify-center bg-red-600/70 text-xs font-semibold group-hover:flex">Take down</span>
    </button>
  );
}

"use client";

import { CopyIcon, RefreshCwIcon, RotateCwIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatLogLine, STATS_CHANNEL, type LogEntry, type LogKind, type WallCommand, type WallStatsMessage } from "@/wall/stats";
import { wallStore } from "@/wall/storage";
import { imgUrl, type WallManifest, type WallPhoto } from "@/wall/types";

type Filter = "all" | "new" | "guest" | "roster";
const PAGE = 120;
/** a guest photo approved within this long counts as "new" */
const NEW_MS = 60 * 60_000;

/**
 * Opened in a second window on the wall computer. It reads what the wall is doing over a
 * BroadcastChannel (same browser), and can take a photo off every wall in a hurry.
 */
export function StatsApp() {
  const [stats, setStats] = useState<WallStatsMessage | null>(null);
  const [manifest, setManifest] = useState<WallManifest | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [confirming, setConfirming] = useState<WallPhoto | null>(null);
  const [lastRemoved, setLastRemoved] = useState<WallPhoto | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const [swapRate, setSwapRate] = useState<number | null>(null);
  const bc = useRef<BroadcastChannel | null>(null);
  const swapHistory = useRef<{ at: number; swaps: number }[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setManifest(wallStore.manifest());
    try {
      bc.current = new BroadcastChannel(STATS_CHANNEL);
      bc.current.onmessage = (e) => {
        const s = e.data as WallStatsMessage;
        if (s?.type !== "stats") return;
        setStats(s);
        setManifest((m) => (m && m.version === s.manifestVersion ? m : wallStore.manifest()));
        // swaps per minute over the last minute
        const h = swapHistory.current;
        h.push({ at: s.at, swaps: s.swaps });
        while (h.length > 2 && h[0].at < s.at - 60_000) h.shift();
        const span = (h[h.length - 1].at - h[0].at) / 1000;
        setSwapRate(span >= 10 ? ((h[h.length - 1].swaps - h[0].swaps) * 60) / span : null);
      };
    } catch {}
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      bc.current?.close();
      clearInterval(t);
    };
  }, []);

  const send = (msg: WallCommand) => bc.current?.postMessage(msg);

  const byId = useMemo(() => new Map((manifest?.photos ?? []).map((p) => [p.id, p])), [manifest]);
  const loop = useMemo(
    () => (stats?.upNext ?? []).map((id) => byId.get(id)).filter((p): p is WallPhoto => !!p && !hidden.has(p.id)),
    [stats?.upNext, byId, hidden],
  );
  const position = useMemo(() => new Map(loop.map((p, i) => [p.id, i])), [loop]);
  const isNew = (p: WallPhoto) => p.source === "guest" && now - p.at < NEW_MS;
  const needle = q.trim().toLowerCase().replace(/^#/, "");
  const list = loop.filter(
    (p) =>
      (filter === "all" || (filter === "new" ? isNew(p) : p.source === filter)) &&
      (!needle || [label(p), p.caption, String((position.get(p.id) ?? 0) + 1)].some((s) => s?.toLowerCase().includes(needle))),
  );
  const every = stats?.every ?? 1;
  const eta = (i: number) => {
    const sec = Math.round((i + 1) * every);
    return sec < 60 ? `in ${sec} s` : `in ~${Math.round(sec / 60)} min`;
  };
  const guests = loop.filter((p) => p.source === "guest").length;

  const key = stats?.key ?? wallStore.key();
  const call = async (photoId: string, undo = false) => {
    if (!key) {
      toast.error("This window doesn’t know the wall key. Open it on the wall computer.");
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
    if (!(await call(p.id))) {
      toast.error("Couldn’t reach the server. Try again, or take it down from the admin on a phone.");
      return;
    }
    setHidden((h) => new Set(h).add(p.id));
    setLastRemoved(p);
    send({ type: "note", k: "remove", m: `Took ${describe(p)} off the wall` });
  };
  const undo = async () => {
    const p = lastRemoved;
    if (!p) return;
    if (!(await call(p.id, true))) {
      toast.error("Couldn’t put it back. Try again, or restore it from Photos.");
      return;
    }
    setHidden((h) => {
      const n = new Set(h);
      n.delete(p.id);
      return n;
    });
    setLastRemoved(null);
    send({ type: "note", k: "remove", m: `Put ${describe(p)} back` });
  };
  useEffect(() => {
    if (!lastRemoved) return;
    const t = setTimeout(() => setLastRemoved(null), 15000);
    return () => clearTimeout(t);
  }, [lastRemoved]);

  const stale = !stats || now - stats.at > 5000;
  const copyLog = async () => {
    const text = (stats?.log ?? []).map(formatLogLine).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Log copied.");
    } catch {
      toast.error("The browser blocked copying.");
    }
  };

  return (
    <main className="flex min-h-dvh flex-col gap-5 bg-zinc-950 p-5 text-sm text-zinc-50 lg:h-dvh lg:overflow-hidden lg:px-8 lg:py-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold lg:text-2xl">{stats?.wallName ?? manifest?.wall.name ?? "Wall"} · stats</h1>
        <div className="flex flex-wrap gap-2">
          {stale ? (
            <Pill tone="bad">Not hearing from the wall. Is it open in this browser?</Pill>
          ) : (
            <>
              <Pill tone={stats.online ? "good" : "bad"}>
                ● {stats.online ? "Online" : "Offline"}
                {stats.lastSyncAt ? ` · last sync ${ago(now - stats.lastSyncAt)}` : ""}
              </Pill>
              <Pill>Uptime {duration(now - stats.startedAt)}</Pill>
            </>
          )}
        </div>
      </header>

      {!stale && stats.warning && <p className="-mt-2 text-amber-300">{stats.warning}</p>}

      <div className="flex min-h-0 flex-1 flex-col gap-5 lg:flex-row">
        <div className="flex min-h-0 flex-col gap-4 lg:w-[42%] lg:shrink-0">
          <section aria-label="What the wall shows now" className="flex flex-col gap-2">
            <Mirror stats={stale ? null : stats} byId={byId} hidden={hidden} onPick={setConfirming} />
            <span className="text-xs text-zinc-400">What the wall shows now, updated every second. Click a photo to take it off.</span>
          </section>

          <section aria-labelledby="next-h" className="relative flex min-h-[320px] flex-1 flex-col gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2">
              <div className="flex items-baseline gap-2.5">
                <h2 id="next-h" className="text-[15px] font-semibold">
                  Up next
                </h2>
                <span className="text-xs text-zinc-400 tabular-nums">
                  {loop.length} in rotation · {guests} guest · full loop ~{Math.max(1, Math.round((loop.length * every) / 60))} min
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-zinc-500" />
                  <Input
                    type="search"
                    aria-label="Search up next"
                    placeholder="Name, caption or #"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setLimit(PAGE);
                    }}
                    className="h-7 w-48 border-zinc-700 bg-zinc-950 pl-7 text-xs"
                  />
                </div>
                <div role="tablist" aria-label="Filter" className="flex gap-0.5 rounded-lg bg-zinc-950 p-0.5">
                  {(
                    [
                      ["all", "All"],
                      ["new", "New"],
                      ["guest", "Guests"],
                      ["roster", "Roster"],
                    ] as const
                  ).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={filter === v}
                      onClick={() => {
                        setFilter(v);
                        setLimit(PAGE);
                      }}
                      className={cn("rounded-md px-2.5 py-1 text-xs", filter === v ? "bg-zinc-800 text-zinc-50" : "text-zinc-400 hover:text-zinc-200")}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <ol className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                {list.slice(0, limit).map((p) => {
                  const pos = position.get(p.id) ?? 0;
                  return (
                    <li key={p.id} className="flex min-w-0 flex-col gap-0.5">
                      <div className={cn("relative h-12 overflow-hidden rounded", isNew(p) && "outline-2 outline-blue-400")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgUrl("thumb", p.hash)} alt="" loading="lazy" className="size-full object-cover" />
                        <span className="absolute top-0.5 left-0.5 rounded-sm bg-zinc-950/75 px-1 text-[10px] text-zinc-200 tabular-nums">#{pos + 1}</span>
                        <button
                          type="button"
                          onClick={() => setConfirming(p)}
                          aria-label={`Take ${describe(p)} off the wall`}
                          title={`Take ${describe(p)} off the wall`}
                          className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-zinc-950/70 text-zinc-50 hover:bg-red-600"
                        >
                          <XIcon className="size-3" />
                        </button>
                      </div>
                      <span className="truncate text-[11px] text-zinc-300">
                        {label(p)}
                        {isNew(p) ? " · new" : ""}
                      </span>
                      <span className="text-[10.5px] text-zinc-500">{eta(pos)}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="flex flex-col items-center gap-2 pt-3 pb-0.5 text-center text-xs text-zinc-500">
                {stale && !loop.length
                  ? "The queue shows up once the wall is open in this browser."
                  : list.length === 0
                    ? "Nothing in the loop matches."
                    : needle || filter !== "all"
                      ? `${list.length} match${list.length === 1 ? "" : "es"}${list.length > limit ? `, showing the first ${limit}` : ""}.`
                      : list.length > limit
                        ? `Showing the next ${limit} of ${list.length}.`
                        : "That’s the whole loop. It starts again from #1."}
                {list.length > limit && (
                  <Button size="xs" variant="outline" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, list.length - limit)} more
                  </Button>
                )}
              </div>
            </div>
            {lastRemoved && (
              <div role="status" className="absolute inset-x-4 bottom-3.5 flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2.5 text-[13px] text-zinc-950 shadow-xl">
                <span>Took {describe(lastRemoved)} off the wall</span>
                <button type="button" onClick={undo} className="font-semibold underline">
                  Undo
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
          <Tiles stats={stale ? null : stats} swapRate={swapRate} now={now} />
          <section aria-labelledby="log-h" className="flex min-h-[260px] flex-1 flex-col gap-2.5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 px-4.5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="log-h" className="text-[15px] font-semibold">
                Event log
              </h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={stale} onClick={() => send({ type: "command", cmd: "resync" })} title="Ask the server for the latest photos and settings now">
                  <RefreshCwIcon data-icon="inline-start" />
                  Force resync
                </Button>
                <Button size="sm" variant="outline" disabled={stale} onClick={() => confirm("Reload the wall? It goes blank for a second or two.") && send({ type: "command", cmd: "reload" })}>
                  <RotateCwIcon data-icon="inline-start" />
                  Reload wall
                </Button>
                <Button size="sm" variant="outline" disabled={!stats?.log.length} onClick={copyLog}>
                  <CopyIcon data-icon="inline-start" />
                  Copy log
                </Button>
              </div>
            </div>
            <ol className="flex min-h-0 flex-col gap-1.5 overflow-y-auto font-mono text-[13px]">
              {(stats?.log ?? []).map((e, i) => (
                <LogLine key={`${e.at}-${i}`} e={e} />
              ))}
              {!stats?.log.length && <li className="text-zinc-500">Nothing yet.</li>}
            </ol>
          </section>
        </div>
      </div>

      <AlertDialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take this photo off the wall?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming && `${label(confirming)}${confirming.source === "guest" ? " (guest)" : ""}${confirming.caption ? `, “${confirming.caption}”` : ""}. `}
              {confirming?.source === "guest"
                ? "It leaves every wall and the guest gallery within about 15 seconds. The guest isn’t notified. You can put it back from Photos."
                : "It stops playing on every wall within about 15 seconds. The file is kept, so you can put it back from Photos."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirming && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl("view", confirming.hash)} alt="" className="max-h-72 w-full rounded object-contain" />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => confirming && remove(confirming)}>
              Take off the wall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Mirror({ stats, byId, hidden, onPick }: { stats: WallStatsMessage | null; byId: Map<string, WallPhoto>; hidden: Set<string>; onPick: (p: WallPhoto) => void }) {
  if (!stats) return <div className="flex aspect-video items-center justify-center rounded-lg border border-zinc-800 text-zinc-500">Waiting for the wall…</div>;
  const { cols, rows } = stats.grid;
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black" style={{ aspectRatio: String(stats.aspect || 16 / 9) }}>
      <div className="grid size-full" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {stats.cells.map((id, i) => {
          const p = id ? byId.get(id) : undefined;
          if (!p) return <span key={i} className="bg-zinc-900" />;
          const fresh = stats.fastLane?.photoId === p.id;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick(p)}
              title={`${describe(p)} · take off the wall`}
              className={cn("group relative min-h-0 overflow-hidden", fresh && "outline-2 -outline-offset-2 outline-blue-400", hidden.has(p.id) && "opacity-30")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgUrl("thumb", p.hash)} alt="" className="size-full object-cover" />
              <span className="absolute inset-0 hidden items-center justify-center bg-red-600/60 group-hover:flex">
                <XIcon className="size-4" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tiles({ stats, swapRate, now }: { stats: WallStatsMessage | null; swapRate: number | null; now: number }) {
  const dash = "–";
  const s = stats;
  const inSync = s && s.serverVersion !== null ? s.serverVersion === s.manifestVersion : null;
  const target = s ? 60 / s.every : 0;
  const tiles: { label: string; value: string; sub: string; tone?: "good" | "warn" | "bad" | "info" }[] = [
    {
      label: "Manifest",
      value: s ? `v${s.manifestVersion}` : dash,
      sub: !s ? "" : inSync === null ? "server not checked yet" : inSync ? `server v${s.serverVersion} · in sync` : `server v${s.serverVersion} · catching up`,
      tone: inSync === null ? undefined : inSync ? "good" : "warn",
    },
    {
      label: "Cached photos",
      value: s ? `${s.ready} / ${s.total}` : dash,
      sub: !s
        ? ""
        : [s.failed ? `${s.failed} failed` : null, s.cachedOnDisk !== null ? `${s.cachedOnDisk} on disk` : null, s.storage.usage ? bytes(s.storage.usage) : null, s.storage.persisted === null ? null : s.storage.persisted ? "persisted" : "not persisted"]
            .filter(Boolean)
            .join(" · ") || "counting…",
      tone: s && s.failed ? "warn" : s && s.ready === s.total ? "good" : undefined,
    },
    {
      label: "Swaps / min",
      value: swapRate === null ? dash : String(Math.round(swapRate)),
      sub: s ? `target ${Math.round(target)} (every ${s.every.toFixed(1)} s)` : "",
    },
    {
      label: "Changing now",
      value: s ? `${s.changing} / ${s.limit}` : dash,
      sub: s ? `max ${Math.round(s.maxChanging * 100)}% of ${s.grid.cols * s.grid.rows} cells` : "",
    },
    {
      label: "Frame rate",
      value: s?.fps != null ? `${s.fps} fps` : dash,
      sub: s ? (s.fps == null ? "wall tab is hidden" : `${s.slowFrames} slow frame${s.slowFrames === 1 ? "" : "s"} in 10 min`) : "",
      tone: s?.fps == null ? undefined : s.fps >= 50 ? "good" : s.fps >= 30 ? "warn" : "bad",
    },
    {
      label: "Priority queue",
      value: s ? String(s.priority) : dash,
      sub:
        s?.fastLane && s.fastLane.at > now - 15000
          ? s.fastLane.at > now
            ? `a guest photo lands in ${Math.ceil((s.fastLane.at - now) / 1000)} s`
            : "a guest photo just landed"
          : "approvals waiting for a slot",
      tone: s && (s.priority > 0 || (s.fastLane && s.fastLane.at > now - 15000)) ? "info" : undefined,
    },
    {
      label: "Design / motion",
      value: s ? `v${s.designVersion} / v${s.motionVersion}` : dash,
      sub: s ? `${s.fontsLoaded ? "fonts loaded" : "fonts loading"} · QR ${s.showQr ? "shown" : "hidden"}` : "",
    },
    {
      label: "Wake lock",
      value: s ? (s.wakeLock ? "On" : "Off") : dash,
      sub: s ? `last watchdog reload: ${s.lastWatchdogReload ? `${ago(now - s.lastWatchdogReload)}` : "none"}` : "",
      tone: s ? (s.wakeLock ? "good" : "warn") : undefined,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3.5">
          <span className="text-[13px] text-zinc-400">{t.label}</span>
          <span className={cn("text-2xl font-bold tabular-nums", toneText(t.tone))}>{t.value}</span>
          <span className="text-xs text-zinc-400">
            {t.sub}
          </span>
        </div>
      ))}
    </div>
  );
}

const KIND_TONE: Record<LogKind, "good" | "warn" | "bad" | "info" | undefined> = {
  start: undefined,
  sync: "good",
  cache: "good",
  net: "good",
  shown: "info",
  admin: "info",
  skip: "warn",
  warn: "warn",
  remove: "warn",
  reload: "warn",
};

function LogLine({ e }: { e: LogEntry }) {
  const tone = e.k === "net" && e.m.startsWith("Offline") ? "warn" : KIND_TONE[e.k];
  return (
    <li className="flex gap-3.5">
      <span className="shrink-0 text-zinc-500 tabular-nums">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
      <span className={cn("w-16 shrink-0", toneText(tone) || "text-zinc-50")}>{e.k}</span>
      <span className="text-zinc-200">{e.m}</span>
    </li>
  );
}

function Pill({ tone, children }: { tone?: "good" | "bad"; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-3 py-1.5 text-sm", tone === "good" ? "bg-green-950 font-semibold text-green-300" : tone === "bad" ? "bg-red-950 font-semibold text-red-300" : "bg-zinc-800 text-zinc-200")}>
      {children}
    </span>
  );
}

const toneText = (t?: "good" | "warn" | "bad" | "info") =>
  t === "good" ? "text-green-300" : t === "warn" ? "text-amber-300" : t === "bad" ? "text-red-300" : t === "info" ? "text-blue-300" : "";

const label = (p: WallPhoto) => p.name ?? (p.source === "roster" ? "Roster photo" : "Guest");
const describe = (p: WallPhoto) => (p.source === "guest" ? `${p.name ?? "a guest"}’s photo` : p.name ? `roster photo ${p.name}` : "a roster photo");

function duration(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} m`;
  return `${Math.floor(m / 60)} h ${m % 60} m`;
}
function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}
function bytes(n: number) {
  return n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n < 1e6 ? "<1 MB" : `${Math.round(n / 1e6)} MB`;
}

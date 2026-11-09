"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BUILD_ID } from "@/lib/build";
import { WallPlayer, type PlayerHandle } from "@/wall/player";
import { STATS_CHANNEL, STATS_VERSION, wallLog, watchdogStore, type LogEntry, type LogKind, type WallCommand, type WallStatsMessage } from "@/wall/stats";
import { countCached, registerServiceWorker, wallStore } from "@/wall/storage";
import { imgUrl, type WallManifest } from "@/wall/types";

export function WallApp() {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [manifest, setManifest] = useState<WallManifest | null>(null);
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(0);
  const [showStatus, setShowStatus] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [wakeLock, setWakeLock] = useState(false);
  const [cachedOnDisk, setCachedOnDisk] = useState<number | null>(null);
  const player = useRef<PlayerHandle>(null);
  const manifestRef = useRef<WallManifest | null>(null);
  const fastLane = useRef(new Set<string>());
  const lastFast = useRef<{ photoId: string; at: number } | null>(null);
  const shownBatch = useRef<string[]>([]);
  const loadedAt = useRef(0);
  const fetching = useRef<Promise<void> | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const warningRef = useRef<string | null>(null);
  // for the stats window
  const logRef = useRef<LogEntry[]>([]);
  const startedAt = useRef(0);
  const lastSyncAt = useRef<number | null>(null);
  const serverVersion = useRef<number | null>(null);
  const failed = useRef(new Set<string>());
  const newlyCached = useRef(0);
  const storageInfo = useRef<{ usage: number | null; persisted: boolean | null }>({ usage: null, persisted: null });
  // a newer deploy is live: reload at a quiet moment so the wall runs the new code
  const update = useRef<{ build: string; at: number } | null>(null);
  const frames = useRef({ fps: null as number | null, slow: [] as number[] });
  const note = useCallback((k: LogKind, m: string) => {
    logRef.current = wallLog.add(k, m);
  }, []);

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);
  useEffect(() => {
    warningRef.current = warning;
  }, [warning]);

  // ---- boot ----
  useEffect(() => {
    loadedAt.current = Date.now();
    startedAt.current = Date.now();
    logRef.current = wallLog.read();
    const k = new URLSearchParams(location.search).get("key")?.toUpperCase() ?? wallStore.key();
    if (!k) {
      router.replace("/wall");
      return;
    }
    wallStore.setKey(k);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the key and cached manifest live in localStorage, readable only after mount
    setKey(k);
    const cached = wallStore.manifest();
    if (cached) {
      manifestRef.current = cached;
      setManifest(cached);
    }
    note("start", cached ? `Started from the saved copy of the wall (v${cached.version}, ${cached.photos.length} photos)` : "Started with nothing saved yet, downloading the wall");
    registerServiceWorker();
  }, [router, note]);

  const loadManifest = useCallback(async () => {
    if (!key) return;
    if (fetching.current) return fetching.current;
    fetching.current = (async () => {
      try {
        const res = await fetch(`/api/wall/manifest?key=${encodeURIComponent(key)}`, { cache: "no-store" });
        if (res.status === 404) {
          wallStore.clearKey();
          router.replace("/wall?change=1");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const m = (await res.json()) as WallManifest;
        lastSyncAt.current = Date.now();
        serverVersion.current = m.version;
        if (m.resyncAt && m.resyncAt > loadedAt.current && manifestRef.current?.resyncAt !== m.resyncAt && manifestRef.current) {
          wallStore.setManifest(m);
          note("reload", "Resync requested from the admin, reloading");
          location.reload();
          return;
        }
        const prev = manifestRef.current;
        if (!prev) note("sync", `Downloaded the wall (v${m.version}, ${m.photos.length} photos)`);
        else if (prev.version !== m.version) note("sync", describeChange(prev, m));
        wallStore.setManifest(m);
        if (manifestRef.current?.version !== m.version || manifestRef.current?.resyncAt !== m.resyncAt) manifestRef.current = m;
        setManifest((prev) => (prev && prev.version === m.version && prev.resyncAt === m.resyncAt ? prev : m));
        setOnline(true);
      } catch {
        setOnline(false);
      } finally {
        fetching.current = null;
      }
    })();
    return fetching.current;
  }, [key, router, note]);

  useEffect(() => {
    loadManifest();
  }, [loadManifest]);

  // ---- fast lane ----
  const retryRef = useRef<(photoId: string, attempt: number) => void>(() => {});
  const tryReserve = useCallback(
    async (photoId: string, attempt = 0) => {
      const m = manifestRef.current;
      const p = player.current;
      if (!m || !p || !key || !fastLane.current.has(photoId)) return;
      const r = p.reserve(photoId, m.playlist.fastLaneLead, m.playlist.fastLaneHold);
      if (!r) {
        if (attempt < 20) setTimeout(() => retryRef.current(photoId, attempt + 1), 1000);
        return;
      }
      fastLane.current.delete(photoId);
      const inMs = Math.max(0, (r.showAt - performance.now() / 1000) * 1000);
      lastFast.current = { photoId, at: Date.now() + inMs };
      const ph = m.photos.find((x) => x.id === photoId);
      note("shown", `${ph?.name ?? "A guest"}’s new photo lands in cell ${r.row + 1}-${r.col + 1} in ${Math.round(inMs / 1000)} s`);
      try {
        await fetch("/api/wall/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wall-key": key },
          body: JSON.stringify({ photoId, row: r.row, col: r.col, rows: r.rows, cols: r.cols, inMs, hold: r.hold }),
        });
      } catch {}
    },
    [key, note],
  );
  useEffect(() => {
    retryRef.current = (id, attempt) => void tryReserve(id, attempt);
  }, [tryReserve]);

  // ---- live events + heartbeat ----
  useEffect(() => {
    if (!key) return;
    const es = new EventSource(`/api/wall/events?key=${encodeURIComponent(key)}`);
    es.onopen = () => setOnline(true);
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data);
        if (e.type === "manifest" && e.version !== manifestRef.current?.version) loadManifest();
        if (e.type === "resync") {
          note("reload", "Resync requested from the admin, reloading");
          location.reload();
        }
        if (e.type === "approved" && manifestRef.current?.wall.primary) {
          fastLane.current.add(e.photoId);
          loadManifest().then(() => {
            if (player.current?.engine()?.isReady(e.photoId)) tryReserve(e.photoId);
          });
        }
      } catch {}
    };
    es.onerror = () => setOnline(navigator.onLine && es.readyState === EventSource.OPEN);

    const beat = async () => {
      const m = manifestRef.current;
      const engine = player.current?.engine();
      try {
        const res = await fetch("/api/wall/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wall-key": key },
          body: JSON.stringify({
            manifestVersion: m?.version ?? 0,
            cached: player.current?.readyCount() ?? 0,
            total: m?.photos.length ?? 0,
            width: Math.round(screen.width * devicePixelRatio),
            height: Math.round(screen.height * devicePixelRatio),
            userAgent: navigator.userAgent.slice(0, 300),
            online: true,
            installed: matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches,
            wakeLock: !!wakeRef.current,
            swaps: engine?.swaps ?? 0,
            warning: warningRef.current,
          }),
        });
        if (!res.ok) throw new Error();
        const b = await res.json();
        if (b.build && b.build !== BUILD_ID && update.current === null && !triedUpdate(b.build)) {
          update.current = { build: b.build, at: Date.now() };
          note("reload", `New version deployed (${b.build.slice(0, 7)}), reloading at a quiet moment`);
        }
        lastSyncAt.current = Date.now();
        serverVersion.current = b.version ?? null;
        setOnline(true);
        if (m && (b.version !== m.version || (b.resyncAt && b.resyncAt !== m.resyncAt))) loadManifest();
      } catch {
        setOnline(false);
      }
      const ids = shownBatch.current.splice(0);
      if (ids.length)
        fetch("/api/wall/shown", { method: "POST", headers: { "Content-Type": "application/json", "x-wall-key": key }, body: JSON.stringify({ ids }) }).catch(() => {
          shownBatch.current.push(...ids);
        });
    };
    const hb = setInterval(beat, 15000);
    const first = setTimeout(beat, 2000);
    const onOnline = () => {
      setOnline(true);
      loadManifest();
    };
    const onOffline = () => setOnline(false);
    addEventListener("online", onOnline);
    addEventListener("offline", onOffline);
    return () => {
      es.close();
      clearInterval(hb);
      clearTimeout(first);
      removeEventListener("online", onOnline);
      removeEventListener("offline", onOffline);
    };
  }, [key, loadManifest, tryReserve, note]);

  // ---- screen wake lock ----
  useEffect(() => {
    let stop = false;
    const request = async () => {
      try {
        if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
        wakeRef.current = await navigator.wakeLock.request("screen");
        setWakeLock(true);
        wakeRef.current.addEventListener("release", () => {
          setWakeLock(false);
          if (!stop) setTimeout(request, 1000);
        });
      } catch {
        setWakeLock(false);
      }
    };
    request();
    const vis = () => {
      if (document.visibilityState === "visible" && (!wakeRef.current || wakeRef.current.released)) request();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", vis);
      wakeRef.current?.release().catch(() => {});
    };
  }, []);

  // ---- keyboard: S status, F fullscreen ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "s" || e.key === "S") setShowStatus((v) => !v);
      if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // ---- log going offline / online, and effect warnings ----
  const offlineSince = useRef<number | null>(null);
  useEffect(() => {
    if (!key) return;
    if (!online && offlineSince.current === null) {
      offlineSince.current = Date.now();
      note("net", "Offline, playing from the saved photos and retrying");
    } else if (online && offlineSince.current !== null) {
      note("net", `Back online after ${duration(Date.now() - offlineSince.current)}`);
      offlineSince.current = null;
    }
  }, [online, key, note]);
  useEffect(() => {
    if (warning) note("warn", warning);
  }, [warning, note]);

  // ---- frame rate ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let count = 0;
    let windowStart = last;
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      count++;
      // a long gap while the tab is visible is a dropped frame; a hidden tab doesn't count
      if (dt > 50 && dt < 5000 && document.visibilityState === "visible") frames.current.slow.push(Date.now());
      if (t - windowStart >= 1000) {
        frames.current.fps = Math.round((count * 1000) / (t - windowStart));
        count = 0;
        windowStart = t;
        const cutoff = Date.now() - 10 * 60_000;
        frames.current.slow = frames.current.slow.filter((x) => x > cutoff);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- stats channel + watchdog + disk cache count ----
  const live = useRef({ online, cachedOnDisk, warning, wakeLock });
  useEffect(() => {
    live.current = { online, cachedOnDisk, warning, wakeLock };
  }, [online, cachedOnDisk, warning, wakeLock]);
  useEffect(() => {
    if (!key) return;
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(STATS_CHANNEL);
      bc.onmessage = (e: MessageEvent<WallCommand>) => {
        const c = e.data;
        if (c?.type === "note") note(c.k, c.m);
        if (c?.type === "command" && c.cmd === "resync") {
          note("admin", "Resync pressed on the stats screen, checking the server");
          void loadManifest();
        }
        if (c?.type === "command" && c.cmd === "reload") {
          note("reload", "Reload pressed on the stats screen");
          location.reload();
        }
      };
    } catch {}
    let lastSwaps = -1;
    let stalled = 0;
    let tick = 0;
    const t = setInterval(() => {
      const m = manifestRef.current;
      const engine = player.current?.engine();
      if (!m || !engine) return;
      // count only photos still in the manifest (a removed photo stays decoded in memory)
      const ready = m.photos.reduce((n, p) => n + (engine.isReady(p.id) ? 1 : 0), 0);
      tick++;
      if (newlyCached.current && tick % 5 === 0) {
        note("cache", `Saved ${newlyCached.current} photo${newlyCached.current === 1 ? "" : "s"} (${ready} of ${m.photos.length} ready)`);
        newlyCached.current = 0;
      }
      const act = engine.activity();
      const { online, cachedOnDisk, warning, wakeLock } = live.current;
      const msg: WallStatsMessage = {
        type: "stats",
        v: STATS_VERSION,
        wallName: m.wall.name,
        key,
        online,
        lastSyncAt: lastSyncAt.current,
        startedAt: startedAt.current,
        manifestVersion: m.version,
        serverVersion: serverVersion.current,
        designVersion: m.designVersion,
        motionVersion: m.motion.version,
        ready,
        total: m.photos.length,
        failed: failed.current.size,
        cachedOnDisk,
        storage: storageInfo.current,
        swaps: engine.swaps,
        every: act.every,
        changing: act.changing,
        limit: act.limit,
        maxChanging: act.maxChanging,
        priority: act.priority,
        fps: document.visibilityState === "visible" ? frames.current.fps : null,
        slowFrames: frames.current.slow.length,
        fontsLoaded: document.fonts?.status === "loaded",
        showQr: m.wall.showQr,
        wakeLock,
        lastWatchdogReload: watchdogStore.last(),
        upNext: engine.upNext(1000),
        cells: engine.cellIds(),
        grid: engine.grid(),
        aspect: innerWidth / Math.max(1, innerHeight),
        warning,
        fastLane: lastFast.current,
        log: logRef.current.slice(0, 200),
        at: Date.now(),
      };
      bc?.postMessage(msg);
      // watchdog: if nothing has swapped for 3 minutes while photos are ready, reload the page
      if (engine.swaps === lastSwaps && ready > 1 && document.visibilityState === "visible") stalled++;
      else stalled = 0;
      lastSwaps = engine.swaps;
      // new deploy: wait until no cell is mid-swap and no guest photo is about to land (at most a minute)
      if (update.current) {
        const fastLaneSoon = lastFast.current && lastFast.current.at > Date.now() - 2000 && lastFast.current.at < Date.now() + 60_000;
        const quiet = act.changing === 0 && !fastLaneSoon;
        if (quiet || Date.now() - update.current.at > 60_000) {
          markTriedUpdate(update.current.build);
          location.reload();
          return;
        }
      }
      if (stalled > 180) {
        watchdogStore.mark();
        note("reload", "No swaps for 3 minutes, the watchdog reloaded the wall");
        location.reload();
      }
    }, 1000);
    const disk = async () => {
      const m = manifestRef.current;
      if (m) setCachedOnDisk(await countCached(m.photos.map((p) => imgUrl("view", p.hash))));
      try {
        const [est, persisted] = await Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.()]);
        storageInfo.current = { usage: est?.usage ?? null, persisted: persisted ?? null };
      } catch {}
    };
    const diskT = setInterval(disk, 30000);
    const firstDisk = setTimeout(disk, 3000);
    return () => {
      clearInterval(t);
      clearInterval(diskT);
      clearTimeout(firstDisk);
      bc?.close();
    };
  }, [key, note, loadManifest]);

  if (!manifest)
    return (
      <main className="flex h-dvh items-center justify-center text-zinc-400">
        {online ? "Loading the wall…" : "Waiting for a connection to download the wall for the first time…"}
      </main>
    );

  const total = manifest.photos.length;
  return (
    <main className="h-dvh w-dvw cursor-none overflow-hidden">
      <WallPlayer
        ref={player}
        manifest={manifest}
        onReady={(id, _t, n) => {
          setReady(n);
          newlyCached.current++;
          failed.current.delete(id);
          if (fastLane.current.has(id)) tryReserve(id);
        }}
        onShown={(id) => shownBatch.current.push(id)}
        onWarning={setWarning}
        onFailed={(id) => {
          if (failed.current.has(id)) return;
          failed.current.add(id);
          const p = manifestRef.current?.photos.find((x) => x.id === id);
          note("skip", `Couldn’t load ${p?.name ? `${p.name}’s photo` : `photo ${p?.hash.slice(0, 6) ?? id.slice(0, 6)}`}, skipped it`);
        }}
      />
      {(showStatus || (ready === 0 && total > 0)) && (
        <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-1 rounded-lg bg-black/75 px-3 py-2 font-mono text-xs text-white">
          <span>
            <span className={online ? "text-emerald-400" : "text-amber-400"}>●</span> {online ? `Online · synced v${manifest.version}` : `Offline · playing ${ready} cached photos`}
          </span>
          <span>
            {manifest.wall.name} · {ready}/{total} photos ready{cachedOnDisk !== null ? ` · ${cachedOnDisk} on disk` : ""} · {wakeLock ? "awake" : "no wake lock"}
          </span>
          {warning && <span className="text-amber-300">{warning}</span>}
          <span className="text-zinc-400">S hides this · F full screen</span>
        </div>
      )}
      {total === 0 && (
        <div className="fixed inset-0 flex items-center justify-center text-zinc-400">No photos yet. Add roster photos on the Photos page.</div>
      )}
    </main>
  );
}

function duration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} m ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} m`;
}

function describeChange(prev: WallManifest, next: WallManifest) {
  const parts: string[] = [];
  const before = new Set(prev.photos.map((p) => p.id));
  const after = new Set(next.photos.map((p) => p.id));
  const added = next.photos.filter((p) => !before.has(p.id)).length;
  const removed = prev.photos.filter((p) => !after.has(p.id)).length;
  if (added) parts.push(`${added} photo${added === 1 ? "" : "s"} added`);
  if (removed) parts.push(`${removed} removed`);
  if (prev.designVersion !== next.designVersion) parts.push(`design v${prev.designVersion} → v${next.designVersion}`);
  if (prev.motion.version !== next.motion.version) parts.push(`motion v${prev.motion.version} → v${next.motion.version}`);
  if (prev.wall.cols !== next.wall.cols || prev.wall.rows !== next.wall.rows) parts.push(`grid ${next.wall.cols}×${next.wall.rows}`);
  return `Updated v${prev.version} → v${next.version}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

// remember which build we reloaded for, so a cached old page can't cause a reload loop
const UPDATE_KEY = "lpw-update-tried";
function triedUpdate(build: string) {
  try {
    const t = JSON.parse(sessionStorage.getItem(UPDATE_KEY) ?? "null") as { build: string; at: number } | null;
    return !!t && t.build === build && Date.now() - t.at < 10 * 60_000;
  } catch {
    return false;
  }
}
function markTriedUpdate(build: string) {
  try {
    sessionStorage.setItem(UPDATE_KEY, JSON.stringify({ build, at: Date.now() }));
  } catch {}
}

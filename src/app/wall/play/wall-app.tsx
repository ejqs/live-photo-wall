"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { WallPlayer, type PlayerHandle } from "@/wall/player";
import { countCached, registerServiceWorker, STATS_CHANNEL, wallStore } from "@/wall/storage";
import { imgUrl, type WallManifest } from "@/wall/types";

export type WallStatsMessage = {
  type: "stats";
  wallName: string;
  key: string;
  online: boolean;
  manifestVersion: number;
  ready: number;
  total: number;
  cachedOnDisk: number | null;
  swaps: number;
  upNext: string[];
  onScreen: string[];
  grid: { cols: number; rows: number };
  warning: string | null;
  fastLane: { photoId: string; at: number } | null;
  at: number;
};

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

  useEffect(() => {
    manifestRef.current = manifest;
  }, [manifest]);
  useEffect(() => {
    warningRef.current = warning;
  }, [warning]);

  // ---- boot ----
  useEffect(() => {
    loadedAt.current = Date.now();
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
    registerServiceWorker();
  }, [router]);

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
        if (m.resyncAt && m.resyncAt > loadedAt.current && manifestRef.current?.resyncAt !== m.resyncAt && manifestRef.current) {
          wallStore.setManifest(m);
          location.reload();
          return;
        }
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
  }, [key, router]);

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
      try {
        await fetch("/api/wall/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wall-key": key },
          body: JSON.stringify({ photoId, row: r.row, col: r.col, rows: r.rows, cols: r.cols, inMs, hold: r.hold }),
        });
      } catch {}
    },
    [key],
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
        if (e.type === "resync") location.reload();
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
  }, [key, loadManifest, tryReserve]);

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

  // ---- stats channel + watchdog + disk cache count ----
  useEffect(() => {
    if (!key) return;
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(STATS_CHANNEL);
    } catch {}
    let lastSwaps = -1;
    let stalled = 0;
    const t = setInterval(() => {
      const m = manifestRef.current;
      const engine = player.current?.engine();
      if (!m || !engine) return;
      const msg: WallStatsMessage = {
        type: "stats",
        wallName: m.wall.name,
        key,
        online,
        manifestVersion: m.version,
        ready: player.current?.readyCount() ?? 0,
        total: m.photos.length,
        cachedOnDisk,
        swaps: engine.swaps,
        upNext: engine.upNext(400),
        onScreen: engine.shownIds(),
        grid: engine.grid(),
        warning,
        fastLane: lastFast.current,
        at: Date.now(),
      };
      bc?.postMessage(msg);
      // watchdog: if nothing has swapped for 3 minutes while photos are ready, reload the page
      if (engine.swaps === lastSwaps && (player.current?.readyCount() ?? 0) > 1 && document.visibilityState === "visible") stalled++;
      else stalled = 0;
      lastSwaps = engine.swaps;
      if (stalled > 180) location.reload();
    }, 1000);
    const disk = setInterval(async () => {
      const m = manifestRef.current;
      if (m) setCachedOnDisk(await countCached(m.photos.map((p) => imgUrl("view", p.hash))));
    }, 30000);
    return () => {
      clearInterval(t);
      clearInterval(disk);
      bc?.close();
    };
  }, [key, online, cachedOnDisk, warning]);

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
          if (fastLane.current.has(id)) tryReserve(id);
        }}
        onShown={(id) => shownBatch.current.push(id)}
        onWarning={setWarning}
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

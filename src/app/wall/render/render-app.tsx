"use client";

import { useEffect, useRef, useState } from "react";
import { WallPlayer, type PlayerHandle } from "@/wall/player";
import type { WallManifest } from "@/wall/types";

declare global {
  interface Window {
    __lpw?: {
      ready: boolean;
      error: string | null;
      total: number;
      loaded: number;
      shown: number;
      /** advance the virtual clock by dt seconds */
      step: (dt: number) => void;
    };
  }
}

/**
 * Headless page the worker records frame by frame. The clock only moves when the worker calls
 * window.__lpw.step(), so a slow machine still produces a smooth video.
 */
export function RenderApp() {
  const [manifest, setManifest] = useState<WallManifest | null>(null);
  const player = useRef<PlayerHandle>(null);
  const shown = useRef(new Set<string>());
  const loaded = useRef(0);

  useEffect(() => {
    const api = { ready: false, error: null as string | null, total: 0, loaded: 0, shown: 0, step: (dt: number) => player.current?.advance(dt) };
    window.__lpw = api;
    const q = new URLSearchParams(location.search);
    fetch(`/api/render/manifest?export=${encodeURIComponent(q.get("export") ?? "")}&token=${encodeURIComponent(q.get("token") ?? "")}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        const m = (await r.json()) as WallManifest;
        api.total = m.photos.length;
        setManifest(m);
        if (!m.photos.length) api.error = "No photos to render.";
      })
      .catch((e) => (api.error = String(e)));
  }, []);

  const onReady = (_id: string, total: number, n: number) => {
    loaded.current = n;
    const api = window.__lpw!;
    api.loaded = n;
    if (n >= total) document.fonts.ready.then(() => (api.ready = true));
  };

  if (!manifest) return <main className="h-dvh w-dvw bg-black" />;
  return (
    <main className="h-dvh w-dvw cursor-none overflow-hidden">
      <WallPlayer
        ref={player}
        manifest={manifest}
        mode="render"
        hideQr
        seed={1}
        concurrency={8}
        onReady={onReady}
        onShown={(id) => {
          shown.current.add(id);
          window.__lpw!.shown = shown.current.size;
        }}
      />
    </main>
  );
}

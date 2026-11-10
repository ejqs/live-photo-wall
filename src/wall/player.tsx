"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { WHITEN_AND_DROP, checkEffect, type MotionDoc } from "@/wallmotion";
import { DesignOverlay, FontFaces } from "./design-overlay";
import { ENGINE_CSS, WallEngine, type Reservation } from "./engine";
import { COVER_SELECTOR, coveredCells, qrCells } from "./qr-cell";
import { imgUrl, type WallManifest } from "./types";

export type PlayerHandle = {
  engine: () => WallEngine | null;
  reserve: (photoId: string, lead: number, hold: number) => Reservation | null;
  /** advance the virtual clock (render mode) */
  advance: (seconds: number) => void;
  readyCount: () => number;
};

export type PlayerProps = {
  manifest: WallManifest;
  mode?: "live" | "render";
  hideQr?: boolean;
  seed?: number;
  /** override the effect (live preview of unsaved motion) */
  effectOverride?: { doc: MotionDoc; params: Record<string, number> } | null;
  onReady?: (photoId: string, total: number, ready: number) => void;
  onShown?: (photoId: string) => void;
  onWarning?: (w: string | null) => void;
  /** a photo could not be downloaded or decoded after several tries; it stays out of the rotation */
  onFailed?: (photoId: string) => void;
  /** at most this many images download at once */
  concurrency?: number;
};

export function resolveEffect(manifest: WallManifest): { doc: MotionDoc; params: Record<string, number>; warning: string | null } {
  const res = checkEffect(manifest.motion.effect);
  if (res.ok) return { doc: res.doc, params: manifest.motion.params, warning: null };
  return { doc: WHITEN_AND_DROP, params: {}, warning: `Effect "${manifest.motion.effectName}" could not play; using the built-in effect.` };
}

export const WallPlayer = forwardRef<PlayerHandle, PlayerProps>(function WallPlayer(
  { manifest, mode = "live", hideQr, seed, effectOverride, onReady, onShown, onWarning, onFailed, concurrency = 6 },
  ref,
) {
  const gridRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WallEngine | null>(null);
  const clock = useRef(0);
  const loading = useRef(new Set<string>());
  const readyRef = useRef(new Set<string>());
  const cbs = useRef({ onReady, onShown, onWarning, onFailed });
  cbs.current = { onReady, onShown, onWarning, onFailed };

  const effect = useMemo(() => {
    if (effectOverride) return { ...effectOverride, warning: null };
    return resolveEffect(manifest);
  }, [manifest, effectOverride]);

  const now = () => (mode === "render" ? clock.current : performance.now() / 1000);

  // create the engine once
  useEffect(() => {
    const root = gridRef.current!;
    const engine = new WallEngine(
      root,
      { doc: effect.doc, sliders: manifest.motion.sliders, params: effect.params },
      { mode, seed, onShown: (id) => cbs.current.onShown?.(id) },
    );
    engineRef.current = engine;
    let raf = 0;
    if (mode === "live") {
      const loop = () => {
        engine.tick(performance.now() / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setMotion({ doc: effect.doc, sliders: manifest.motion.sliders, params: effect.params });
    cbs.current.onWarning?.(effect.warning);
  }, [effect, manifest.motion.sliders]);

  useEffect(() => {
    engineRef.current?.setLook(manifest.design.gap, manifest.design.radius);
  }, [manifest.design.gap, manifest.design.radius]);

  useEffect(() => {
    engineRef.current?.setGrid(manifest.wall.cols, manifest.wall.rows, now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest.wall.cols, manifest.wall.rows]);

  // the QR card's cell stays free of photos
  const qrHidden = !!hideQr || !manifest.wall.showQr;
  const blocked = useMemo(
    () => qrCells(manifest.design, manifest.wall.cols, manifest.wall.rows, qrHidden).join(","),
    [manifest.design, manifest.wall.cols, manifest.wall.rows, qrHidden],
  );
  useEffect(() => {
    engineRef.current?.setBlocked(blocked ? blocked.split(",").map(Number) : [], now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocked, manifest.wall.cols, manifest.wall.rows]);

  // a floating QR card covers parts of some cells: only roster photos play there
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const engine = engineRef.current;
      if (!engine) return;
      const cards = [...root.querySelectorAll<HTMLElement>(COVER_SELECTOR)].map((e) => e.getBoundingClientRect());
      engine.setRosterOnly(coveredCells(engine.cellRects(), cards), now());
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    root.querySelectorAll(COVER_SELECTOR).forEach((e) => ro.observe(e));
    measure();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest.design, manifest.wall.cols, manifest.wall.rows, qrHidden]);

  // photo list + background download (only fully decoded photos enter the rotation)
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPhotos(manifest.photos, manifest.playlist.order, now());
    const queue = manifest.photos.filter((p) => !readyRef.current.has(p.id) && !loading.current.has(p.id));
    let cancelled = false;
    const total = manifest.photos.length;
    const next = async (): Promise<void> => {
      const p = queue.shift();
      if (!p || cancelled) return;
      loading.current.add(p.id);
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        try {
          const img = new Image();
          img.decoding = "async";
          img.src = imgUrl("view", p.hash);
          await img.decode();
          readyRef.current.add(p.id);
          engineRef.current?.markReady(p.id, now());
          cbs.current.onReady?.(p.id, total, readyRef.current.size);
          break;
        } catch {
          if (attempt === 3) cbs.current.onFailed?.(p.id);
          else await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        }
      }
      loading.current.delete(p.id);
      return next();
    };
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => next());
    void Promise.all(workers);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest.photos, manifest.playlist.order]);

  useImperativeHandle(ref, () => ({
    engine: () => engineRef.current,
    reserve: (id, lead, hold) => engineRef.current?.reserve(id, lead, hold, now()) ?? null,
    advance: (s) => {
      clock.current += s;
      engineRef.current?.tick(clock.current);
    },
    readyCount: () => readyRef.current.size,
  }));

  return (
    <div ref={rootRef} className="relative size-full overflow-hidden select-none" style={{ background: manifest.design.background, containerType: "size" }}>
      <style dangerouslySetInnerHTML={{ __html: ENGINE_CSS }} />
      <FontFaces fonts={manifest.fonts} />
      <div ref={gridRef} className="absolute inset-0" style={{ isolation: "isolate" }} />
      <DesignOverlay design={manifest.design} fonts={manifest.fonts} assets={manifest.assets} qrUrl={manifest.qrUrl} hideQr={qrHidden} grid={manifest.wall} />
    </div>
  );
});

"use client";

import { useEffect, useMemo, useState } from "react";
import { DRAFT_CHANNEL, type MotionDraftMessage } from "@/components/admin/motion/motion-editor";
import { WallPlayer } from "@/wall/player";
import type { WallManifest } from "@/wall/types";
import { checkEffect, type MotionDoc } from "@/wallmotion";

export function PreviewApp({ manifest }: { manifest: WallManifest }) {
  const [draft, setDraft] = useState<MotionDraftMessage | null>(null);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(DRAFT_CHANNEL);
      bc.onmessage = (e) => e.data?.type === "draft" && setDraft(e.data);
      bc.postMessage({ type: "hello" });
    } catch {}
    const t = setTimeout(() => setHint(false), 5000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    addEventListener("keydown", onKey);
    return () => {
      bc?.close();
      clearTimeout(t);
      removeEventListener("keydown", onKey);
    };
  }, []);

  const m = useMemo<WallManifest>(() => {
    if (!draft) return manifest;
    return { ...manifest, wall: { ...manifest.wall, cols: draft.sliders.cols, rows: draft.sliders.rows }, motion: { ...manifest.motion, sliders: draft.sliders } };
  }, [manifest, draft]);

  const override = useMemo<{ doc: MotionDoc; params: Record<string, number> } | null>(() => {
    if (!draft) return null;
    const r = checkEffect(draft.effect);
    return r.ok ? { doc: r.doc, params: draft.params } : null;
  }, [draft]);

  return (
    <main className="h-dvh w-dvw overflow-hidden">
      <WallPlayer manifest={m} effectOverride={override} />
      {hint && (
        <div className="fixed bottom-4 left-4 z-50 rounded-lg bg-black/75 px-3 py-2 font-mono text-xs text-white">
          Preview · {draft ? "following the Motion page" : "showing what's saved"} · F full screen
        </div>
      )}
    </main>
  );
}

"use client";

import { RefreshCwIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BUILD_ID } from "@/lib/build";

/** Pages that reload themselves or must never show UI (the wall, the video render). */
const SKIP = ["/wall/play", "/wall/render", "/wall/preview"];

/**
 * After a deploy, pages left open keep running the old code. This checks the server's build
 * now and then and offers a refresh when it changes. Walls reload on their own instead.
 */
export function UpdateBar() {
  const pathname = usePathname();
  const [newer, setNewer] = useState(false);
  const skip = SKIP.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (skip || BUILD_ID === "dev") return;
    let stop = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { build } = await res.json();
        if (!stop && build && build !== BUILD_ID) setNewer(true);
      } catch {}
    };
    const t = setInterval(check, 2 * 60_000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [skip]);

  if (!newer || skip) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-xl print:hidden">
      <span>A new version is available.</span>
      <Button size="sm" variant="secondary" onClick={() => location.reload()}>
        <RefreshCwIcon data-icon="inline-start" />
        Refresh
      </Button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-render the current admin page when the server announces a relevant change. */
export function LiveRefresh({ on }: { on: string[] }) {
  const router = useRouter();
  const key = on.join(",");
  useEffect(() => {
    const types = new Set(key.split(","));
    const es = new EventSource("/api/admin/events");
    let t: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data);
        if (!types.has(e.type) || t) return;
        t = setTimeout(() => {
          t = null;
          router.refresh();
        }, 400);
      } catch {}
    };
    return () => {
      es.close();
      if (t) clearTimeout(t);
    };
  }, [key, router]);
  return null;
}

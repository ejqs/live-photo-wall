"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { GalleryItem } from "@/lib/guest-photos";

/** Everyone's approved photos, kept fresh with a cheap ETag poll nudged by live events. */
export function GalleryGrid({ initial }: { initial: GalleryItem[] }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<number | null>(null);
  const etag = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/gallery", { headers: etag.current ? { "If-None-Match": etag.current } : {} });
      if (res.status === 304 || !res.ok) return;
      etag.current = res.headers.get("ETag");
      setItems((await res.json()).items);
    } catch {}
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/guest/events");
    let timer: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = (m) => {
      if (m.data.includes('"gallery"') && !timer) timer = setTimeout(() => { timer = null; load(); }, 1500 + Math.random() * 3000);
    };
    const poll = setInterval(load, 60_000);
    return () => {
      es.close();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  if (!items.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No photos yet</EmptyTitle>
          <EmptyDescription>Approved photos show up here as they go on the wall.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const cur = open !== null ? items[open] : null;
  return (
    <>
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
        {items.map((p, i) => (
          <li key={p.id}>
            <button type="button" className="block w-full" onClick={() => setOpen(i)} aria-label={`Open photo${p.name ? ` by ${p.name}` : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt="" loading="lazy" className="aspect-square w-full rounded-sm bg-muted object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={cur !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-[min(96vw,900px)] gap-3 p-3">
          {cur && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cur.view} alt={cur.caption ?? ""} className="max-h-[70dvh] w-full rounded-md object-contain" />
              <DialogTitle className="text-base">{cur.name ? `Shared by ${cur.name}` : "Photo"}</DialogTitle>
              <DialogDescription>{cur.caption || " "}</DialogDescription>
              <div className="flex justify-between">
                <Button variant="outline" size="sm" disabled={open === 0} onClick={() => setOpen((o) => (o ?? 1) - 1)}>
                  <ChevronLeftIcon data-icon="inline-start" />
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={open === items.length - 1} onClick={() => setOpen((o) => (o ?? 0) + 1)}>
                  Next
                  <ChevronRightIcon data-icon="inline-end" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

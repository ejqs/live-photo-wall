"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { approvePhotos, rejectPhotos, undoDecision } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ago } from "@/lib/time";

export type QueueItem = {
  id: string;
  thumb: string;
  view: string;
  who: string;
  caption: string | null;
  createdAt: number;
  takenAt: number | null;
  w: number;
  h: number;
};

export function ApprovalQueue({ items, compact }: { items: QueueItem[]; compact?: boolean }) {
  const [list, remove] = useOptimistic(items, (cur, ids: string[]) => cur.filter((x) => !ids.includes(x.id)));
  const [, start] = useTransition();

  const act = (item: QueueItem, approve: boolean) =>
    start(async () => {
      remove([item.id]);
      const res = approve ? await approvePhotos([item.id]) : await rejectPhotos([item.id]);
      if (!res.ok) toast.error(res.error);
      else if (!approve)
        toast("Not shown. The guest won't be told.", {
          action: { label: "Undo", onClick: () => start(async () => void (await undoDecision(item.id))) },
        });
      else toast.success(`Approved ${item.who}'s photo. It goes up in a few seconds.`);
    });

  if (!list.length)
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>All caught up</EmptyTitle>
          <EmptyDescription>New guest photos will appear here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <ul className={compact ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"}>
      {list.map((p) => (
        <li key={p.id} className="flex flex-col overflow-hidden rounded-lg border bg-card">
          <a href={p.view} target="_blank" rel="noreferrer" className="block bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt={p.caption ?? `Photo from ${p.who}`} className="aspect-[4/3] w-full object-contain" loading="lazy" />
          </a>
          <div className="flex flex-1 flex-col gap-1 p-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <strong className="truncate">{p.who}</strong>
              <span className="shrink-0 text-xs text-muted-foreground">{ago(p.createdAt)}</span>
            </div>
            {p.caption && <p className="line-clamp-3 text-muted-foreground">{p.caption}</p>}
            {p.takenAt && !compact && <span className="text-xs text-muted-foreground">Taken {new Date(p.takenAt).toLocaleDateString()}</span>}
            <div className="mt-auto flex gap-2 pt-2">
              <Button size="sm" className="flex-1" onClick={() => act(p, true)}>
                <CheckIcon data-icon="inline-start" />
                Approve
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => act(p, false)}>
                <XIcon data-icon="inline-start" />
                Reject
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

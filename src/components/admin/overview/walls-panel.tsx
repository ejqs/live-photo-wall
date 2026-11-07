"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { forceResync } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WallStatus } from "@/db/schema";
import { ago } from "@/lib/time";

export type WallRow = { id: string; name: string; primary: boolean; lastSeenAt: number | null; status: WallStatus | null };

export function WallsPanel({ walls, manifestVersion, canEdit, now }: { walls: WallRow[]; manifestVersion: number; canEdit: boolean; now: number }) {
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Walls</CardTitle>
        <CardDescription>Each screen keeps every photo on its own disk and keeps playing offline.</CardDescription>
        {canEdit && (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/walls">Manage walls</Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {walls.length === 0 && <p className="text-sm text-muted-foreground">No walls yet. Add one on the Walls page, then open /wall on the display computer.</p>}
        {walls.map((w) => {
          const online = !!w.lastSeenAt && now - w.lastSeenAt < 45_000;
          const synced = w.status?.manifestVersion === manifestVersion;
          return (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <strong className="truncate">{w.name}</strong>
                  {w.primary && <Badge variant="secondary">Fast lane</Badge>}
                </div>
                <span className="text-sm">
                  <span className={online ? "text-emerald-600" : "text-amber-600"}>●</span>{" "}
                  {online ? (synced ? "Online · synced" : `Online · updating to v${manifestVersion}`) : w.lastSeenAt ? `Offline · last seen ${ago(w.lastSeenAt, now)}` : "Never connected"}
                </span>
                {w.status && (
                  <span className="text-xs text-muted-foreground">
                    {w.status.width} × {w.status.height} · cache {w.status.cached} / {w.status.total} photos · playlist v{w.status.manifestVersion}
                    {w.status.warning ? ` · ${w.status.warning}` : ""}
                  </span>
                )}
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await forceResync(w.id);
                      if (r.ok) toast.success(`${w.name} will reload in a moment.`);
                      else toast.error(r.error);
                    })
                  }
                >
                  Force resync
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

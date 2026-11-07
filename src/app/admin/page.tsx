import { MonitorIcon } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { ApprovalQueue } from "@/components/admin/approval-queue";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { DownloadsPanel } from "@/components/admin/overview/downloads-panel";
import { GuestLinkPanel } from "@/components/admin/overview/guest-link-panel";
import { WallsPanel } from "@/components/admin/overview/walls-panel";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { pendingItems, totalBytes, wallList } from "@/lib/admin-data";
import { latestExports } from "@/lib/exports";
import { serializeExport } from "@/lib/export-view";
import { guestLinkUrl } from "@/lib/guest";
import { counts } from "@/lib/photos";
import { can, requirePage } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { ago } from "@/lib/time";
import { serverNow } from "@/lib/time";

export const metadata: Metadata = { title: "Overview" };

export default async function Overview() {
  const me = await requirePage("moderator");
  const [c, pending, walls, s, link, ex, bytes] = await Promise.all([
    counts(),
    pendingItems(8),
    wallList(),
    getSettings(["guest", "manifest"]),
    guestLinkUrl(),
    latestExports(),
    totalBytes(),
  ]);
  const isAdmin = can(me, "admin");
  const oldest = pending[0]?.createdAt;
  const stats = [
    { label: "Roster photos", value: c.roster, note: "Uploaded by admins, in file-name order" },
    { label: "Guest photos on the wall", value: c.guestApproved, note: c.removed ? `${c.removed} taken down` : "Approved and in rotation" },
    { label: "Waiting for approval", value: c.pending, note: oldest ? `Oldest ${ago(oldest)}` : "All caught up" },
    { label: "Playlist version", value: `v${s.manifest.version}`, note: `${c.inRotation} photos in rotation` },
  ];
  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh on={["queue", "walls", "exports", "manifest"]} />
      <PageHeader title="Overview" description="Everything the wall is showing right now, and what needs you.">
        <Button asChild variant="outline">
          <Link href="/wall" target="_blank">
            <MonitorIcon data-icon="inline-start" />
            Open wall display
          </Link>
        </Button>
        <Button asChild>
          <Link href="/admin/photos">Review {c.pending} pending</Link>
        </Button>
      </PageHeader>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((st) => (
          <Card key={st.label} className="gap-1 py-4">
            <CardHeader className="px-4">
              <CardDescription>{st.label}</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{st.value}</CardTitle>
              <CardDescription className="text-xs">{st.note}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Waiting for approval</CardTitle>
          <CardDescription>Approved photos land on the wall within seconds, and the guest gets a countdown.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/photos">Open queue</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <div className="px-6">
          <ApprovalQueue items={pending} compact />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <WallsPanel
          canEdit={isAdmin}
          walls={walls.map((w) => ({ id: w.id, name: w.name, primary: w.primary, lastSeenAt: w.lastSeenAt?.getTime() ?? null, status: w.status ?? null }))}
          manifestVersion={s.manifest.version}
          now={serverNow()}
        />
        <GuestLinkPanel url={link} open={s.guest.open} canEdit={isAdmin} />
      </div>

      {isAdmin && (
        <DownloadsPanel
          zip={ex.zip ? serializeExport(ex.zip) : null}
          mp4={ex.mp4 ? serializeExport(ex.mp4) : null}
          counts={{ guests: c.guestApproved, roster: c.roster, hidden: c.rejected + c.removed }}
          bytes={bytes}
        />
      )}
    </div>
  );
}

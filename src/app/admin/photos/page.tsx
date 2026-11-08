import type { Metadata } from "next";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { PageHeader } from "@/components/admin/page-header";
import { PhotosTabs } from "@/components/admin/photos/photos-tabs";
import { pendingItems, photoRows } from "@/lib/admin-data";
import { can, requirePage } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Photos" };

export default async function PhotosPage({ searchParams }: PageProps<"/admin/photos">) {
  const me = await requirePage("moderator");
  const sp = await searchParams;
  const [pending, rows, s] = await Promise.all([pendingItems(), photoRows(), getSettings(["guest", "playlist", "manifest"])]);
  const tab = typeof sp.tab === "string" ? sp.tab : "queue";
  return (
    <div className="flex flex-col gap-4">
      <LiveRefresh on={["queue", "manifest"]} />
      <PageHeader title="Photos" description="Approved photos join the wall's rotation within seconds." />
      <PhotosTabs
        tab={tab}
        pending={pending}
        rows={rows}
        autoApprove={s.guest.autoApprove}
        playlist={s.playlist}
        canAdmin={can(me, "admin")}
        version={s.manifest.version}
      />
    </div>
  );
}

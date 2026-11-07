import type { Metadata } from "next";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { PageHeader } from "@/components/admin/page-header";
import { WallsManager } from "@/components/admin/walls-manager";
import { wallList } from "@/lib/admin-data";
import { appUrl } from "@/lib/env";
import { requirePage } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { serverNow } from "@/lib/time";

export const metadata: Metadata = { title: "Walls" };

export default async function WallsPage() {
  await requirePage("admin");
  const [walls, s] = await Promise.all([wallList(), getSettings(["manifest", "motion"])]);
  return (
    <div className="flex flex-col gap-4">
      <LiveRefresh on={["walls", "manifest"]} />
      <PageHeader title="Walls" description="Each display (LED wall, lobby screen) is a browser in full screen, paired with a key." />
      <WallsManager
        base={appUrl()}
        manifestVersion={s.manifest.version}
        defaultGrid={{ cols: s.motion.sliders.cols, rows: s.motion.sliders.rows }}
        walls={walls.map((w) => ({
          id: w.id,
          name: w.name,
          key: w.key,
          primary: w.primary,
          cols: w.cols,
          rows: w.rows,
          showQr: w.showQr,
          lastSeenAt: w.lastSeenAt?.getTime() ?? null,
          status: w.status ?? null,
        }))}
        now={serverNow()}
      />
    </div>
  );
}

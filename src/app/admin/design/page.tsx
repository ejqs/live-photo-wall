import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { DesignEditor } from "@/components/admin/design/design-editor";
import { assetList, wallList } from "@/lib/admin-data";
import { guestLinkUrl } from "@/lib/guest";
import { rotationPhotos } from "@/lib/photos";
import { requirePage } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { imgUrl } from "@/wall/types";

export const metadata: Metadata = { title: "Design" };

export default async function DesignPage() {
  await requirePage("admin");
  const [s, assets, photos, walls, qrUrl] = await Promise.all([getSettings(["design", "motion"]), assetList(), rotationPhotos(), wallList(), guestLinkUrl()]);
  const wallSizes = walls
    .filter((w) => w.status?.width && w.status?.height)
    .map((w) => ({ name: w.name, w: w.status!.width, h: w.status!.height }))
    .slice(0, 4);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Design" description="What sits on top of the photos: your title, overlays, logos and the guest QR. Changes save as a draft until you publish." />
      <DesignEditor
        initial={s.design.draft}
        published={s.design.published}
        publishedVersion={s.design.publishedVersion}
        publishedAt={s.design.publishedAt}
        assets={assets}
        thumbs={photos.slice(0, 120).map((p) => imgUrl("thumb", p.hash))}
        grid={{ cols: s.motion.sliders.cols, rows: s.motion.sliders.rows }}
        qrUrl={qrUrl}
        wallSizes={wallSizes}
      />
    </div>
  );
}

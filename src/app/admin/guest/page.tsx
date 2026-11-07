import type { Metadata } from "next";
import { GuestLinkPanel } from "@/components/admin/overview/guest-link-panel";
import { GuestSettings } from "@/components/admin/guest-settings";
import { PageHeader } from "@/components/admin/page-header";
import { assetList } from "@/lib/admin-data";
import { guestLinkUrl } from "@/lib/guest";
import { galleryItems } from "@/lib/guest-photos";
import { requirePage } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Guest page" };

export default async function GuestPageSettingsPage() {
  await requirePage("admin");
  const [s, assets, url, gallery] = await Promise.all([getSettings(["event", "guest"]), assetList(), guestLinkUrl(), galleryItems()]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Guest page" description="What guests see after they scan the QR." />
      <div className="max-w-2xl">
        <GuestLinkPanel url={url} open={s.guest.open} canEdit />
      </div>
      <GuestSettings initial={s.guest} eventName={s.event.name} images={assets.filter((a) => a.kind === "image")} strip={gallery.slice(0, 12).map((g) => g.thumb)} />
    </div>
  );
}

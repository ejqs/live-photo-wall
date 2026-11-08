import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { QrCards } from "@/components/admin/qr-cards";
import { guestLinkUrl } from "@/lib/guest";
import { assetUrl } from "@/lib/manifest";
import { requirePage } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Table cards" };

export default async function QrCardsPage() {
  await requirePage("admin");
  const [s, url] = await Promise.all([getSettings(["event", "design"]), guestLinkUrl()]);
  const qr = s.design.published.layers.find((l) => l.type === "qr");
  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <PageHeader title="Table cards" description="Print these for tables and the entrance, as a backup to the QR on the wall." />
      </div>
      <QrCards
        url={url}
        eventName={s.event.name}
        qr={{ style: qr?.style ?? "rounded", inverse: false }}
        logo={qr?.logoAssetId ? assetUrl(qr.logoAssetId) : null}
      />
    </div>
  );
}

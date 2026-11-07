import type { Metadata } from "next";
import { LandingSettingsForm } from "@/components/admin/landing-settings";
import { PageHeader } from "@/components/admin/page-header";
import { publicBaseUrl } from "@/lib/guest";
import { requirePage } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { serverNow } from "@/lib/time";

export const metadata: Metadata = { title: "Landing page" };

export default async function LandingPage() {
  await requirePage("admin");
  const [s, base] = await Promise.all([getSettings(["landing", "event"]), publicBaseUrl()]);
  const ended = !!s.event.endsAt && new Date(s.event.endsAt).getTime() < serverNow();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Landing page" />
      <LandingSettingsForm initial={s.landing} url={base} ended={ended} />
    </div>
  );
}

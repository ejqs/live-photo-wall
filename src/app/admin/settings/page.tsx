import type { Metadata } from "next";
import { EventSettingsForm } from "@/components/admin/event-settings";
import { PageHeader } from "@/components/admin/page-header";
import { appUrl } from "@/lib/env";
import { requirePage } from "@/lib/session";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "Event settings" };

export default async function SettingsPage() {
  await requirePage("admin");
  const event = await getSetting("event");
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Event settings" />
      <EventSettingsForm initial={event} appUrl={appUrl()} />
    </div>
  );
}

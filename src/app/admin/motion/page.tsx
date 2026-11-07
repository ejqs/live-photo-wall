import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { MotionEditor } from "@/components/admin/motion/motion-editor";
import { previewManifest } from "@/lib/admin-data";
import { requirePage } from "@/lib/session";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "Motion & timing" };

export default async function MotionPage() {
  await requirePage("admin");
  const [motion, manifest] = await Promise.all([getSetting("motion"), previewManifest(60)]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Motion & timing" description="How photos swap on the walls. The preview plays your changes before you send them." />
      <MotionEditor initial={motion} manifest={manifest} />
    </div>
  );
}

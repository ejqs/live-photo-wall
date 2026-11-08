import type { Metadata } from "next";
import { previewManifest } from "@/lib/admin-data";
import { requirePage } from "@/lib/session";
import { PreviewApp } from "./preview-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Motion preview" };

/** Full-screen preview of unsaved motion settings, fed from the Motion page over a BroadcastChannel. */
export default async function PreviewPage() {
  await requirePage("admin");
  return <PreviewApp manifest={await previewManifest(200)} />;
}

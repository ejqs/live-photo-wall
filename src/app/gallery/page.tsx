import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GalleryGrid } from "@/components/guest/gallery-grid";
import { galleryItems } from "@/lib/guest-photos";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Everyone's photos" };

/** Public gallery linked from the landing page. */
export default async function PublicGallery() {
  const s = await getSettings(["event", "landing"]);
  if (!s.landing.published || !s.landing.galleryLink) notFound();
  const items = await galleryItems();
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 px-3 pt-5 pb-10">
      <header className="flex items-center justify-between gap-3">
        <div>
          <Link href="/" className="font-[family-name:var(--font-display)] text-2xl tracking-wide uppercase">
            {s.event.name}
          </Link>
          <h1 className="text-sm text-muted-foreground">{items.length} photos</h1>
        </div>
      </header>
      <GalleryGrid initial={items} />
    </main>
  );
}

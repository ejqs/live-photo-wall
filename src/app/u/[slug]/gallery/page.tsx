import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GalleryGrid } from "@/components/guest/gallery-grid";
import { LinkExpired } from "@/components/guest/link-expired";
import { Button } from "@/components/ui/button";
import { isValidLink } from "@/lib/guest";
import { galleryItems } from "@/lib/guest-photos";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Everyone's photos" };

export default async function GuestGallery({ params }: PageProps<"/u/[slug]/gallery">) {
  const { slug } = await params;
  const s = await getSettings(["event", "guest"]);
  if (!(await isValidLink(slug))) return <LinkExpired eventName={s.event.name} />;
  if (!s.guest.gallery) notFound();
  const items = await galleryItems();
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-3 pt-5 pb-10">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl tracking-wide uppercase">{s.event.name}</p>
          <h1 className="text-sm text-muted-foreground">{items.length} photos shared so far</h1>
        </div>
        {s.guest.open && (
          <Button asChild size="sm">
            <Link href={`/u/${slug}`}>Add a photo</Link>
          </Button>
        )}
      </header>
      <GalleryGrid initial={items} />
    </main>
  );
}

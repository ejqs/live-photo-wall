import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { GuestApp } from "@/components/guest/guest-app";
import { LinkExpired } from "@/components/guest/link-expired";
import { currentGuest, isValidLink } from "@/lib/guest";
import { galleryItems, myPhotos, uploadsUsed } from "@/lib/guest-photos";
import { assetUrl } from "@/lib/manifest";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { event } = await getSettings(["event"]);
  return { title: `Add your photo · ${event.name}` };
}

export default async function GuestPage({ params }: PageProps<"/u/[slug]">) {
  const { slug } = await params;
  const s = await getSettings(["event", "guest", "playlist"]);
  if (!(await isValidLink(slug))) return <LinkExpired eventName={s.event.name} />;
  const guest = await currentGuest();
  const logoIds = s.guest.showLogos ? s.guest.logoAssetIds : [];
  const logoRows = logoIds.length ? await db.select().from(assets).where(inArray(assets.id, logoIds)) : [];
  const logos = logoIds.map((id) => logoRows.find((a) => a.id === id)).filter(Boolean).map((a) => ({ id: a!.id, url: assetUrl(a!.id), name: a!.name }));
  const headerImage = s.guest.header === "image" && s.guest.headerAssetId
    ? await db.query.assets.findFirst({ where: eq(assets.id, s.guest.headerAssetId) })
    : null;
  const strip = s.guest.header === "strip" ? (await galleryItems()).slice(0, 12).map((g) => g.thumb) : [];
  return (
    <GuestApp
      slug={slug}
      eventName={s.event.name}
      settings={s.guest}
      logos={logos}
      headerImage={headerImage ? assetUrl(headerImage.id) : null}
      strip={strip}
      initialName={guest?.name ?? ""}
      initialPhotos={guest ? await myPhotos(guest.id) : []}
      used={guest ? await uploadsUsed(guest.id) : 0}
    />
  );
}

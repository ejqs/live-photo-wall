import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { currentLinkSlug } from "@/lib/guest";
import { galleryItems } from "@/lib/guest-photos";
import { latestVideo } from "@/lib/landing";
import { getSettings } from "@/lib/settings";
import { serverNow } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { event } = await getSettings(["event"]);
  return { title: { absolute: event.name } };
}

/** The event's own page at the root of the domain. Unpublished: straight to sign-in. */
export default async function Landing() {
  const s = await getSettings(["event", "landing", "guest"]);
  if (!s.landing.published) redirect("/sign-in");
  const ended = !!s.event.endsAt && new Date(s.event.endsAt).getTime() < serverNow();
  const [items, slug, video] = await Promise.all([
    s.landing.liveStrip || s.landing.galleryLink ? galleryItems() : Promise.resolve([]),
    currentLinkSlug(),
    ended && s.landing.showVideo ? latestVideo() : Promise.resolve(null),
  ]);
  const strip = items.slice(0, 18);
  return (
    <main className="flex min-h-dvh flex-col items-center bg-zinc-950 text-white">
      <section className="flex w-full max-w-3xl flex-col items-center gap-6 px-5 pt-16 pb-10 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-wide uppercase sm:text-7xl">{s.event.name}</h1>
        <p className="max-w-xl text-lg text-zinc-300">{ended ? s.landing.introAfter : s.landing.introDuring}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {s.guest.open && (
            <Button asChild size="lg" className="bg-white text-zinc-950 hover:bg-zinc-200">
              <Link href={`/u/${slug}`}>Add your photo</Link>
            </Button>
          )}
          {s.landing.galleryLink && items.length > 0 && (
            <Button asChild size="lg" variant="outline" className="border-zinc-700 bg-transparent text-white hover:bg-zinc-900 hover:text-white">
              <Link href="/gallery">{items.length === 1 ? "See the photo" : `See all ${items.length} photos`}</Link>
            </Button>
          )}
        </div>
      </section>
      {video && (
        <section className="w-full max-w-5xl px-5 pb-10">
          <video src="/video" controls playsInline preload="metadata" className="w-full rounded-lg bg-black" />
        </section>
      )}
      {s.landing.liveStrip && strip.length > 0 && (
        <section aria-label="Recent photos" className="grid w-full max-w-5xl grid-cols-3 gap-1.5 px-5 pb-16 sm:grid-cols-6">
          {strip.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.thumb} alt={p.caption ?? ""} className="aspect-square w-full rounded object-cover" loading="lazy" />
          ))}
        </section>
      )}
      <footer className="mt-auto pb-6 text-xs text-zinc-500">
        <Link href="/sign-in" className="hover:text-zinc-300">
          Hosts
        </Link>
      </footer>
    </main>
  );
}

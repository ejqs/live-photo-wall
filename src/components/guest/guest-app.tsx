"use client";

import { CameraIcon, CheckCircle2Icon, ClockIcon, EyeOffIcon, ImagesIcon, ImageUpIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import type { GuestPhoto } from "@/lib/guest-photos";
import type { GuestPageSettings } from "@/lib/settings-types";
import { cn } from "@/lib/utils";
import { postWithProgress, prepareImage } from "./prepare-image";
import { WallMap, whereText } from "./wall-map";

type Upload = { key: string; name: string; progress: number; state: "preparing" | "uploading" | "done" | "error"; error?: string };
type Live = { photoId: string; row: number; col: number; rows: number; cols: number; showAt: number; hold: number; wallName: string; thumb?: string };

export function GuestApp(props: {
  slug: string;
  eventName: string;
  settings: GuestPageSettings;
  logos: { id: string; url: string; name: string }[];
  headerImage: string | null;
  strip: string[];
  initialName: string;
  initialPhotos: GuestPhoto[];
  used: number;
  /** admin preview: no network, uploads disabled */
  preview?: boolean;
}) {
  const { settings: s } = props;
  const [name, setName] = useState(props.initialName);
  const [caption, setCaption] = useState("");
  const [photos, setPhotos] = useState<GuestPhoto[]>(props.initialPhotos);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [live, setLive] = useState<Live | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // the guest cookie is set by the first upload, so the live connection is reopened after an upload
  const [conn, setConn] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const libraryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.initialName) {
      try {
        const saved = localStorage.getItem("lpw-name");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
        if (saved) setName(saved);
      } catch {}
    }
  }, [props.initialName]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/guest/photos", { cache: "no-store" });
      if (res.ok) setPhotos((await res.json()).photos);
    } catch {}
  }, []);

  // live updates: status changes and fast-lane countdowns
  useEffect(() => {
    if (props.preview) return;
    const es = new EventSource("/api/guest/events");
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data);
        if (e.type === "photo") refresh();
        if (e.type === "reservation") {
          setLive({ photoId: e.photoId, row: e.row, col: e.col, rows: e.rows, cols: e.cols, showAt: Date.now() + e.inMs, hold: e.hold, wallName: e.wallName });
          refresh();
        }
      } catch {}
    };
    es.onerror = () => {
      // the browser reconnects on its own; refresh in case we missed something
      setTimeout(refresh, 3000);
    };
    return () => es.close();
  }, [refresh, props.preview, conn]);

  // backup for a dropped live connection: check again while a photo waits for review or a countdown
  const waiting = photos.some((p) => p.status === "pending" || (p.status === "approved" && !p.firstShownAt));
  useEffect(() => {
    if (props.preview || !waiting) return;
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [waiting, refresh, props.preview]);

  // pick up a reservation that arrived before this page opened
  useEffect(() => {
    if (live) return;
    const p = photos.find((x) => x.reservation && x.reservation.showAt + x.reservation.hold * 1000 > Date.now());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from fetched photos and the clock
    if (p?.reservation) setLive({ photoId: p.id, ...p.reservation });
  }, [photos, live]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [live]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the countdown once it has passed
    if (live && now > live.showAt + Math.max(10, live.hold) * 1000 + 5000) setLive(null);
  }, [now, live]);

  const visible = photos.filter((p) => p.status !== "hidden");
  const hidden = photos.filter((p) => p.status === "hidden");
  const used = Math.max(props.used, photos.length);
  const remaining = Math.max(0, s.perGuest - used - uploads.filter((u) => u.state !== "done" && u.state !== "error").length);
  const canPick = s.open && (s.library || s.camera) && remaining > 0;

  async function onFiles(list: FileList | null) {
    setError(null);
    if (!list?.length) return;
    if (!name.trim()) {
      setError("Please add your name first. It's shown with your photos.");
      return;
    }
    if (s.captionRequired && !caption.trim()) {
      setError("Please add a caption first.");
      return;
    }
    try {
      localStorage.setItem("lpw-name", name.trim());
    } catch {}
    const files = Array.from(list).slice(0, remaining);
    if (files.length < list.length) setError(`You can add ${remaining} more photo${remaining === 1 ? "" : "s"}.`);
    const batch = files.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, progress: 0, state: "preparing" as const }));
    setUploads((u) => [...batch, ...u]);
    const update = (key: string, patch: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    let sent = 0;
    for (let i = 0; i < files.length; i++) {
      const key = batch[i].key;
      try {
        const prepared = await prepareImage(files[i]);
        update(key, { state: "uploading" });
        const form = new FormData();
        form.set("slug", props.slug);
        form.set("name", name.trim());
        form.set("caption", caption.trim());
        if (prepared.takenAt) form.set("takenAt", prepared.takenAt);
        form.set("takenAtFromExif", prepared.takenAtFromExif ? "1" : "0");
        if (prepared.camera) form.set("camera", prepared.camera);
        form.set("file", prepared.blob, prepared.name);
        const res = await postWithProgress("/api/guest/upload", form, (p) => update(key, { progress: p }));
        if (!res.ok) {
          update(key, { state: "error", error: String(res.body.error ?? "Upload failed. Try again.") });
          if (res.status === 410 || res.status === 403 || res.status === 429) break;
        } else {
          update(key, { state: "done", progress: 1 });
          sent++;
        }
      } catch {
        update(key, { state: "error", error: "Upload failed. Try again." });
      }
    }
    setCaption("");
    if (sent) setConn((c) => c + 1);
    await refresh();
    setTimeout(() => setUploads((u) => u.filter((x) => x.state !== "done")), 4000);
  }

  const logos = props.logos.length ? (
    <div className="flex flex-wrap items-center justify-center gap-6 py-2">
      {props.logos.map((l) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={l.id} src={l.url} alt={l.name} className="h-10 w-auto max-w-[30%] object-contain" />
      ))}
    </div>
  ) : null;

  const btnStyle = useMemo(() => ({ backgroundColor: s.buttonColor, color: readableOn(s.buttonColor) }), [s.buttonColor]);
  const secondsLeft = live ? Math.ceil((live.showAt - now) / 1000) : 0;

  return (
    <main inert={props.preview} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-5 pb-10">
      {s.logoPosition === "top" && logos}
      <header className="flex flex-col items-center gap-3 text-center">
        {props.headerImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.headerImage} alt="" className="max-h-40 w-full rounded-xl object-cover" />
        ) : props.strip.length > 0 ? (
          <div className="grid w-full grid-cols-6 gap-1 overflow-hidden rounded-xl" aria-hidden>
            {props.strip.slice(0, 6).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className="aspect-square w-full object-cover" />
            ))}
          </div>
        ) : null}
        <p className="font-[family-name:var(--font-display)] text-4xl tracking-wide uppercase">{props.eventName}</p>
      </header>

      {live && dismissed !== live.photoId && (
        <LiveCountdown live={live} secondsLeft={secondsLeft} photo={photos.find((p) => p.id === live.photoId) ?? null} onClose={() => setDismissed(live.photoId)} />
      )}

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{s.headline}</h1>
          <p className="text-sm text-muted-foreground">{s.intro}</p>
        </div>
        {s.open ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="guest-name">Your name *</FieldLabel>
              <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} required />
              <FieldDescription>Shown with your photos.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="guest-caption">Caption{s.captionRequired ? " *" : " (optional)"}</FieldLabel>
              <Textarea id="guest-caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={140} rows={2} />
            </Field>
            <div className="flex flex-col gap-2">
              {s.library && (
                <Button size="lg" style={btnStyle} disabled={!canPick} onClick={() => libraryRef.current?.click()}>
                  <ImagesIcon data-icon="inline-start" />
                  Choose from your photos
                </Button>
              )}
              {s.camera && (
                <Button size="lg" variant="outline" disabled={!canPick} onClick={() => cameraRef.current?.click()}>
                  <CameraIcon data-icon="inline-start" />
                  Take a photo
                </Button>
              )}
              <input ref={libraryRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {remaining > 0 ? `Up to ${s.perGuest} photos each · ${remaining} left for you.` : `You've added ${s.perGuest} photos. Thank you!`} No account needed.
            </p>
          </FieldGroup>
        ) : (
          <Alert>
            <AlertDescription>Uploads are closed. Thanks for sharing!</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {uploads.length > 0 && (
          <ul className="flex flex-col gap-2">
            {uploads.map((u) => (
              <li key={u.key} className="flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{u.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {u.state === "preparing" ? "Preparing…" : u.state === "uploading" ? `${Math.round(u.progress * 100)}%` : u.state === "done" ? "Sent ✓" : ""}
                  </span>
                </div>
                {u.state === "error" ? <span className="text-xs text-destructive">{u.error}</span> : <Progress value={u.progress * 100} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(visible.length > 0 || hidden.length > 0) && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">My photos</h2>
            <span className="text-xs text-muted-foreground">Updates live while this page is open.</span>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {visible.map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt={p.caption ?? "Your photo"} className="aspect-square w-full rounded-lg bg-muted object-cover" />
                <StatusChip photo={p} countdown={s.countdown} />
                {p.caption && <span className="line-clamp-2 text-xs text-muted-foreground">{p.caption}</span>}
              </li>
            ))}
          </ul>
          {hidden.length > 0 && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowHidden((v) => !v)}
                className="flex items-center gap-1.5 self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                <EyeOffIcon className="size-3.5" aria-hidden />
                {hidden.length} photo{hidden.length === 1 ? "" : "s"} not shown
              </button>
              {showHidden && (
                <ul className="grid grid-cols-3 gap-2">
                  {hidden.map((p) => (
                    <li key={p.id} className="flex flex-col gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb} alt="" className="aspect-square w-full rounded-md object-cover opacity-40 grayscale" />
                      <span className="text-[11px] leading-tight text-muted-foreground">Not picked for the wall this time</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {s.gallery && (
        <Button asChild variant="outline" size="lg">
          <Link href={`/u/${props.slug}/gallery`}>
            <ImageUpIcon data-icon="inline-start" />
            See everyone&apos;s photos
          </Link>
        </Button>
      )}

      {s.logoPosition !== "top" && logos}
    </main>
  );
}

/** Full-screen countdown when the wall has picked a spot for the guest's new photo. */
function LiveCountdown({ live, secondsLeft, photo, onClose }: { live: Live; secondsLeft: number; photo: GuestPhoto | null; onClose: () => void }) {
  const landed = secondsLeft <= 0;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="live-h" className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-6 px-6 pt-8 pb-6">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <span className="text-sm font-semibold text-green-300">Approved</span>
          <h2 id="live-h" className="text-2xl font-bold">
            {landed ? "There it is!" : "Your photo is going up in"}
          </h2>
        </div>
        <div aria-live="polite" className="flex h-36 items-center justify-center">
          {landed ? (
            <span className="text-4xl font-extrabold text-green-300">On the wall now</span>
          ) : (
            <span className="text-[132px] leading-none font-extrabold tabular-nums">{secondsLeft}</span>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          <span className="text-center text-[15px] font-semibold">
            Look {live.wallName ? `at the ${live.wallName}` : "here"}: {whereText(live.row, live.col)}
          </span>
          <WallMap rows={live.rows} cols={live.cols} row={live.row} col={live.col} photo={landed ? photo?.thumb : null} className="rounded-lg border border-zinc-700 p-2.5" />
          <span className="text-center text-xs text-zinc-400">Map of the wall as you face it. The title and QR sit on top of the grid.</span>
        </div>
        {photo && (
          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.thumb} alt="" className="h-14 w-18 shrink-0 rounded-md object-cover" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{photo.caption || "Your photo"}</span>
              <span className="text-xs text-zinc-400">Stays up at least {Math.max(10, Math.round(live.hold))} s, then comes back as the wall loops</span>
            </div>
          </div>
        )}
        <div className="flex-1" />
        <Button size="lg" variant="outline" className="border-zinc-700 bg-transparent text-zinc-50 hover:bg-zinc-900 hover:text-zinc-50" onClick={onClose}>
          Back to my photos
        </Button>
      </div>
    </div>
  );
}

function StatusChip({ photo, countdown }: { photo: GuestPhoto; countdown: boolean }) {
  if (photo.status === "pending")
    return (
      <Badge variant="secondary" className="gap-1">
        <ClockIcon aria-hidden />
        Waiting for a quick review
      </Badge>
    );
  const res = photo.reservation;
  // eslint-disable-next-line react-hooks/purity -- the parent re-renders every 250 ms during a countdown
  const upcoming = countdown && res && res.showAt > Date.now();
  return (
    <Badge className={cn("gap-1", !photo.firstShownAt && !upcoming && "bg-emerald-600")}>
      <CheckCircle2Icon aria-hidden />
      {upcoming ? "Going up in a moment" : photo.firstShownAt ? "On the wall" : "Approved"}
    </Badge>
  );
}

function readableOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#09090b" : "#ffffff";
}

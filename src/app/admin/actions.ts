"use server";

import crypto from "node:crypto";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { account, assets, exportsTable, guestLinks, photos, session, user, walls } from "@/db/schema";
import { auth, type Role } from "@/lib/auth";
import { publish } from "@/lib/bus";
import { newSlug } from "@/lib/guest";
import { decide, deletePhoto, putBack, removeFromWall, reopen, setCaption } from "@/lib/photos";
import { createAccount, HttpError, requireRole, type Me } from "@/lib/session";
import {
  bumpManifest,
  getSetting,
  setSetting,
  updateSetting,
  type Design,
  type EventSettings,
  type GuestPageSettings,
  type LandingSettings,
  type MotionSettings,
  type PlaylistSettings,
} from "@/lib/settings";
import { storage } from "@/lib/storage";
import { checkEffect } from "@/wallmotion";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(min: Role, fn: (me: Me) => Promise<T>, paths: string[] = []): Promise<Result<T>> {
  try {
    const me = await requireRole(min);
    const data = await fn(me);
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

const Ids = z.array(z.string().uuid()).min(1).max(500);

// ---------------- photos ----------------

export async function approvePhotos(ids: string[]) {
  return run("moderator", async (me) => (await decide(Ids.parse(ids), "approved", me.email)).length, ["/admin", "/admin/photos"]);
}

export async function rejectPhotos(ids: string[]) {
  return run("moderator", async (me) => (await decide(Ids.parse(ids), "rejected", me.email)).length, ["/admin", "/admin/photos"]);
}

export async function approveAllPending() {
  return run(
    "moderator",
    async (me) => {
      const rows = await db.select({ id: photos.id }).from(photos).where(eq(photos.status, "pending")).limit(500);
      return (await decide(rows.map((r) => r.id), "approved", me.email)).length;
    },
    ["/admin", "/admin/photos"],
  );
}

export async function undoDecision(id: string) {
  return run("moderator", async () => void (await reopen(z.string().uuid().parse(id))), ["/admin/photos"]);
}

export async function takeOffWall(id: string) {
  return run("moderator", async (me) => void (await removeFromWall(z.string().uuid().parse(id), me.email)), ["/admin/photos"]);
}

export async function putBackOnWall(id: string) {
  return run("moderator", async () => void (await putBack(z.string().uuid().parse(id))), ["/admin/photos"]);
}

export async function editCaption(id: string, caption: string) {
  return run("moderator", async () => void (await setCaption(z.string().uuid().parse(id), z.string().max(140).parse(caption))), ["/admin/photos"]);
}

export async function deleteRosterPhotos(ids: string[]) {
  return run(
    "admin",
    async () => {
      const list = await db.select().from(photos).where(and(inArray(photos.id, Ids.parse(ids)), eq(photos.source, "roster")));
      for (const p of list) await deletePhoto(p.id);
      return list.length;
    },
    ["/admin/photos"],
  );
}

export async function setPlaylist(input: PlaylistSettings) {
  return run(
    "admin",
    async () => {
      const v = z
        .object({ order: z.enum(["filename", "random", "guests-first"]), fastLaneHold: z.number().min(0).max(120), fastLaneLead: z.number().min(1).max(15) })
        .parse(input);
      await setSetting("playlist", v);
      await bumpManifest();
    },
    ["/admin/photos"],
  );
}

// ---------------- guest link + guest page ----------------

export async function rotateGuestLink(graceMinutes = 30) {
  return run(
    "admin",
    async () => {
      const grace = new Date(Date.now() + Math.max(0, Math.min(24 * 60, graceMinutes)) * 60_000);
      await db.update(guestLinks).set({ expiresAt: grace }).where(isNull(guestLinks.expiresAt));
      const slug = newSlug();
      await db.insert(guestLinks).values({ slug });
      await bumpManifest();
      return slug;
    },
    ["/admin", "/admin/guest"],
  );
}

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export async function saveGuestSettings(input: GuestPageSettings) {
  return run(
    "admin",
    async () => {
      const v = z
        .object({
          open: z.boolean(),
          library: z.boolean(),
          camera: z.boolean(),
          captionRequired: z.boolean(),
          gallery: z.boolean(),
          countdown: z.boolean(),
          autoApprove: z.boolean(),
          perGuest: z.number().int().min(1).max(100),
          headline: z.string().trim().min(1).max(80),
          intro: z.string().trim().max(400),
          buttonColor: Hex,
          showLogos: z.boolean(),
          logoPosition: z.enum(["bottom", "top"]),
          logoAssetIds: z.array(z.string().uuid()).max(3),
          header: z.enum(["strip", "image"]),
          headerAssetId: z.string().uuid().nullable(),
        })
        .parse(input);
      if (!v.library && !v.camera) throw new HttpError(400, "Turn on at least one way to add photos.");
      await setSetting("guest", v);
    },
    ["/admin/guest"],
  );
}

export async function setUploadsOpen(open: boolean) {
  return run("admin", async () => void (await updateSetting("guest", (g) => ({ ...g, open: !!open }))), ["/admin", "/admin/guest"]);
}

// ---------------- event + landing ----------------

export async function saveEventSettings(input: EventSettings) {
  return run(
    "admin",
    async () => {
      const v = z
        .object({
          name: z.string().trim().min(1).max(80),
          endsAt: z.string().datetime({ offset: true }).nullable(),
          retentionDays: z.number().int().min(1).max(3650),
          publicUrl: z.string().trim().url().max(200).nullable().or(z.literal("").transform(() => null)),
        })
        .parse(input);
      await setSetting("event", { ...v, publicUrl: v.publicUrl ? v.publicUrl.replace(/\/+$/, "") : null });
      await bumpManifest();
    },
    ["/admin", "/admin/settings"],
  );
}

export async function saveLanding(input: LandingSettings) {
  return run(
    "admin",
    async () => {
      const v = z
        .object({
          published: z.boolean(),
          introDuring: z.string().trim().max(400),
          introAfter: z.string().trim().max(400),
          liveStrip: z.boolean(),
          galleryLink: z.boolean(),
          showVideo: z.boolean(),
        })
        .parse(input);
      await setSetting("landing", v);
    },
    ["/admin/landing", "/"],
  );
}

// ---------------- design ----------------

const Layer = z.discriminatedUnion("type", [
  z.object({
    id: z.string().max(40),
    name: z.string().max(60),
    hidden: z.boolean().optional(),
    type: z.literal("text"),
    text: z.string().max(300),
    font: z.string().max(60),
    size: z.number().min(0.5).max(60),
    letterSpacing: z.number().min(-0.2).max(1),
    weight: z.number().int().min(100).max(900),
    color: Hex,
    shadow: z.boolean(),
    uppercase: z.boolean(),
    align: z.enum(["left", "center", "right"]),
    x: z.number().min(-20).max(120),
    y: z.number().min(-20).max(120),
  }),
  z.object({
    id: z.string().max(40),
    name: z.string().max(60),
    hidden: z.boolean().optional(),
    type: z.literal("image"),
    assetId: z.string().uuid().nullable(),
    x: z.number().min(-50).max(150),
    y: z.number().min(-50).max(150),
    w: z.number().min(1).max(200),
    opacity: z.number().min(0).max(1),
  }),
  z.object({
    id: z.string().max(40),
    name: z.string().max(60),
    hidden: z.boolean().optional(),
    type: z.literal("qr"),
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    size: z.number().min(8).max(80),
    cell: z.boolean().optional(),
    style: z.enum(["classic", "dots", "rounded"]),
    logoAssetId: z.string().uuid().nullable(),
    inverse: z.boolean(),
    label: z.string().max(60),
    cardColor: Hex,
    textColor: Hex,
  }),
  z.object({
    id: z.string().max(40),
    name: z.string().max(60),
    hidden: z.boolean().optional(),
    type: z.literal("dim"),
    amount: z.number().min(0).max(0.95),
    mode: z.enum(["even", "bottom", "top", "center"]),
  }),
]);
const DesignSchema = z.object({ background: Hex, gap: z.number().min(0).max(3), radius: z.number().min(0).max(30), layers: z.array(Layer).max(30) });

export async function saveDesignDraft(design: Design) {
  return run("admin", async () => {
    const d = DesignSchema.parse(design) as Design;
    await updateSetting("design", (cur) => ({ ...cur, draft: d }));
  });
}

export async function publishDesign(design: Design) {
  return run(
    "admin",
    async () => {
      const d = DesignSchema.parse(design) as Design;
      const next = await updateSetting("design", (cur) => ({ draft: d, published: d, publishedVersion: cur.publishedVersion + 1, publishedAt: new Date().toISOString() }));
      await bumpManifest();
      return next.publishedVersion;
    },
    ["/admin/design"],
  );
}

// ---------------- motion ----------------

const Sliders = z.object({
  swapEvery: z.number().min(0.1).max(60),
  jitter: z.number().min(0).max(0.49),
  maxChanging: z.number().min(0.01).max(1),
  hold: z.number().min(0).max(120),
  speed: z.number().min(0.1).max(5),
  whiten: z.number().min(0).max(10),
  emptyMin: z.number().min(0).max(10),
  emptyMax: z.number().min(0).max(10),
  slide: z.number().min(0.05).max(10),
  slideFrom: z.number().min(0).max(3),
  fadeIn: z.number().min(0).max(1),
  tilt: z.number().min(0).max(45),
  settle: z.number().min(0.5).max(2),
  vary: z.number().min(0).max(0.9),
  cols: z.number().int().min(1).max(24),
  rows: z.number().int().min(1).max(16),
});

export async function saveMotion(input: Omit<MotionSettings, "version">) {
  return run(
    "admin",
    async () => {
      const sliders = Sliders.parse(input.sliders);
      const custom = z.array(z.object({ id: z.string().max(40), name: z.string().max(60), code: z.string().max(20000) })).max(30).parse(input.custom);
      for (const c of custom) {
        const r = checkEffect(c.code);
        if (!r.ok) throw new HttpError(400, `"${c.name}" has a problem: ${r.errors[0].message}`);
        c.name = r.doc.name;
      }
      const effectId = z.string().max(40).parse(input.effectId);
      if (effectId !== "builtin" && !custom.some((c) => c.id === effectId)) throw new HttpError(400, "Pick an effect that exists.");
      const params = z.record(z.string(), z.record(z.string(), z.number())).parse(input.params);
      const cur = await getSetting("motion");
      const next: MotionSettings = { preset: String(input.preset).slice(0, 40), sliders, effectId, custom, params, version: cur.version + 1 };
      await setSetting("motion", next);
      await bumpManifest();
      return next.version;
    },
    ["/admin/motion"],
  );
}

// ---------------- walls ----------------

function wallKey() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
}

export async function createWall(name: string) {
  return run(
    "admin",
    async () => {
      const clean = z.string().trim().min(1).max(60).parse(name);
      const existing = await db.select({ id: walls.id }).from(walls);
      if (existing.length >= 10) throw new HttpError(400, "That's a lot of walls. Remove one first.");
      const [w] = await db.insert(walls).values({ name: clean, key: wallKey(), primary: existing.length === 0 }).returning();
      publish({ type: "walls" });
      return w.key;
    },
    ["/admin", "/admin/walls"],
  );
}

export async function updateWall(id: string, input: { name?: string; cols?: number | null; rows?: number | null; showQr?: boolean; primary?: boolean }) {
  return run(
    "admin",
    async () => {
      const v = z
        .object({
          name: z.string().trim().min(1).max(60).optional(),
          cols: z.number().int().min(1).max(24).nullable().optional(),
          rows: z.number().int().min(1).max(16).nullable().optional(),
          showQr: z.boolean().optional(),
          primary: z.boolean().optional(),
        })
        .parse(input);
      const wid = z.string().uuid().parse(id);
      if (v.primary) await db.update(walls).set({ primary: false }).where(ne(walls.id, wid));
      await db.update(walls).set(v).where(eq(walls.id, wid));
      await bumpManifest();
      publish({ type: "walls" });
    },
    ["/admin/walls"],
  );
}

export async function newWallKey(id: string) {
  return run(
    "admin",
    async () => {
      const key = wallKey();
      await db.update(walls).set({ key }).where(eq(walls.id, z.string().uuid().parse(id)));
      publish({ type: "walls" });
      return key;
    },
    ["/admin/walls"],
  );
}

export async function deleteWall(id: string) {
  return run(
    "admin",
    async () => {
      await db.delete(walls).where(eq(walls.id, z.string().uuid().parse(id)));
      publish({ type: "walls" });
    },
    ["/admin", "/admin/walls"],
  );
}

export async function forceResync(id: string | null) {
  return run(
    "admin",
    async () => {
      const now = new Date();
      if (id) await db.update(walls).set({ resyncAt: now }).where(eq(walls.id, z.string().uuid().parse(id)));
      else await db.update(walls).set({ resyncAt: now });
      await bumpManifest();
      publish({ type: "resync", wallId: id });
    },
    ["/admin", "/admin/walls"],
  );
}

// ---------------- assets ----------------

export async function deleteAsset(id: string) {
  return run(
    "admin",
    async () => {
      const [a] = await db.delete(assets).where(eq(assets.id, z.string().uuid().parse(id))).returning();
      if (a) await storage().delete(a.key).catch(() => {});
      await bumpManifest();
    },
    ["/admin/design", "/admin/guest"],
  );
}

// ---------------- team ----------------

export async function addTeamMember(input: { name: string; email: string; password: string; role: Role }) {
  return run(
    "owner",
    async () => {
      const v = z
        .object({ name: z.string().trim().min(1).max(60), email: z.email().max(200), password: z.string().min(10).max(256), role: z.enum(["admin", "moderator"]) })
        .parse(input);
      await createAccount(v);
    },
    ["/admin/team"],
  );
}

export async function setTeamRole(userId: string, role: Role) {
  return run(
    "owner",
    async (me) => {
      if (userId === me.id) throw new HttpError(400, "You can't change your own role.");
      await db.update(user).set({ role: z.enum(["admin", "moderator"]).parse(role) }).where(eq(user.id, userId));
    },
    ["/admin/team"],
  );
}

export async function removeTeamMember(userId: string) {
  return run(
    "owner",
    async (me) => {
      if (userId === me.id) throw new HttpError(400, "You can't remove yourself.");
      await db.delete(user).where(eq(user.id, userId));
    },
    ["/admin/team"],
  );
}

export async function resetTeamPassword(userId: string, password: string) {
  return run(
    "owner",
    async () => {
      const pw = z.string().min(10).max(256).parse(password);
      const ctx = await auth.$context;
      const hash = await ctx.password.hash(pw);
      await db.update(account).set({ password: hash }).where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
      await db.delete(session).where(eq(session.userId, userId));
    },
    ["/admin/team"],
  );
}

// ---------------- exports ----------------

export async function requestExport(kind: "zip" | "mp4", options: Record<string, unknown>) {
  return run(
    "admin",
    async (me) => {
      const k = z.enum(["zip", "mp4"]).parse(kind);
      const opts =
        k === "zip"
          ? z.object({ guests: z.boolean(), roster: z.boolean(), hidden: z.boolean() }).parse(options)
          : z
              .object({
                length: z.enum(["all", "180", "60", "30"]),
                size: z.enum(["1920x1080", "3840x2160", "1080x1920"]),
                guests: z.boolean(),
                roster: z.boolean(),
              })
              .parse(options);
      const busy = await db.query.exportsTable.findFirst({ where: and(eq(exportsTable.kind, k), inArray(exportsTable.status, ["queued", "running"])) });
      if (busy) throw new HttpError(409, "One is already being prepared.");
      const [row] = await db.insert(exportsTable).values({ kind: k, options: opts, requestedBy: me.email }).returning();
      publish({ type: "exports" });
      if (k === "zip") {
        const { runZipExport } = await import("@/lib/exports");
        void runZipExport(row.id);
      }
      return row.id;
    },
    ["/admin"],
  );
}

export async function deleteExport(id: string) {
  return run(
    "admin",
    async () => {
      const [row] = await db.delete(exportsTable).where(eq(exportsTable.id, z.string().uuid().parse(id))).returning();
      if (row?.key) await storage().delete(row.key).catch(() => {});
      publish({ type: "exports" });
    },
    ["/admin"],
  );
}

export async function setAutoApprove(on: boolean) {
  return run("moderator", async () => void (await updateSetting("guest", (g) => ({ ...g, autoApprove: !!on }))), ["/admin/photos", "/admin/guest"]);
}

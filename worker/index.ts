/**
 * Background worker (a second Railway service from the same repo).
 *
 * - Renders MP4 exports: opens /wall/render in headless Chromium, steps the wall's virtual clock
 *   one frame at a time, and pipes screenshots into ffmpeg. Never drops a frame.
 * - Deletes guest photo files once the retention period after the event has passed.
 * - Deletes export files whose download link has expired.
 *
 * Run with: npm run worker  (needs Chromium and ffmpeg; see worker/Dockerfile)
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, asc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { chromium, type Browser } from "playwright-core";
import { db } from "@/db";
import { exportsTable, photos } from "@/db/schema";
import { appUrl } from "@/lib/env";
import { renderToken, type Mp4Options } from "@/lib/render-token";
import { bumpManifest, getSetting } from "@/lib/settings";
import { keys, storage } from "@/lib/storage";

const FPS = 30;
const LINK_DAYS = 7;
const MAX_SECONDS = 30 * 60;
const POLL_MS = 5000;
const HOUSEKEEPING_MS = 60 * 60 * 1000;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function setProgress(id: string, progress: number) {
  await db.update(exportsTable).set({ progress: Math.max(0, Math.min(1, progress)) }).where(eq(exportsTable.id, id));
}

async function claimNext() {
  const [next] = await db.select().from(exportsTable).where(and(eq(exportsTable.kind, "mp4"), eq(exportsTable.status, "queued"))).orderBy(asc(exportsTable.createdAt)).limit(1);
  if (!next) return null;
  const [claimed] = await db
    .update(exportsTable)
    .set({ status: "running", progress: 0 })
    .where(and(eq(exportsTable.id, next.id), eq(exportsTable.status, "queued")))
    .returning();
  return claimed ?? null;
}

async function launch(): Promise<Browser> {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars", "--force-color-profile=srgb"],
  });
}

async function renderMp4(row: typeof exportsTable.$inferSelect) {
  const o = row.options as Mp4Options;
  const [width, height] = o.size.split("x").map(Number);
  const base = (process.env.RENDER_APP_URL || appUrl()).replace(/\/+$/, "");
  const url = `${base}/wall/render?export=${row.id}&token=${renderToken(row.id)}`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lpw-render-"));
  const out = path.join(dir, "wall.mp4");
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    log(`render ${row.id}: loading photos`);
    // wait for every photo to be downloaded and decoded
    const deadline = Date.now() + 20 * 60_000;
    for (;;) {
      const s = await page.evaluate(() => window.__lpw && { ready: window.__lpw.ready, error: window.__lpw.error, loaded: window.__lpw.loaded, total: window.__lpw.total });
      if (s?.error) throw new Error(s.error);
      if (s?.ready) break;
      if (Date.now() > deadline) throw new Error("Photos took too long to load.");
      if (s?.total) await setProgress(row.id, 0.1 * (s.loaded / s.total));
      await new Promise((r) => setTimeout(r, 1000));
    }
    const total = await page.evaluate(() => window.__lpw!.total);
    const fixed = o.length === "all" ? null : Number(o.length);
    const maxFrames = (fixed ?? MAX_SECONDS) * FPS;

    // let the wall fill before recording
    await page.evaluate((dt) => window.__lpw!.step(dt), 1.5);

    const ff = spawn(
      process.env.FFMPEG_PATH || "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const done = new Promise<void>((resolve, reject) => {
      ff.on("error", reject);
      ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    });

    let frame = 0;
    let tail = -1; // frames left to record after every photo has been shown once
    let lastReport = 0;
    while (frame < maxFrames) {
      await page.evaluate((dt) => window.__lpw!.step(dt), 1 / FPS);
      const jpg = await page.screenshot({ type: "jpeg", quality: 92, animations: "allow", caret: "initial" });
      if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
      frame++;
      if (fixed === null) {
        if (tail < 0) {
          const shown = await page.evaluate(() => window.__lpw!.shown);
          if (shown >= total) tail = 4 * FPS;
        } else if (--tail <= 0) break;
      }
      const p = fixed !== null ? frame / maxFrames : Math.min(0.95, (await page.evaluate(() => window.__lpw!.shown)) / Math.max(1, total));
      if (frame - lastReport >= FPS * 2) {
        lastReport = frame;
        await setProgress(row.id, 0.1 + 0.85 * p);
      }
    }
    ff.stdin.end();
    await done;
    log(`render ${row.id}: ${frame} frames, uploading`);
    const { size } = await fs.stat(out);
    const key = keys.export(row.id, ".mp4");
    await storage().putStream(key, createReadStream(out), "video/mp4");
    await db
      .update(exportsTable)
      .set({ status: "done", progress: 1, key, bytes: size, finishedAt: new Date(), expiresAt: new Date(Date.now() + LINK_DAYS * 86400_000) })
      .where(eq(exportsTable.id, row.id));
    log(`render ${row.id}: done (${(size / 1e6).toFixed(1)} MB)`);
  } finally {
    await browser.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Guest photo files are deleted `retentionDays` after the event ends. Roster photos are kept. */
async function retention() {
  const event = await getSetting("event");
  if (!event.endsAt) return;
  const cutoff = new Date(event.endsAt).getTime() + event.retentionDays * 86400_000;
  if (Date.now() < cutoff) return;
  const due = await db.select().from(photos).where(and(eq(photos.source, "guest"), isNull(photos.filesDeletedAt))).limit(500);
  if (!due.length) return;
  const s = storage();
  for (const p of due) {
    const shared = await db.query.photos.findFirst({ where: and(eq(photos.hash, p.hash), eq(photos.source, "roster")) });
    if (!shared) await Promise.allSettled([s.delete(keys.orig(p.hash)), s.delete(keys.view(p.hash)), s.delete(keys.thumb(p.hash))]);
    await db.update(photos).set({ filesDeletedAt: new Date(), removedAt: p.removedAt ?? new Date() }).where(eq(photos.id, p.id));
  }
  await bumpManifest();
  log(`retention: deleted files for ${due.length} guest photos`);
}

async function expiredExports() {
  const rows = await db
    .select()
    .from(exportsTable)
    .where(and(eq(exportsTable.status, "done"), isNotNull(exportsTable.key), lt(exportsTable.expiresAt, new Date())));
  for (const r of rows) {
    await storage().delete(r.key!).catch(() => {});
    await db.update(exportsTable).set({ key: null }).where(eq(exportsTable.id, r.id));
  }
  if (rows.length) log(`exports: removed ${rows.length} expired files`);
}

async function main() {
  log("worker started");
  // a restart in the middle of a render leaves it "running": put it back in the queue
  await db.update(exportsTable).set({ status: "queued", progress: 0 }).where(and(eq(exportsTable.kind, "mp4"), inArray(exportsTable.status, ["running"])));
  let lastHousekeeping = 0;
  let stopping = false;
  process.on("SIGTERM", () => (stopping = true));
  process.on("SIGINT", () => (stopping = true));
  while (!stopping) {
    try {
      if (Date.now() - lastHousekeeping > HOUSEKEEPING_MS) {
        lastHousekeeping = Date.now();
        await retention();
        await expiredExports();
      }
      const job = await claimNext();
      if (job) {
        log(`render ${job.id}: started`, job.options);
        try {
          await renderMp4(job);
        } catch (e) {
          console.error(e);
          await db
            .update(exportsTable)
            .set({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "Render failed", finishedAt: new Date() })
            .where(eq(exportsTable.id, job.id));
        }
        continue;
      }
    } catch (e) {
      console.error("worker loop", e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  log("worker stopping");
  process.exit(0);
}

void main();

import "server-only";
import { PassThrough } from "node:stream";
import { ZipArchive } from "archiver";
import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { exportsTable, photos } from "@/db/schema";
import { publish } from "./bus";
import { keys, storage } from "./storage";

const LINK_DAYS = 7;

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeName(s: string) {
  return s.replace(/[^\w.\- ]+/g, "_").slice(0, 60).trim() || "photo";
}

/** Build "all photos" zip: guests/, roster/, (not-shown/), captions.csv. Runs in the web process. */
export async function runZipExport(id: string) {
  const row = await db.query.exportsTable.findFirst({ where: eq(exportsTable.id, id) });
  if (!row) return;
  const opts = row.options as { guests: boolean; roster: boolean; hidden: boolean };
  await db.update(exportsTable).set({ status: "running", progress: 0 }).where(eq(exportsTable.id, id));
  publish({ type: "exports" });
  try {
    const conds = [];
    if (opts.guests) conds.push(and(eq(photos.source, "guest"), eq(photos.status, "approved"), isNull(photos.removedAt)));
    if (opts.roster) conds.push(and(eq(photos.source, "roster"), isNull(photos.removedAt)));
    if (opts.hidden) conds.push(or(eq(photos.status, "rejected"), isNotNull(photos.removedAt)));
    if (!conds.length) throw new Error("Nothing selected");
    const list = await db
      .select()
      .from(photos)
      .where(and(or(...conds), isNull(photos.filesDeletedAt)))
      .orderBy(asc(photos.source), asc(photos.sortKey), asc(photos.createdAt));

    const archive = new ZipArchive({ store: true });
    const out = new PassThrough();
    archive.pipe(out);
    const key = keys.export(id, ".zip");
    const upload = storage().putStream(key, out, "application/zip");
    let bytes = 0;
    archive.on("data", (c: Buffer) => (bytes += c.length));

    const rows = [["file", "shared_by", "caption", "original_caption", "taken_at", "taken_at_source", "camera", "first_shown_on_wall", "times_shown", "status"]];
    const used = new Set<string>();
    let i = 0;
    for (const p of list) {
      const folder = p.status === "rejected" || p.removedAt ? "not-shown" : p.source === "guest" ? "guests" : "roster";
      let base = p.source === "roster" && p.fileName ? safeName(p.fileName.replace(/\.[^.]+$/, "")) : `${String(++i).padStart(4, "0")}-${safeName(p.guestName ?? "guest")}`;
      while (used.has(`${folder}/${base}`)) base += "-1";
      used.add(`${folder}/${base}`);
      const file = `${folder}/${base}.jpg`;
      const stream = await storage().stream(keys.orig(p.hash));
      if (!stream) continue;
      archive.append(stream, { name: file, date: p.takenAt ?? p.createdAt });
      rows.push([file, p.guestName ?? (p.source === "roster" ? "(roster)" : ""), p.caption ?? "", p.originalCaption ?? "", p.takenAt?.toISOString() ?? "", p.takenAtSource ?? "", p.camera ?? "", p.firstShownAt?.toISOString() ?? "", String(p.showCount), p.status === "rejected" ? "not shown" : p.removedAt ? "taken down" : "shown"]);
      await new Promise<void>((resolve) => archive.once("entry", () => resolve()));
      await db.update(exportsTable).set({ progress: rows.length / (list.length + 1) }).where(eq(exportsTable.id, id));
    }
    archive.append(rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n", { name: "captions.csv" });
    await archive.finalize();
    await upload;
    await db
      .update(exportsTable)
      .set({ status: "done", progress: 1, key, bytes, finishedAt: new Date(), expiresAt: new Date(Date.now() + LINK_DAYS * 86400_000) })
      .where(eq(exportsTable.id, id));
  } catch (e) {
    console.error("zip export failed", e);
    await db.update(exportsTable).set({ status: "failed", error: e instanceof Error ? e.message : "failed", finishedAt: new Date() }).where(eq(exportsTable.id, id));
  }
  publish({ type: "exports" });
}

export async function latestExports() {
  const rows = await db.select().from(exportsTable).orderBy(asc(exportsTable.createdAt));
  const by: Record<"zip" | "mp4", typeof rows[number] | null> = { zip: null, mp4: null };
  for (const r of rows) by[r.kind] = r;
  return by;
}

export async function staleCleanup() {
  // a restart in the middle of a zip leaves it "running": mark it failed so it can be retried
  await db
    .update(exportsTable)
    .set({ status: "failed", error: "Interrupted. Try again." })
    .where(and(eq(exportsTable.kind, "zip"), inArray(exportsTable.status, ["running", "queued"])));
}

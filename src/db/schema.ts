import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export * from "./auth-schema";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** Key/value settings. Each key holds one JSON document (see src/lib/settings.ts). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** People who uploaded from the guest page. The id lives in an httpOnly cookie. */
export const guests = pgTable("guests", {
  id: id(),
  name: text("name").notNull(),
  blocked: boolean("blocked").notNull().default(false),
  createdAt: createdAt(),
});

export type PhotoSource = "guest" | "roster";
export type PhotoStatus = "pending" | "approved" | "rejected";

export const photos = pgTable(
  "photos",
  {
    id: id(),
    source: text("source").$type<PhotoSource>().notNull(),
    status: text("status").$type<PhotoStatus>().notNull().default("pending"),
    /** Taken off the wall (still kept for exports). Undo by clearing it. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    guestId: text("guest_id").references(() => guests.id, { onDelete: "set null" }),
    guestName: text("guest_name"),
    caption: text("caption"),
    originalCaption: text("original_caption"),
    fileName: text("file_name"),
    /** sha256 of the cleaned full-size JPEG; also the storage key stem. */
    hash: text("hash").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    takenAtSource: text("taken_at_source").$type<"exif" | "upload">(),
    camera: text("camera"),
    /** Roster play order (file-name order) */
    sortKey: text("sort_key"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by"),
    firstShownAt: timestamp("first_shown_at", { withTimezone: true }),
    showCount: integer("show_count").notNull().default(0),
    filesDeletedAt: timestamp("files_deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("photos_status_idx").on(t.status, t.source),
    index("photos_guest_idx").on(t.guestId),
    uniqueIndex("photos_roster_hash_idx").on(t.hash).where(sql`${t.source} = 'roster'`),
  ],
);

/** Uploaded fonts, PNG overlays and logos. */
export const assets = pgTable("assets", {
  id: id(),
  kind: text("kind").$type<"font" | "image">().notNull(),
  name: text("name").notNull(),
  key: text("key").notNull(),
  mime: text("mime").notNull(),
  width: integer("width"),
  height: integer("height"),
  bytes: integer("bytes").notNull(),
  createdAt: createdAt(),
});

/** Guest upload links. Rotating creates a new one and lets the old one expire after a grace period. */
export const guestLinks = pgTable("guest_links", {
  slug: text("slug").primaryKey(),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

/** A display (LED wall, lobby screen). Paired with a short key. */
export const walls = pgTable("walls", {
  id: id(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  primary: boolean("primary").notNull().default(false),
  cols: integer("cols"),
  rows: integer("rows"),
  showQr: boolean("show_qr").notNull().default(true),
  resyncAt: timestamp("resync_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  status: jsonb("status").$type<WallStatus>(),
  createdAt: createdAt(),
});

export type WallStatus = {
  manifestVersion: number;
  cached: number;
  total: number;
  width: number;
  height: number;
  userAgent: string;
  online: boolean;
  installed: boolean;
  wakeLock: boolean;
  swaps: number;
  warning?: string | null;
};

/** Fast lane: a wall promises to show a newly approved photo in a given cell at a given time. */
export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    wallId: text("wall_id")
      .notNull()
      .references(() => walls.id, { onDelete: "cascade" }),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    rows: integer("rows").notNull(),
    cols: integer("cols").notNull(),
    showAt: timestamp("show_at", { withTimezone: true }).notNull(),
    holdSeconds: real("hold_seconds").notNull().default(10),
    createdAt: createdAt(),
  },
  (t) => [index("reservations_photo_idx").on(t.photoId)],
);

export type ExportKind = "zip" | "mp4";
export type ExportStatus = "queued" | "running" | "done" | "failed";

export const exportsTable = pgTable("exports", {
  id: id(),
  kind: text("kind").$type<ExportKind>().notNull(),
  status: text("status").$type<ExportStatus>().notNull().default("queued"),
  options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
  progress: real("progress").notNull().default(0),
  key: text("key"),
  bytes: bigint("bytes", { mode: "number" }),
  error: text("error"),
  requestedBy: text("requested_by"),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

/** Log of photos taken off the wall from the stats screen or admin, for undo and audit. */
export const removals = pgTable("removals", {
  id: id(),
  photoId: text("photo_id")
    .notNull()
    .references(() => photos.id, { onDelete: "cascade" }),
  by: text("by").notNull(),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
  createdAt: createdAt(),
});

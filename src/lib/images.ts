import "server-only";
import crypto from "node:crypto";
import exifr from "exifr";
import sharp from "sharp";

export type ProcessedImage = {
  hash: string;
  original: Buffer;
  view: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  takenAt: Date | null;
  takenAtSource: "exif" | "upload" | null;
  camera: string | null;
};

const MAX_ORIGINAL = 4096;

function isHeic(buf: Buffer) {
  // ISO-BMFF "ftyp" box with a HEIF brand
  if (buf.length < 12 || buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12);
  return ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(brand);
}

async function decodeHeic(buf: Buffer): Promise<Buffer> {
  const { default: convert } = (await import("heic-convert")) as unknown as {
    default: (o: { buffer: Buffer; format: "JPEG"; quality: number }) => Promise<ArrayBuffer>;
  };
  return Buffer.from(await convert({ buffer: buf, format: "JPEG", quality: 0.95 }));
}

/**
 * Turns an upload into a clean full-size JPEG (orientation applied, all metadata including GPS
 * stripped) plus webp derivatives. The hash of the clean JPEG names every file.
 */
export async function processPhoto(
  input: Buffer,
  hints: { takenAt?: Date | null; takenAtFromExif?: boolean; camera?: string | null } = {},
): Promise<ProcessedImage> {
  let meta: { DateTimeOriginal?: Date; CreateDate?: Date; Make?: string; Model?: string } | undefined;
  try {
    meta = await exifr.parse(input, { pick: ["DateTimeOriginal", "CreateDate", "Make", "Model"] });
  } catch {
    meta = undefined;
  }
  let buf = input;
  if (isHeic(buf)) {
    try {
      await sharp(buf).metadata();
      // sharp may read HEIF metadata but still fail to decode HEVC; check decode explicitly
      await sharp(buf).resize(8).toBuffer();
    } catch {
      buf = await decodeHeic(buf);
    }
  }
  const base = sharp(buf, { failOn: "error", limitInputPixels: 120_000_000 }).rotate();
  const original = await base
    .clone()
    .resize(MAX_ORIGINAL, MAX_ORIGINAL, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const view = await sharp(original.data)
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const thumb = await sharp(original.data)
    .resize(400, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
  const hash = crypto.createHash("sha256").update(original.data).digest("hex").slice(0, 40);
  const exifDate = meta?.DateTimeOriginal ?? meta?.CreateDate;
  const exifTaken = validDate(exifDate);
  const takenAt = exifTaken ?? validDate(hints.takenAt) ?? null;
  const takenAtSource = exifTaken || (takenAt && hints.takenAtFromExif) ? "exif" : takenAt ? "upload" : null;
  const camera =
    [meta?.Make, meta?.Model].filter(Boolean).join(" ").trim() || hints.camera?.slice(0, 80) || null;
  return {
    hash,
    original: original.data,
    view,
    thumb,
    width: original.info.width,
    height: original.info.height,
    takenAt,
    takenAtSource,
    camera,
  };
}

function validDate(d: unknown): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() < 1900 || date.getTime() > Date.now() + 86400000) return null;
  return date;
}

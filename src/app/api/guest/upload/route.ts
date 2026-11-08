import { z } from "zod";
import { ensureGuest, isValidLink } from "@/lib/guest";
import { uploadsUsed } from "@/lib/guest-photos";
import { ingestPhoto, MAX_UPLOAD_BYTES } from "@/lib/photos";
import { HttpError, jsonError } from "@/lib/session";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const Fields = z.object({
  slug: z.string().min(3).max(40),
  name: z.string().trim().min(1, "Please add your name").max(60),
  caption: z.string().max(140).optional().default(""),
  takenAt: z.string().max(40).optional(),
  takenAtFromExif: z.string().optional(),
  camera: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const parsed = Fields.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Missing details.");
    const f = parsed.data;
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose a photo first.");
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "That photo is larger than 25 MB.");
    if (!(await isValidLink(f.slug))) throw new HttpError(410, "This link has expired. Scan the QR on the wall again.");
    const settings = await getSetting("guest");
    if (!settings.open) throw new HttpError(403, "Uploads are closed. Thanks for sharing!");
    if (settings.captionRequired && !f.caption.trim()) throw new HttpError(400, "Please add a caption.");
    const guest = await ensureGuest(f.name);
    if (guest.blocked) throw new HttpError(403, "Uploads are closed. Thanks for sharing!");
    if ((await uploadsUsed(guest.id)) >= settings.perGuest)
      throw new HttpError(429, `You've shared ${settings.perGuest} photos, the most each person can add. Thank you!`);
    const takenAt = f.takenAt ? new Date(f.takenAt) : null;
    const { photo } = await ingestPhoto({
      buffer: Buffer.from(await file.arrayBuffer()),
      source: "guest",
      guestId: guest.id,
      guestName: guest.name,
      caption: f.caption,
      fileName: file.name,
      takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
      takenAtFromExif: f.takenAtFromExif === "1",
      camera: f.camera ?? null,
    });
    return Response.json({ id: photo.id, status: photo.status === "approved" ? "approved" : "pending" });
  } catch (e) {
    return jsonError(e);
  }
}

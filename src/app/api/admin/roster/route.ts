import { ingestPhoto } from "@/lib/photos";
import { jsonError, requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Upload one roster photo (the browser sends files one by one, already resized). */
export async function POST(request: Request) {
  try {
    await requireRole("admin");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
    const takenAt = form.get("takenAt");
    const d = typeof takenAt === "string" ? new Date(takenAt) : null;
    const { photo, duplicate } = await ingestPhoto({
      buffer: Buffer.from(await file.arrayBuffer()),
      source: "roster",
      fileName: String(form.get("originalName") ?? file.name),
      takenAt: d && !Number.isNaN(d.getTime()) ? d : null,
      takenAtFromExif: form.get("takenAtFromExif") === "1",
      camera: typeof form.get("camera") === "string" ? String(form.get("camera")) : null,
    });
    return Response.json({ id: photo.id, duplicate });
  } catch (e) {
    return jsonError(e);
  }
}

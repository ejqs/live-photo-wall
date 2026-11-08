"use client";

import exifr from "exifr";

export type Prepared = { blob: Blob; name: string; takenAt: string | null; takenAtFromExif: boolean; camera: string | null };

const MAX = 2560;

/**
 * Shrink a photo in the browser before upload (saves venue Wi-Fi), keeping the date it was
 * taken. Falls back to the original file when the browser cannot decode it (for example HEIC
 * outside Safari); the server converts those.
 */
export async function prepareImage(file: File): Promise<Prepared> {
  let takenAt: string | null = null;
  let camera: string | null = null;
  try {
    const meta = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate", "Make", "Model"] });
    const d = meta?.DateTimeOriginal ?? meta?.CreateDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) takenAt = d.toISOString();
    camera = [meta?.Make, meta?.Model].filter(Boolean).join(" ").trim() || null;
  } catch {}
  const fromExif = !!takenAt;
  if (!takenAt && file.lastModified) takenAt = new Date(file.lastModified).toISOString();

  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === "image/jpeg" && file.size < 6 * 1024 * 1024) {
      bmp.close();
      return { blob: file, name: file.name, takenAt, takenAtFromExif: fromExif, camera };
    }
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    if (!blob) throw new Error("encode failed");
    return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", takenAt, takenAtFromExif: fromExif, camera };
  } catch {
    return { blob: file, name: file.name, takenAt, takenAtFromExif: fromExif, camera };
  }
}

/** POST a form with upload progress (fetch has no upload progress). */
export function postWithProgress(url: string, form: FormData, onProgress: (p: number) => void): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, body: { error: "No connection. Check your Wi-Fi and try again." } });
    xhr.send(form);
  });
}

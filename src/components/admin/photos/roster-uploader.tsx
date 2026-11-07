"use client";

import { FolderUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { prepareImage, postWithProgress } from "@/components/guest/prepare-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const IMAGE_RE = /\.(jpe?g|png|heic|heif|webp|gif|tiff?|avif)$/i;

async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  const entries = Array.from(dt.items)
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return Array.from(dt.files);
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

/** Drop a folder of roster photos. Each is resized to 2560 px in the browser, then uploaded 3 at a time. */
export function RosterUploader() {
  const router = useRouter();
  const [drag, setDrag] = useState(false);
  const [state, setState] = useState<{ total: number; done: number; dupes: number; failed: string[] } | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    const list = files.filter((f) => IMAGE_RE.test(f.name) || f.type.startsWith("image/"));
    if (!list.length) return;
    const st = { total: list.length, done: 0, dupes: 0, failed: [] as string[] };
    setState({ ...st });
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const f = list[i++];
        try {
          const p = await prepareImage(f);
          const form = new FormData();
          form.set("file", p.blob, p.name);
          form.set("originalName", f.name);
          if (p.takenAt) form.set("takenAt", p.takenAt);
          form.set("takenAtFromExif", p.takenAtFromExif ? "1" : "0");
          if (p.camera) form.set("camera", p.camera);
          const res = await postWithProgress("/api/admin/roster", form, () => {});
          if (!res.ok) st.failed.push(`${f.name}: ${String(res.body.error ?? res.status)}`);
          else if (res.body.duplicate) st.dupes++;
        } catch {
          st.failed.push(f.name);
        }
        st.done++;
        setState({ ...st });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    router.refresh();
  }

  const busy = state !== null && state.done < state.total;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Default roster</CardTitle>
        <CardDescription>JPG, PNG, HEIC or WebP. Resized to 2560 px in your browser before upload; duplicates are skipped. Location data is always removed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDrag(false);
            upload(await filesFromDrop(e.dataTransfer));
          }}
          className={cn("flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center", drag && "border-primary bg-accent")}
        >
          <FolderUpIcon className="size-8 text-muted-foreground" aria-hidden />
          <span className="text-sm">Drop a folder or photos here</span>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => filesRef.current?.click()}>
              Choose photos
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => folderRef.current?.click()}>
              Choose a folder
            </Button>
          </div>
          <input ref={filesRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <input
            ref={(el) => {
              folderRef.current = el;
              el?.setAttribute("webkitdirectory", "");
            }}
            type="file"
            multiple
            hidden
            onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />
        </div>
        {state && (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between">
              <span>{busy ? `Uploading ${state.total} photos` : `Uploaded ${state.total - state.failed.length - state.dupes} photos`}</span>
              <span className="tabular-nums">
                {state.done} / {state.total}
              </span>
            </div>
            <Progress value={(state.done / state.total) * 100} />
            {state.dupes > 0 && <span className="text-muted-foreground">{state.dupes} duplicates skipped.</span>}
            {state.failed.length > 0 && (
              <details className="text-destructive">
                <summary>{state.failed.length} could not be uploaded</summary>
                <ul className="list-disc pl-5">
                  {state.failed.slice(0, 50).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

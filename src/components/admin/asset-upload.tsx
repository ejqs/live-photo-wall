"use client";

import { UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AssetItem } from "@/lib/admin-data";

/** Uploads a font, overlay or logo to /api/admin/assets. Files go to the bucket, never the repo. */
export function AssetUpload({
  accept,
  label,
  onUploaded,
  size = "sm",
  variant = "outline",
}: {
  accept: string;
  label: string;
  onUploaded: (a: AssetItem) => void;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "default";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch("/api/admin/assets", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error ?? `Couldn't upload ${file.name}`);
          continue;
        }
        onUploaded({ ...body.asset, bytes: file.size });
        toast.success(`Uploaded ${file.name}`);
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => upload(e.target.files)} />
      <Button type="button" size={size} variant={variant} disabled={busy} onClick={() => input.current?.click()}>
        <UploadIcon data-icon="inline-start" />
        {busy ? "Uploading…" : label}
      </Button>
    </>
  );
}

export const FONT_ACCEPT = ".ttf,.otf,.woff,.woff2";
export const IMAGE_ACCEPT = ".png,.svg,.webp,.jpg,.jpeg";

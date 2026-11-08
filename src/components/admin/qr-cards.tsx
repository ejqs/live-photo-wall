"use client";

import { PrinterIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useQr } from "@/wall/qr";

type QrStyle = { style: "classic" | "dots" | "rounded"; inverse: boolean };

export function QrCards({ url, eventName, qr, logo }: { url: string; eventName: string; qr: QrStyle; logo: string | null }) {
  const [perPage, setPerPage] = useState("4");
  const [title, setTitle] = useState(eventName);
  const [line, setLine] = useState("Scan to add your photo to the wall");
  const src = useQr(url, { style: qr.style, inverse: false }, logo);
  const n = Number(perPage);
  const shortUrl = url.replace(/^https?:\/\//, "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field className="w-auto">
          <FieldLabel>Cards per page</FieldLabel>
          <ToggleGroup type="single" variant="outline" size="sm" value={perPage} onValueChange={(v) => v && setPerPage(v)}>
            <ToggleGroupItem value="1">1</ToggleGroupItem>
            <ToggleGroupItem value="2">2</ToggleGroupItem>
            <ToggleGroupItem value="4">4</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field className="w-64">
          <FieldLabel htmlFor="qc-title">Title</FieldLabel>
          <Input id="qc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field className="w-80">
          <FieldLabel htmlFor="qc-line">Line under the code</FieldLabel>
          <Input id="qc-line" value={line} onChange={(e) => setLine(e.target.value)} />
        </Field>
        <Button onClick={() => print()}>
          <PrinterIcon data-icon="inline-start" />
          Print
        </Button>
      </div>
      <p className="text-sm text-muted-foreground print:hidden">If you rotate the guest link, print new cards: old cards stop working after the grace period.</p>
      <style>{`@page { size: A4; margin: 10mm; }`}</style>
      <div className="mx-auto w-[190mm] bg-white text-zinc-950 shadow print:shadow-none">
        <div className={n === 1 ? "grid h-[277mm] grid-cols-1" : n === 2 ? "grid h-[277mm] grid-rows-2" : "grid h-[277mm] grid-cols-2 grid-rows-2"}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="flex flex-col items-center justify-center gap-[4mm] border border-dashed border-zinc-300 p-[8mm] text-center">
              <strong className="font-[family-name:var(--font-display)] leading-none tracking-wide uppercase" style={{ fontSize: n === 1 ? "16mm" : "8mm" }}>
                {title}
              </strong>
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="QR code" style={{ width: n === 1 ? "120mm" : n === 2 ? "85mm" : "60mm" }} />
              ) : (
                <div style={{ width: n === 1 ? "120mm" : "60mm", aspectRatio: "1" }} />
              )}
              <span className="font-semibold" style={{ fontSize: n === 1 ? "8mm" : "4.2mm" }}>
                {line}
              </span>
              <span className="font-mono text-zinc-500" style={{ fontSize: n === 1 ? "4.5mm" : "2.8mm" }}>
                {shortUrl}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

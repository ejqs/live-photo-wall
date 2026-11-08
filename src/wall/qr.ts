"use client";

import { useEffect, useState } from "react";
import type { QrLayer } from "@/lib/settings-types";

/** Build a styled QR as an SVG data URL (works offline once the logo is cached). */
export async function qrDataUrl(data: string, layer: Pick<QrLayer, "style" | "inverse">, logoUrl: string | null): Promise<string> {
  const { default: QRCodeStyling } = await import("qr-code-styling");
  const fg = layer.inverse ? "#ffffff" : "#09090b";
  const bg = layer.inverse ? "#09090b" : "#ffffff";
  const dot = layer.style === "dots" ? "dots" : layer.style === "rounded" ? "rounded" : "square";
  const qr = new QRCodeStyling({
    type: "svg",
    width: 600,
    height: 600,
    margin: 0,
    data,
    image: logoUrl ?? undefined,
    qrOptions: { errorCorrectionLevel: logoUrl ? "H" : "M" },
    dotsOptions: { type: dot, color: fg },
    cornersSquareOptions: { type: layer.style === "classic" ? "square" : "extra-rounded", color: fg },
    cornersDotOptions: { type: layer.style === "classic" ? "square" : "dot", color: fg },
    backgroundOptions: { color: bg },
    imageOptions: { hideBackgroundDots: true, imageSize: 0.3, margin: 6, crossOrigin: "anonymous", saveAsBlob: true },
  });
  const blob = await qr.getRawData("svg");
  if (!blob || !(blob instanceof Blob)) throw new Error("QR failed");
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function useQr(data: string | null, layer: Pick<QrLayer, "style" | "inverse"> | null, logoUrl: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const style = layer?.style;
  const inverse = layer?.inverse;
  useEffect(() => {
    if (!data || !style) return;
    let live = true;
    qrDataUrl(data, { style, inverse: !!inverse }, logoUrl)
      .then((u) => live && setUrl(u))
      .catch(() => live && setUrl(null));
    return () => {
      live = false;
    };
  }, [data, style, inverse, logoUrl]);
  return url;
}

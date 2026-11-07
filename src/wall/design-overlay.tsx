"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { SYSTEM_FONTS, type Design, type DesignLayer } from "@/lib/settings-types";
import type { WallFont } from "./types";
import { useQr } from "./qr";

export function fontCss(font: string, fonts: WallFont[]): string {
  if (font in SYSTEM_FONTS) return SYSTEM_FONTS[font as keyof typeof SYSTEM_FONTS].css;
  const f = fonts.find((x) => x.id === font);
  return f ? `"${f.family}", system-ui, sans-serif` : SYSTEM_FONTS.sans.css;
}

export function FontFaces({ fonts }: { fonts: WallFont[] }) {
  if (!fonts.length) return null;
  const css = fonts.map((f) => `@font-face{font-family:"${f.family}";src:url("${f.url}");font-display:block;}`).join("\n");
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * The design layers drawn over the photo grid. Positions are stored in % of the canvas and
 * sizes in % of its height (cqh), so one design fits any LED wall resolution.
 */
export function DesignOverlay({
  design,
  fonts,
  assets,
  qrUrl,
  hideQr,
  selectedId,
  onLayerPointerDown,
}: {
  design: Design;
  fonts: WallFont[];
  assets: Record<string, string>;
  qrUrl: string | null;
  hideQr?: boolean;
  selectedId?: string | null;
  onLayerPointerDown?: (e: ReactPointerEvent<HTMLElement>, layer: DesignLayer) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" style={{ containerType: "size" }}>
      {design.layers.map((layer) => {
        if (layer.hidden) return null;
        if (layer.type === "qr" && hideQr) return null;
        const interactive = !!onLayerPointerDown;
        const common: CSSProperties = {
          pointerEvents: interactive ? "auto" : "none",
          cursor: interactive ? "move" : undefined,
          outline: selectedId === layer.id ? "2px dashed #38bdf8" : undefined,
          outlineOffset: 4,
          touchAction: interactive ? "none" : undefined,
        };
        const down = interactive ? (e: ReactPointerEvent<HTMLElement>) => onLayerPointerDown!(e, layer) : undefined;
        switch (layer.type) {
          case "dim":
            return <div key={layer.id} className="absolute inset-0" style={{ background: dimBackground(layer.amount, layer.mode), pointerEvents: "none" }} />;
          case "text": {
            const shift = layer.align === "left" ? "0%" : layer.align === "right" ? "-100%" : "-50%";
            return (
              <div
                key={layer.id}
                onPointerDown={down}
                className="absolute whitespace-pre-line"
                style={{
                  ...common,
                  left: `${layer.x}%`,
                  top: `${layer.y}%`,
                  transform: `translate(${shift}, -50%)`,
                  fontFamily: fontCss(layer.font, fonts),
                  fontSize: `${layer.size}cqh`,
                  fontWeight: layer.weight,
                  letterSpacing: `${layer.letterSpacing}em`,
                  lineHeight: 1.05,
                  color: layer.color,
                  textAlign: layer.align,
                  textTransform: layer.uppercase ? "uppercase" : undefined,
                  textShadow: layer.shadow ? "0 0.04em 0.25em rgba(0,0,0,.55)" : undefined,
                  whiteSpace: "pre",
                }}
              >
                {layer.text}
              </div>
            );
          }
          case "image": {
            const src = layer.assetId ? assets[layer.assetId] : null;
            if (!src) return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={layer.id}
                src={src}
                alt=""
                draggable={false}
                onPointerDown={down}
                className="absolute"
                style={{ ...common, left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.w}cqw`, transform: "translate(-50%, -50%)", opacity: layer.opacity }}
              />
            );
          }
          case "qr":
            return <QrCard key={layer.id} layer={layer} data={qrUrl} logo={layer.logoAssetId ? assets[layer.logoAssetId] ?? null : null} style={common} onPointerDown={down} />;
        }
      })}
    </div>
  );
}

function QrCard({
  layer,
  data,
  logo,
  style,
  onPointerDown,
}: {
  layer: Extract<DesignLayer, { type: "qr" }>;
  data: string | null;
  logo: string | null;
  style: CSSProperties;
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
}) {
  const src = useQr(data, layer, logo);
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute flex flex-col items-center"
      style={{
        ...style,
        left: `${layer.x}%`,
        top: `${layer.y}%`,
        width: `${layer.size}cqh`,
        transform: "translate(-50%, -50%)",
        background: layer.cardColor,
        color: layer.textColor,
        padding: `${layer.size * 0.07}cqh`,
        borderRadius: `${layer.size * 0.08}cqh`,
        gap: `${layer.size * 0.04}cqh`,
        boxShadow: "0 1cqh 3cqh rgba(0,0,0,.35)",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="QR code to add your photo" className="aspect-square w-full" draggable={false} />
      ) : (
        <div className="aspect-square w-full" />
      )}
      {layer.label && (
        <span style={{ fontSize: `${layer.size * 0.1}cqh`, fontWeight: 700, lineHeight: 1.1, textAlign: "center", fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
          {layer.label}
        </span>
      )}
    </div>
  );
}

function dimBackground(a: number, mode: "even" | "bottom" | "top" | "center") {
  const c = `rgba(0,0,0,${a})`;
  if (mode === "bottom") return `linear-gradient(to top, ${c}, rgba(0,0,0,0) 65%)`;
  if (mode === "top") return `linear-gradient(to bottom, ${c}, rgba(0,0,0,0) 65%)`;
  if (mode === "center") return `radial-gradient(ellipse at center, ${c}, rgba(0,0,0,0) 70%)`;
  return c;
}

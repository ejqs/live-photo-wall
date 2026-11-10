"use client";

import { ArrowDownIcon, ArrowUpIcon, EyeIcon, EyeOffIcon, ImageIcon, QrCodeIcon, SquareIcon, Trash2Icon, TypeIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { deleteAsset, publishDesign, saveDesignDraft } from "@/app/admin/actions";
import { AssetUpload, FONT_ACCEPT, IMAGE_ACCEPT } from "@/components/admin/asset-upload";
import { ColorRow, isHex, SliderRow, SwitchRow } from "@/components/admin/controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AssetItem } from "@/lib/admin-data";
import { SYSTEM_FONTS, type Design, type DesignLayer } from "@/lib/settings-types";
import { cn } from "@/lib/utils";
import { DesignOverlay, FontFaces } from "@/wall/design-overlay";
import { qrCells } from "@/wall/qr-cell";
import type { WallFont } from "@/wall/types";
import { ago } from "@/lib/time";

const RATIOS = [
  { id: "16:9", w: 16, h: 9 },
  { id: "32:9", w: 32, h: 9 },
  { id: "4:1", w: 4, h: 1 },
  { id: "9:16", w: 9, h: 16 },
];

const fontFamily = (id: string) => `lpw-${id.slice(0, 8)}`;

export function DesignEditor({
  initial,
  published,
  publishedVersion,
  publishedAt,
  assets: initialAssets,
  thumbs,
  grid,
  qrUrl,
  wallSizes,
}: {
  initial: Design;
  published: Design;
  publishedVersion: number;
  publishedAt: string | null;
  assets: AssetItem[];
  thumbs: string[];
  grid: { cols: number; rows: number };
  qrUrl: string;
  wallSizes: { name: string; w: number; h: number }[];
}) {
  const [design, setDesign] = useState<Design>(initial);
  const [assets, setAssets] = useState(initialAssets);
  const [selected, setSelected] = useState<string | null>(initial.layers.find((l) => l.type === "text")?.id ?? null);
  const [ratio, setRatio] = useState(wallSizes[0] ? `wall:0` : "16:9");
  const [version, setVersion] = useState(publishedVersion);
  const [pubAt, setPubAt] = useState(publishedAt);
  const [pubDesign, setPubDesign] = useState(published);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [pending, start] = useTransition();
  const canvas = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  const fonts: WallFont[] = useMemo(() => assets.filter((a) => a.kind === "font").map((a) => ({ id: a.id, family: fontFamily(a.id), url: a.url })), [assets]);
  const images = assets.filter((a) => a.kind === "image");
  const assetMap = useMemo(() => Object.fromEntries(images.map((a) => [a.id, a.url])), [images]);
  const dirty = JSON.stringify(design) !== JSON.stringify(pubDesign);

  // autosave the draft
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaving("saving");
    const t = setTimeout(async () => {
      const r = await saveDesignDraft(design);
      setSaving(r.ok ? "saved" : "idle");
      if (!r.ok) toast.error(r.error);
    }, 800);
    return () => clearTimeout(t);
  }, [design]);

  const aspect = (() => {
    if (ratio.startsWith("wall:")) {
      const w = wallSizes[Number(ratio.slice(5))];
      if (w) return { w: w.w, h: w.h };
    }
    const r = RATIOS.find((x) => x.id === ratio) ?? RATIOS[0];
    return { w: r.w, h: r.h };
  })();

  const layer = design.layers.find((l) => l.id === selected) ?? null;
  const patch = (id: string, p: Partial<DesignLayer>) =>
    setDesign((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...p } as DesignLayer) : l)) }));
  const move = (id: string, dir: -1 | 1) =>
    setDesign((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.layers.length) return d;
      const layers = [...d.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...d, layers };
    });
  const remove = (id: string) => {
    setDesign((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }));
    setSelected(null);
  };
  const add = (type: DesignLayer["type"]) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
    const base = { id, name: "" };
    const l: DesignLayer =
      type === "text"
        ? { ...base, type, name: "Text", text: "New text", font: "sans", size: 5, letterSpacing: 0, weight: 600, color: "#ffffff", shadow: true, uppercase: false, align: "center", x: 50, y: 50 }
        : type === "image"
          ? { ...base, type, name: "Overlay", assetId: images[0]?.id ?? null, x: 50, y: 50, w: 30, opacity: 1 }
          : type === "qr"
            ? { ...base, type, name: "Guest QR", x: 90, y: 80, size: 22, cell: true, style: "rounded", logoAssetId: null, inverse: false, label: "Add your photo", cardColor: "#ffffff", textColor: "#09090b" }
            : { ...base, type, name: "Dim", amount: 0.4, mode: "even" };
    setDesign((d) => ({ ...d, layers: type === "dim" ? [l, ...d.layers] : [...d.layers, l] }));
    setSelected(id);
  };

  // drag layers on the canvas
  const drag = useRef<{ id: string; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);
  const onLayerPointerDown = (e: ReactPointerEvent<HTMLElement>, l: DesignLayer) => {
    if (l.type === "dim") return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(l.id);
    const r = canvas.current!.getBoundingClientRect();
    drag.current = { id: l.id, sx: e.clientX, sy: e.clientY, x: l.x, y: l.y, w: r.width, h: r.height };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      let x = d.x + ((e.clientX - d.sx) / d.w) * 100;
      let y = d.y + ((e.clientY - d.sy) / d.h) * 100;
      // snap to center lines
      if (Math.abs(x - 50) < 1) x = 50;
      if (Math.abs(y - 50) < 1) y = 50;
      patch(d.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    };
    const onUp = () => (drag.current = null);
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    return () => {
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
    };
  }, []);

  // keyboard nudge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!layer || layer.type === "dim") return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [role=slider], [role=combobox]")) return;
      const step = e.shiftKey ? 2 : 0.2;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      patch(layer.id, { x: Math.round((layer.x + d[0]) * 10) / 10, y: Math.round((layer.y + d[1]) * 10) / 10 });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const cells = grid.cols * grid.rows;
  const qrTaken = new Set(qrCells(design, grid.cols, grid.rows, false));
  const publish = () =>
    start(async () => {
      const r = await publishDesign(design);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setVersion(r.data ?? version + 1);
      setPubAt(new Date().toISOString());
      setPubDesign(design);
      toast.success("Published. Walls update within a few seconds.");
    });

  return (
    <div className="flex flex-col gap-4">
      <FontFaces fonts={fonts} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ToggleGroup type="single" variant="outline" size="sm" value={ratio} onValueChange={(v) => v && setRatio(v)}>
            {wallSizes.map((w, i) => (
              <ToggleGroupItem key={`wall:${i}`} value={`wall:${i}`} title={`${w.w} × ${w.h}`}>
                {w.name}
              </ToggleGroupItem>
            ))}
            {RATIOS.map((r) => (
              <ToggleGroupItem key={r.id} value={r.id}>
                {r.id}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {saving === "saving" ? "Saving draft… · " : saving === "saved" ? "Draft saved · " : ""}Live: v{version}
            {pubAt ? `, published ${ago(new Date(pubAt).getTime())}` : ""}
          </span>
          {dirty && <Badge variant="secondary">Unpublished changes</Badge>}
          <Button variant="outline" size="sm" disabled={!dirty || pending} onClick={() => setDesign(pubDesign)}>
            Discard changes
          </Button>
          <Button size="sm" disabled={!dirty || pending} onClick={publish}>
            Publish to walls
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <div
            ref={canvas}
            className="relative mx-auto w-full overflow-hidden rounded-lg border select-none"
            style={{ aspectRatio: `${aspect.w} / ${aspect.h}`, background: design.background, maxHeight: "70vh", maxWidth: `calc(70vh * ${aspect.w / aspect.h})`, containerType: "size" }}
            onPointerDown={() => setSelected(null)}
          >
            <div
              className="absolute inset-0 grid"
              style={{
                // same layout as the wall engine, so the QR cell lines up
                gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
                gap: `${design.gap}cqh`,
                padding: `${design.gap}cqh`,
              }}
            >
              {Array.from({ length: cells }, (_, i) => {
                if (qrTaken.has(i)) return <div key={i} />;
                const t = thumbs.length ? thumbs[i % thumbs.length] : null;
                return t ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={t} alt="" className="size-full object-cover" style={{ borderRadius: `${design.radius}cqh` }} draggable={false} />
                ) : (
                  <div key={i} className="size-full bg-zinc-800" style={{ borderRadius: `${design.radius}cqh`, opacity: 0.4 + ((i * 37) % 60) / 100 }} />
                );
              })}
            </div>
            <DesignOverlay design={design} fonts={fonts} assets={assetMap} qrUrl={qrUrl} grid={grid} selectedId={selected} onLayerPointerDown={onLayerPointerDown} />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            The photos are frozen here so you can place things. Drag to move, arrow keys to nudge (Shift for bigger steps). Positions are relative, so the design fits any wall size.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-4 py-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Layers</CardTitle>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" title="Add text" onClick={() => add("text")}>
                  <TypeIcon />
                </Button>
                <Button size="icon-sm" variant="ghost" title="Add overlay image" onClick={() => add("image")}>
                  <ImageIcon />
                </Button>
                <Button size="icon-sm" variant="ghost" title="Add QR" onClick={() => add("qr")}>
                  <QrCodeIcon />
                </Button>
                <Button size="icon-sm" variant="ghost" title="Add dim" onClick={() => add("dim")}>
                  <SquareIcon />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-0.5">
                {[...design.layers].reverse().map((l) => (
                  <li key={l.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(l.id)}
                      onKeyDown={(e) => e.key === "Enter" && setSelected(l.id)}
                      className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent", selected === l.id && "bg-accent font-medium")}
                    >
                      <span className={cn("min-w-0 flex-1 truncate", l.hidden && "text-muted-foreground line-through")}>
                        {l.name || l.type}
                        {l.type === "text" && <span className="ml-1.5 text-xs text-muted-foreground">“{l.text.slice(0, 20)}”</span>}
                      </span>
                      <Button size="icon-xs" variant="ghost" title="Move up" onClick={(e) => (e.stopPropagation(), move(l.id, 1))}>
                        <ArrowUpIcon />
                      </Button>
                      <Button size="icon-xs" variant="ghost" title="Move down" onClick={(e) => (e.stopPropagation(), move(l.id, -1))}>
                        <ArrowDownIcon />
                      </Button>
                      <Button size="icon-xs" variant="ghost" title={l.hidden ? "Show" : "Hide"} onClick={(e) => (e.stopPropagation(), patch(l.id, { hidden: !l.hidden }))}>
                        {l.hidden ? <EyeOffIcon /> : <EyeIcon />}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {layer ? (
            <LayerProps layer={layer} patch={(p) => patch(layer.id, p)} onRemove={() => remove(layer.id)} fonts={assets.filter((a) => a.kind === "font")} images={images} />
          ) : (
            <Card className="gap-4 py-4">
              <CardHeader>
                <CardTitle>Canvas</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <ColorRow label="Background" value={design.background} onChange={(v) => isHex(v) && setDesign((d) => ({ ...d, background: v }))} />
                  <SliderRow label="Gap between photos" min={0} max={3} step={0.05} value={design.gap} onChange={(gap) => setDesign((d) => ({ ...d, gap }))} format={(v) => `${v.toFixed(2)}%`} />
                  <SliderRow label="Rounded corners" min={0} max={30} step={1} value={design.radius} onChange={(radius) => setDesign((d) => ({ ...d, radius }))} format={(v) => `${v}%`} />
                </FieldGroup>
              </CardContent>
            </Card>
          )}

          <Card className="gap-4 py-4">
            <CardHeader>
              <CardTitle>Fonts and overlays</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <AssetUpload accept={FONT_ACCEPT} label="Upload font" onUploaded={(a) => setAssets((s) => [...s, a])} />
                <AssetUpload accept={IMAGE_ACCEPT} label="Upload PNG / SVG" onUploaded={(a) => setAssets((s) => [...s, a])} />
              </div>
              {assets.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {assets.map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      {a.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt="" className="size-7 rounded bg-[repeating-conic-gradient(#d4d4d8_0_25%,#fff_0_50%)] bg-[length:8px_8px] object-contain" />
                      ) : (
                        <span className="flex size-7 items-center justify-center rounded bg-muted text-xs" style={{ fontFamily: `"${fontFamily(a.id)}"` }}>
                          Aa
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete"
                        onClick={() =>
                          start(async () => {
                            const used = design.layers.some((l) => (l.type === "text" && l.font === a.id) || (l.type === "image" && l.assetId === a.id) || (l.type === "qr" && l.logoAssetId === a.id));
                            if (used && !confirm(`"${a.name}" is used in the design. Delete it anyway?`)) return;
                            const r = await deleteAsset(a.id);
                            if (!r.ok) toast.error(r.error);
                            else setAssets((s) => s.filter((x) => x.id !== a.id));
                          })
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Files are stored in your bucket. Use fonts you have a license for.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LayerProps({
  layer,
  patch,
  onRemove,
  fonts,
  images,
}: {
  layer: DesignLayer;
  patch: (p: Partial<DesignLayer>) => void;
  onRemove: () => void;
  fonts: AssetItem[];
  images: AssetItem[];
}) {
  const pct = (v: number) => `${v.toFixed(1)}%`;
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="capitalize">{layer.type === "dim" ? "Dim" : layer.type === "qr" ? "QR card" : layer.type}</CardTitle>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <Trash2Icon data-icon="inline-start" />
          Remove
        </Button>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="layer-name">Layer name</FieldLabel>
            <Input id="layer-name" value={layer.name} maxLength={60} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          {layer.type === "text" && (
            <>
              <Field>
                <FieldLabel htmlFor="layer-text">Text</FieldLabel>
                <Textarea id="layer-text" rows={2} value={layer.text} maxLength={300} onChange={(e) => patch({ text: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel>Font</FieldLabel>
                <Select value={layer.font} onValueChange={(font) => patch({ font })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SYSTEM_FONTS).map(([k, f]) => (
                      <SelectItem key={k} value={k}>
                        {f.label}
                      </SelectItem>
                    ))}
                    {fonts.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <SliderRow label="Size" min={0.5} max={40} step={0.1} value={layer.size} onChange={(size) => patch({ size })} format={pct} hint="Percent of the wall's height." />
              <SliderRow label="Weight" min={100} max={900} step={100} value={layer.weight} onChange={(weight) => patch({ weight })} />
              <SliderRow label="Letter spacing" min={-0.1} max={0.5} step={0.005} value={layer.letterSpacing} onChange={(letterSpacing) => patch({ letterSpacing })} format={(v) => `${v.toFixed(3)}em`} />
              <ColorRow label="Color" value={layer.color} onChange={(color) => isHex(color) && patch({ color })} />
              <Field>
                <FieldLabel>Align</FieldLabel>
                <ToggleGroup type="single" variant="outline" size="sm" value={layer.align} onValueChange={(v) => v && patch({ align: v as "left" | "center" | "right" })}>
                  <ToggleGroupItem value="left">Left</ToggleGroupItem>
                  <ToggleGroupItem value="center">Center</ToggleGroupItem>
                  <ToggleGroupItem value="right">Right</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <SwitchRow label="All caps" checked={layer.uppercase} onChange={(uppercase) => patch({ uppercase })} />
              <SwitchRow label="Shadow" checked={layer.shadow} onChange={(shadow) => patch({ shadow })} />
            </>
          )}
          {layer.type === "image" && (
            <>
              <Field>
                <FieldLabel>Image</FieldLabel>
                <Select value={layer.assetId ?? ""} onValueChange={(assetId) => patch({ assetId })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Upload an image first" />
                  </SelectTrigger>
                  <SelectContent>
                    {images.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <SliderRow label="Width" min={1} max={200} step={0.5} value={layer.w} onChange={(w) => patch({ w })} format={pct} hint="Percent of the wall's width. 100% covers the whole wall." />
              <SliderRow label="Opacity" min={0} max={1} step={0.01} value={layer.opacity} onChange={(opacity) => patch({ opacity })} format={(v) => `${Math.round(v * 100)}%`} />
            </>
          )}
          {layer.type === "qr" && (
            <>
              <SwitchRow
                label="Sit in a grid cell"
                checked={layer.cell !== false}
                onChange={(cell) => patch({ cell })}
                hint="On: the card fills the cell nearest to where you drag it, and no photos play there. Off: place and size it freely over the photos; the cells under it only show roster photos, never guest photos."
              />
              {layer.cell === false && (
                <SliderRow label="Size" min={8} max={80} step={0.5} value={layer.size} onChange={(size) => patch({ size })} format={pct} hint="Percent of the wall's height. Guests need to scan it from across the room." />
              )}
              <Field>
                <FieldLabel>Style</FieldLabel>
                <ToggleGroup type="single" variant="outline" size="sm" value={layer.style} onValueChange={(v) => v && patch({ style: v as "classic" | "dots" | "rounded" })}>
                  <ToggleGroupItem value="classic">Classic</ToggleGroupItem>
                  <ToggleGroupItem value="rounded">Rounded</ToggleGroupItem>
                  <ToggleGroupItem value="dots">Dots</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="qr-label">Label</FieldLabel>
                <Input id="qr-label" value={layer.label} maxLength={60} onChange={(e) => patch({ label: e.target.value })} />
              </Field>
              <Field>
                <FieldLabel>Logo in the middle</FieldLabel>
                <Select value={layer.logoAssetId ?? "none"} onValueChange={(v) => patch({ logoAssetId: v === "none" ? null : v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {images.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <ColorRow label="Card color" value={layer.cardColor} onChange={(cardColor) => isHex(cardColor) && patch({ cardColor })} />
              <ColorRow label="Label color" value={layer.textColor} onChange={(textColor) => isHex(textColor) && patch({ textColor })} />
              <SwitchRow label="Light code on dark" checked={layer.inverse} onChange={(inverse) => patch({ inverse })} hint="Some phones read inverted codes slower. Test it before the event." />
            </>
          )}
          {layer.type === "dim" && (
            <>
              <SliderRow label="Amount" min={0} max={0.95} step={0.01} value={layer.amount} onChange={(amount) => patch({ amount })} format={(v) => `${Math.round(v * 100)}%`} />
              <Field>
                <FieldLabel>Where</FieldLabel>
                <ToggleGroup type="single" variant="outline" size="sm" value={layer.mode} onValueChange={(v) => v && patch({ mode: v as "even" | "bottom" | "top" | "center" })}>
                  <ToggleGroupItem value="even">Even</ToggleGroupItem>
                  <ToggleGroupItem value="center">Center</ToggleGroupItem>
                  <ToggleGroupItem value="top">Top</ToggleGroupItem>
                  <ToggleGroupItem value="bottom">Bottom</ToggleGroupItem>
                </ToggleGroup>
              </Field>
            </>
          )}
          {layer.type !== "dim" && (
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="layer-x">X %</FieldLabel>
                <Input id="layer-x" type="number" step={0.1} value={layer.x} onChange={(e) => patch({ x: Number(e.target.value) })} />
              </Field>
              <Field>
                <FieldLabel htmlFor="layer-y">Y %</FieldLabel>
                <Input id="layer-y" type="number" step={0.1} value={layer.y} onChange={(e) => patch({ y: Number(e.target.value) })} />
              </Field>
            </div>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

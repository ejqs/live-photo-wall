"use client";

import { CopyIcon, DownloadIcon, ExternalLinkIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveMotion } from "@/app/admin/actions";
import { SliderRow } from "@/components/admin/controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CustomEffect, MotionSettings } from "@/lib/settings-types";
import { cn } from "@/lib/utils";
import { WallPlayer } from "@/wall/player";
import type { WallManifest } from "@/wall/types";
import { aiBrief, BUILTIN_ID, checkEffect, DEFAULT_SLIDERS, paramDefaults, prettyJson, PRESETS, TEMPLATES, WHITEN_AND_DROP, type MotionSliders } from "@/wallmotion";

export const DRAFT_CHANNEL = "wallmotion-draft";
export type MotionDraftMessage = { type: "draft"; sliders: MotionSliders; effect: string; params: Record<string, number> };

type SliderDef = { k: keyof MotionSliders; label: string; min: number; max: number; step: number; unit?: string; hint?: string };
type SliderGroup = { name: string; desc: string; items: SliderDef[] };
const GROUPS: SliderGroup[] = [
  {
    name: "Pace",
    desc: "How often swaps start and how much of the wall moves at once.",
    items: [
      { k: "swapEvery", label: "Swap pace: a swap starts every", min: 0.1, max: 10, step: 0.05, unit: "s", hint: "Average gap between swaps across the whole wall." },
      { k: "jitter", label: "Jitter", min: 0, max: 0.49, step: 0.01, unit: "%", hint: "Random lead or lag on each gap so it never ticks like a clock." },
      { k: "maxChanging", label: "Max changing at once", min: 0.01, max: 1, step: 0.01, unit: "%", hint: "Share of cells allowed to be mid-swap together." },
      { k: "hold", label: "Hold", min: 0, max: 60, step: 0.5, unit: "s", hint: "Minimum time a landed photo stays before it can swap again." },
      { k: "speed", label: "Motion speed", min: 0.1, max: 3, step: 0.05, unit: "×", hint: "Scales every duration below (higher is faster)." },
    ],
  },
  {
    name: "Swap motion",
    desc: "The fade to white, the empty slot, and the glide in.",
    items: [
      { k: "whiten", label: "Fade to white", min: 0, max: 3, step: 0.01, unit: "s", hint: "Lingers on the photo, then washes to white." },
      { k: "emptyMin", label: "White slot wait (min)", min: 0, max: 3, step: 0.01, unit: "s", hint: "Shortest pause before the new photo falls." },
      { k: "emptyMax", label: "White slot wait (max)", min: 0, max: 3, step: 0.01, unit: "s", hint: "Longest pause before the new photo falls." },
      { k: "slide", label: "Glide duration", min: 0.05, max: 5, step: 0.01, unit: "s", hint: "Leaves quickly, long gentle slow-down at the end." },
      { k: "slideFrom", label: "Drop height", min: 0, max: 3, step: 0.05, unit: "cell", hint: "Start height above the slot, in cell heights." },
      { k: "fadeIn", label: "Fade-in share", min: 0, max: 1, step: 0.01, unit: "%", hint: "Part of the glide spent fading in." },
    ],
  },
  {
    name: "Settle & grid",
    desc: "Tilt, settle zoom, variation, and the grid itself.",
    items: [
      { k: "tilt", label: "Starting tilt", min: 0, max: 20, step: 0.1, unit: "°", hint: "Random left or right; straightens a little after landing." },
      { k: "settle", label: "Settle zoom", min: 0.5, max: 2, step: 0.01, unit: "×", hint: "Starts slightly larger and eases to normal." },
      { k: "vary", label: "Vary each swap", min: 0, max: 0.9, step: 0.01, unit: "%", hint: "Each swap’s lengths and distance vary by up to ±this." },
      { k: "cols", label: "Columns", min: 1, max: 24, step: 1, unit: "n", hint: "Grid columns on the wall. Walls can override the grid on the Walls page." },
      { k: "rows", label: "Rows", min: 1, max: 16, step: 1, unit: "n", hint: "Grid rows on the wall." },
    ],
  },
];

const fmt = (d: SliderDef) => (v: number) =>
  d.unit === "%"
    ? `${Math.round(v * 100)}%`
    : d.unit === "s"
      ? `${v.toFixed(2)} s`
      : d.unit === "°"
        ? `${v.toFixed(1)}°`
        : d.unit === "n"
          ? String(Math.round(v))
          : d.unit === "cell"
            ? `${v.toFixed(2)} cell`
            : `${v.toFixed(2)}×`;
const newId = () => `fx-${Math.random().toString(36).slice(2, 8)}`;

export function MotionEditor({ initial, manifest }: { initial: MotionSettings; manifest: WallManifest }) {
  const [sliders, setSliders] = useState(initial.sliders);
  const [preset, setPreset] = useState(initial.preset);
  const [effectId, setEffectId] = useState(initial.effectId);
  const [custom, setCustom] = useState<CustomEffect[]>(initial.custom);
  const [params, setParams] = useState(initial.params);
  const [editing, setEditing] = useState<string | null>(initial.custom[0]?.id ?? null);
  const [version, setVersion] = useState(initial.version);
  const [saved, setSaved] = useState(JSON.stringify({ s: initial.sliders, e: initial.effectId, c: initial.custom, p: initial.params }));
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = saved !== JSON.stringify({ s: sliders, e: effectId, c: custom, p: params });
  const editingFx = custom.find((c) => c.id === editing) ?? null;
  const check = useMemo(() => (editingFx ? checkEffect(editingFx.code) : null), [editingFx]);

  // the effect the preview plays: the selected one, or the one being edited if it is valid
  const active = useMemo(() => {
    const fx = custom.find((c) => c.id === effectId);
    if (effectId === BUILTIN_ID || !fx) return { doc: WHITEN_AND_DROP, code: prettyJson(WHITEN_AND_DROP), params: {} as Record<string, number>, warning: null as string | null };
    const r = checkEffect(fx.code);
    if (!r.ok) return { doc: WHITEN_AND_DROP, code: prettyJson(WHITEN_AND_DROP), params: {}, warning: `"${fx.name}" has a problem, so the preview plays the built-in effect.` };
    return { doc: r.doc, code: fx.code, params: { ...paramDefaults(r.doc), ...(params[fx.id] ?? {}) }, warning: null };
  }, [custom, effectId, params]);

  const effectOverride = useMemo(() => ({ doc: active.doc, params: active.params }), [active]);
  const previewManifest = useMemo<WallManifest>(
    () => ({ ...manifest, wall: { ...manifest.wall, cols: sliders.cols, rows: sliders.rows }, motion: { ...manifest.motion, sliders } }),
    [manifest, sliders],
  );

  // keep the full-screen preview window in sync
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(DRAFT_CHANNEL);
    } catch {
      return;
    }
    const msg: MotionDraftMessage = { type: "draft", sliders, effect: active.code, params: active.params };
    bc.postMessage(msg);
    bc.onmessage = (e) => e.data?.type === "hello" && bc?.postMessage(msg);
    return () => bc?.close();
  }, [sliders, active]);

  const setSlider = (k: keyof MotionSliders, v: number) => {
    setSliders((s) => {
      const next = { ...s, [k]: v };
      if (k === "emptyMin" && next.emptyMax < v) next.emptyMax = v;
      if (k === "emptyMax" && next.emptyMin > v) next.emptyMin = v;
      return next;
    });
    setPreset("Custom");
  };

  const updateCode = (id: string, code: string) => setCustom((cs) => cs.map((c) => (c.id === id ? { ...c, code } : c)));
  const addEffect = (code: string, name?: string) => {
    if (custom.length >= 30) {
      toast.error("You can keep up to 30 effects.");
      return;
    }
    const r = checkEffect(code);
    const id = newId();
    setCustom((cs) => [...cs, { id, name: name ?? (r.ok ? r.doc.name : "Untitled effect"), code }]);
    setEditing(id);
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20000) {
      toast.error("That file is too big for an effect (20 KB max).");
      return;
    }
    addEffect(await f.text());
    if (fileInput.current) fileInput.current.value = "";
  };

  const save = () =>
    start(async () => {
      const input = { preset, sliders, effectId, custom: custom.map((c) => ({ ...c, name: (() => { const r = checkEffect(c.code); return r.ok ? r.doc.name : c.name; })() })), params };
      const r = await saveMotion(input);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setVersion(r.data ?? version + 1);
      setSaved(JSON.stringify({ s: sliders, e: effectId, c: custom, p: params }));
      toast.success("Saved. Walls pick it up at the next swap.");
    });

  const activeDoc = active.doc;
  const fxParams = Object.entries(activeDoc.params ?? {});
  const activeFxId = custom.some((c) => c.id === effectId) ? effectId : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">Live: v{version}</span>
        {dirty && <Badge variant="secondary">Unsaved changes</Badge>}
        <Button variant="outline" size="sm" asChild>
          <a href="/wall/preview" target="_blank" rel="noreferrer">
            <ExternalLinkIcon data-icon="inline-start" />
            Full-screen preview
          </a>
        </Button>
        <Button size="sm" disabled={!dirty || pending} onClick={save}>
          Save and send to walls
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="relative w-full overflow-hidden rounded-lg border bg-black" style={{ aspectRatio: "16 / 9" }}>
            <WallPlayer manifest={previewManifest} effectOverride={effectOverride} hideQr concurrency={4} />
            {manifest.photos.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">Add roster photos to see the motion.</div>
            )}
          </div>
          {active.warning && (
            <Alert variant="destructive">
              <AlertTitle>Preview is using the built-in effect</AlertTitle>
              <AlertDescription>{active.warning}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="sliders">
            <TabsList>
              <TabsTrigger value="sliders">Timing and look</TabsTrigger>
              <TabsTrigger value="code">Effect code</TabsTrigger>
            </TabsList>
            <TabsContent value="sliders" className="mt-3">
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {GROUPS.map((g) => (
                  <Card key={g.name} className="gap-4 py-4">
                    <CardHeader>
                      <CardTitle>{g.name}</CardTitle>
                      <CardDescription>{g.desc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <FieldGroup>
                        {g.items.map((d) => (
                          <SliderRow key={d.k} label={d.label} min={d.min} max={d.max} step={d.step} value={sliders[d.k]} onChange={(v) => setSlider(d.k, v)} format={fmt(d)} hint={d.hint} />
                        ))}
                      </FieldGroup>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="code" className="mt-3">
              <Card className="gap-4 py-4">
                <CardHeader>
                  <CardTitle>Custom effects</CardTitle>
                  <CardDescription>
                    Effects are small JSON files in the wallmotion/1 format. They can’t run code, so a broken file can’t break a wall. Start from a template, or copy the AI instructions and ask an assistant to write one.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Select onValueChange={(id) => addEffect(prettyJson(TEMPLATES.find((t) => t.id === id)!.doc))}>
                      <SelectTrigger size="sm" className="w-auto">
                        <PlusIcon />
                        <SelectValue placeholder="New from template" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATES.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
                    <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                      <UploadIcon data-icon="inline-start" />
                      Import file
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard?.writeText(aiBrief());
                        toast.success("Copied. Paste it into your AI assistant with what you want the effect to do.");
                      }}
                    >
                      <CopyIcon data-icon="inline-start" />
                      Copy AI instructions
                    </Button>
                  </div>

                  {custom.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {custom.map((c) => (
                        <Button key={c.id} size="sm" variant={editing === c.id ? "secondary" : "ghost"} onClick={() => setEditing(c.id)}>
                          {c.name}
                          {c.id === effectId && <Badge className="ml-1">On walls</Badge>}
                        </Button>
                      ))}
                    </div>
                  )}

                  {editingFx && check && (
                    <div className="flex flex-col gap-2">
                      <CodeArea value={editingFx.code} onChange={(v) => updateCode(editingFx.id, v)} errorLines={check.ok ? [] : check.errors.map((e) => e.line).filter((l): l is number => l !== null)} />
                      {check.ok ? (
                        <p className="text-sm text-success">Looks good: {check.summary}</p>
                      ) : (
                        <ul className="flex flex-col gap-1 text-sm text-destructive">
                          {check.errors.slice(0, 8).map((e, i) => (
                            <li key={i}>
                              {e.line !== null && <span className="font-mono">Line {e.line}: </span>}
                              {e.message}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={!check.ok || effectId === editingFx.id} onClick={() => setEffectId(editingFx.id)}>
                          Use this effect
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const blob = new Blob([editingFx.code], { type: "application/json" });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(blob);
                            a.download = `${editingFx.name.replace(/[^\w-]+/g, "-").toLowerCase() || "effect"}.wallmotion.json`;
                            a.click();
                            URL.revokeObjectURL(a.href);
                          }}
                        >
                          <DownloadIcon data-icon="inline-start" />
                          Export
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (!confirm(`Delete "${editingFx.name}"?`)) return;
                            setCustom((cs) => cs.filter((c) => c.id !== editingFx.id));
                            if (effectId === editingFx.id) setEffectId(BUILTIN_ID);
                            setEditing(custom.find((c) => c.id !== editingFx.id)?.id ?? null);
                          }}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                  {!custom.length && <p className="text-sm text-muted-foreground">No custom effects yet. The walls play the built-in whiten and drop.</p>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-4 py-4">
            <CardHeader>
              <CardTitle>Presets</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setSliders((s) => ({ ...DEFAULT_SLIDERS, ...p.s, cols: s.cols, rows: s.rows }));
                    setPreset(p.name);
                  }}
                  className={cn("flex flex-col items-start rounded-md border px-3 py-2 text-left text-sm hover:bg-accent", preset === p.name && "border-primary bg-accent")}
                >
                  <strong>{p.name}</strong>
                  <span className="text-muted-foreground">{p.desc}</span>
                </button>
              ))}
              {preset === "Custom" && <p className="text-xs text-muted-foreground">You’ve adjusted the sliders by hand.</p>}
              <div className="mt-1 flex flex-col gap-1 rounded-md bg-muted px-3 py-2.5 text-sm">
                <span>
                  About <strong>{Math.round(60 / Math.max(0.1, sliders.swapEvery))}</strong> swaps per minute
                </span>
                <span>
                  Each photo stays at least <strong>{Math.round(sliders.hold + (sliders.whiten + sliders.slide) / Math.max(0.05, sliders.speed))} s</strong>
                </span>
                <span>
                  Up to <strong>{Math.max(1, Math.floor(sliders.maxChanging * sliders.cols * sliders.rows))}</strong> of {sliders.cols * sliders.rows} cells changing at once
                </span>
              </div>
            </CardContent>
          </Card>
          <Card className="gap-4 py-4">
            <CardHeader>
              <CardTitle>Effect on the walls</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel>Effect</FieldLabel>
                  <Select value={effectId} onValueChange={setEffectId}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BUILTIN_ID}>Whiten and drop (built-in)</SelectItem>
                      {custom.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {activeFxId &&
                  fxParams.map(([name, p]) => (
                    <SliderRow
                      key={name}
                      label={p.label ?? name}
                      min={p.min}
                      max={p.max}
                      step={p.type === "percent" ? 0.01 : (p.max - p.min) / 200}
                      value={active.params[name] ?? p.default}
                      onChange={(v) => setParams((ps) => ({ ...ps, [activeFxId]: { ...(ps[activeFxId] ?? {}), [name]: v } }))}
                      format={(v) => (p.type === "percent" ? `${Math.round(v * 100)}%` : p.type === "angle" ? `${v.toFixed(1)}°` : p.type === "duration" ? `${v.toFixed(2)} s` : v.toFixed(2))}
                    />
                  ))}
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** A plain code textarea with line numbers; lines with problems are marked. */
function CodeArea({ value, onChange, errorLines }: { value: string; onChange: (v: string) => void; errorLines: number[] }) {
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value.split("\n").length;
  const bad = new Set(errorLines);
  return (
    <div className="flex max-h-[520px] overflow-hidden rounded-md border bg-muted/40 font-mono text-xs leading-5">
      <div ref={gutter} aria-hidden className="shrink-0 overflow-hidden border-r bg-muted px-2 py-2 text-right text-muted-foreground select-none">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={cn(bad.has(i + 1) && "font-bold text-destructive")}>
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        aria-label="Effect code"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          e.preventDefault();
          const t = e.currentTarget;
          const { selectionStart: s, selectionEnd: en } = t;
          const next = value.slice(0, s) + "  " + value.slice(en);
          onChange(next);
          requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
        }}
        className="min-h-[360px] flex-1 resize-none bg-transparent px-3 py-2 outline-none"
        style={{ whiteSpace: "pre", overflowWrap: "normal" }}
      />
    </div>
  );
}

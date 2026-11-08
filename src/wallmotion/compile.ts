import type { Ctx, Rng } from "./expr";
import { resolveNumber } from "./validate";
import {
  DEFAULT_SLIDERS,
  type LayerName,
  type MotionDoc,
  type MotionSliders,
  type Pick,
  type PropName,
  type PropValues,
  type Value,
} from "./types";

/** Concrete state of one layer's animatable properties. Lengths: px, or % when xPct/yPct. */
export type LayerState = {
  opacity: number;
  x: number;
  xPct: boolean;
  y: number;
  yPct: boolean;
  scale: number;
  rotate: number;
  blur: number;
  brightness: number;
  clip: number;
  radius: number;
};

export const IDENTITY: LayerState = {
  opacity: 1,
  x: 0,
  xPct: false,
  y: 0,
  yPct: false,
  scale: 1,
  rotate: 0,
  blur: 0,
  brightness: 1,
  clip: 0,
  radius: 0,
};

export type CssFrame = Record<string, string>;

export type PlannedAnimation = {
  layer: LayerName;
  /** seconds from swap start */
  start: number;
  /** seconds; 0 for an instant set */
  dur: number;
  ease: string;
  frames: [CssFrame, CssFrame];
};

export type SwapPlan = {
  animations: PlannedAnimation[];
  /** when the "new" layer becomes visible */
  newVisibleAt: number;
  total: number;
};

export type CellVars = { row: number; col: number; rows: number; cols: number; i: number };

const EASE_CSS: Record<string, string> = {
  linear: "linear",
  easeInSine: "cubic-bezier(0.12, 0, 0.39, 0)",
  easeOutSine: "cubic-bezier(0.61, 1, 0.88, 1)",
  easeInOutSine: "cubic-bezier(0.37, 0, 0.63, 1)",
  easeInCubic: "cubic-bezier(0.32, 0, 0.67, 0)",
  easeOutCubic: "cubic-bezier(0.33, 1, 0.68, 1)",
  easeInOutCubic: "cubic-bezier(0.65, 0, 0.35, 1)",
  easeInBack: "cubic-bezier(0.36, 0, 0.66, -0.56)",
  easeOutBack: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  spring:
    "linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%, 1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, 1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, 1.003 76.9%, 1.004 83.8%, 1)",
};

export function easeToCss(e: string | undefined): string {
  if (!e) return "ease";
  return EASE_CSS[e] ?? e;
}

export function makeRng(seed?: number): Rng {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildVars(sliders: MotionSliders, params: Record<string, number>, cell: CellVars) {
  return { ...DEFAULT_SLIDERS, ...sliders, ...params, ...cell };
}

function applyProps(state: LayerState, props: PropValues | undefined, ctx: Ctx): LayerState {
  if (!props) return state;
  const next = { ...state };
  for (const [k, v] of Object.entries(props) as [PropName, Value][]) {
    const n = resolveNumber(v, ctx);
    const pct = typeof v === "string" && v.trim().endsWith("%");
    switch (k) {
      case "x":
        next.x = n;
        next.xPct = pct;
        break;
      case "y":
        next.y = n;
        next.yPct = pct;
        break;
      case "opacity":
        next.opacity = clamp(n, 0, 1);
        break;
      case "clip":
        next.clip = clamp(n, 0, 50);
        break;
      case "blur":
        next.blur = Math.max(0, n);
        break;
      case "brightness":
        next.brightness = Math.max(0, n);
        break;
      case "radius":
        next.radius = Math.max(0, n);
        break;
      default:
        next[k] = n;
    }
  }
  return next;
}

/** CSS for the properties touched by `keys` (grouping x/y → translate, blur/brightness → filter). */
export function toCss(s: LayerState, keys: Set<PropName>): CssFrame {
  const f: CssFrame = {};
  if (keys.has("opacity")) f.opacity = String(s.opacity);
  if (keys.has("x") || keys.has("y")) f.translate = `${s.x}${s.xPct ? "%" : "px"} ${s.y}${s.yPct ? "%" : "px"}`;
  if (keys.has("scale")) f.scale = String(s.scale);
  if (keys.has("rotate")) f.rotate = `${s.rotate}deg`;
  if (keys.has("blur") || keys.has("brightness")) f.filter = `blur(${s.blur}px) brightness(${s.brightness})`;
  if (keys.has("clip")) f.clipPath = `inset(${s.clip}%)`;
  if (keys.has("radius")) f.borderRadius = `${s.radius}px`;
  return f;
}

/**
 * Turn an effect into concrete keyframes for one swap in one cell.
 * Durations and waits are divided by $speed.
 */
export function planSwap(
  doc: MotionDoc,
  sliders: MotionSliders,
  params: Record<string, number>,
  cell: CellVars,
  rng: Rng = Math.random,
): SwapPlan {
  const vars = buildVars(sliders, params, cell);
  const ctx: Ctx = { vars, rng, varyFactor: 1 + (rng() * 2 - 1) * clamp(vars.vary ?? 0, 0, 0.9) };
  const speed = Math.max(0.05, vars.speed || 1);
  const state: Record<LayerName, LayerState> = {
    old: { ...IDENTITY },
    new: { ...IDENTITY },
    cover: { ...IDENTITY, opacity: 0 },
  };
  const animations: PlannedAnimation[] = [];
  let cursor = 0;
  let prevStart = 0;
  let newVisibleAt = Number.POSITIVE_INFINITY;

  for (const step of doc.timeline) {
    const start = step.with === "prev" ? prevStart : cursor;
    let dur = 0;
    if ("wait" in step) {
      dur = Math.max(0, resolveNumber(step.wait, ctx)) / speed;
    } else if ("set" in step) {
      const keys = new Set(Object.keys(step.set) as PropName[]);
      const before = state[step.layer];
      const after = applyProps(before, step.set, ctx);
      state[step.layer] = after;
      if (step.layer === "new") newVisibleAt = Math.min(newVisibleAt, start);
      animations.push({ layer: step.layer, start, dur: 0, ease: "linear", frames: [toCss(after, keys), toCss(after, keys)] });
    } else {
      dur = Math.max(0, resolveNumber(step.dur, ctx)) / speed;
      const keys = new Set([...Object.keys(step.from ?? {}), ...Object.keys(step.to ?? {})] as PropName[]);
      const from = applyProps(state[step.layer], step.from, ctx);
      const to = applyProps(from, step.to, ctx);
      state[step.layer] = to;
      if (step.layer === "new") newVisibleAt = Math.min(newVisibleAt, start);
      animations.push({ layer: step.layer, start, dur, ease: easeToCss(step.ease), frames: [toCss(from, keys), toCss(to, keys)] });
    }
    prevStart = start;
    cursor = Math.max(cursor, start + dur);
  }
  const total = Math.max(cursor, ...animations.map((a) => a.start + a.dur), 0.05);
  if (!Number.isFinite(newVisibleAt)) newVisibleAt = total;
  return { animations, newVisibleAt, total };
}

export type ResolvedScheduler = {
  every: number;
  jitter: number;
  maxChanging: number;
  hold: number;
  pick: Pick;
  stagger: string | number | null;
};

export function resolveScheduler(doc: MotionDoc, sliders: MotionSliders, params: Record<string, number>): ResolvedScheduler {
  const vars = buildVars(sliders, params, { row: 0, col: 0, rows: sliders.rows, cols: sliders.cols, i: 0 });
  const ctx: Ctx = { vars, rng: () => 0.5, varyFactor: 1 };
  const sc = doc.scheduler ?? {};
  const num = (v: Value | undefined, d: number) => (v === undefined ? d : resolveNumber(v, ctx));
  return {
    every: Math.max(0.1, num(sc.every, sliders.swapEvery)),
    jitter: clamp(num(sc.jitter, sliders.jitter), 0, 0.49),
    maxChanging: clamp(num(sc.maxChanging, sliders.maxChanging), 0.01, 1),
    hold: Math.max(0, num(sc.hold, sliders.hold)),
    pick: sc.pick ?? "oldest-half-random",
    stagger: sc.stagger ?? null,
  };
}

export function staggerFor(s: ResolvedScheduler, sliders: MotionSliders, params: Record<string, number>, cell: CellVars): number {
  let src = s.stagger;
  if (src === null) {
    if (s.pick === "wave-cols") src = "$col * 0.08";
    else if (s.pick === "wave-rows") src = "$row * 0.08";
    else if (s.pick === "spiral") return spiralRank(cell) * 0.05;
    else return 0;
  }
  const vars = buildVars(sliders, params, cell);
  return Math.max(0, resolveNumber(src, { vars, rng: Math.random, varyFactor: 1 }));
}

function spiralRank(c: CellVars) {
  const cy = (c.rows - 1) / 2;
  const cx = (c.cols - 1) / 2;
  return Math.hypot(c.row - cy, c.col - cx);
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

import { ExprError, evalExpr, referencedVars, type Ctx } from "./expr";
import { JsonSyntaxError, parseWithLines } from "./jsonpos";
import {
  CELL_VARS,
  DEFAULT_SLIDERS,
  EASES,
  FORMAT,
  LAYERS,
  LIMITS,
  PARAM_TYPES,
  PICKS,
  PROPS,
  type MotionDoc,
  type Value,
} from "./types";

export type Problem = { path: string; line: number | null; message: string };
export type CheckResult =
  | { ok: true; doc: MotionDoc; summary: string; maxSeconds: number }
  | { ok: false; errors: Problem[] };

const GLOBAL_VARS = Object.keys(DEFAULT_SLIDERS);
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const BEZIER_RE = /^cubic-bezier\(\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\)$/;
const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isEase(e: string) {
  return (EASES as readonly string[]).includes(e) || BEZIER_RE.test(e);
}

/** Validate an effect file given as text (the Code tab) or as an already parsed object. */
export function checkEffect(input: string | unknown): CheckResult {
  let value: unknown;
  let lines = new Map<string, number>();
  if (typeof input === "string") {
    try {
      const parsed = parseWithLines(input);
      value = parsed.value;
      lines = parsed.lines;
    } catch (e) {
      if (e instanceof JsonSyntaxError)
        return { ok: false, errors: [{ path: "", line: e.line, message: `JSON: ${e.message}` }] };
      throw e;
    }
  } else value = input;

  const errors: Problem[] = [];
  const err = (path: string, message: string) => {
    // walk up the path until we find a recorded line
    let p = path;
    let line = lines.get(p);
    while (line === undefined && p) {
      const up = p.replace(/(\.[^.[\]]+|\[\d+\])$/, "");
      p = up === p ? "" : up;
      line = lines.get(p);
    }
    errors.push({ path, line: line ?? null, message });
  };

  if (!isObj(value)) return { ok: false, errors: [{ path: "", line: 1, message: "the effect must be one JSON object { … }" }] };
  const doc = value as Record<string, unknown>;
  for (const k of Object.keys(doc))
    if (!["format", "name", "params", "timeline", "scheduler", "cover"].includes(k))
      err(k, `unknown key "${k}". Allowed: format, name, params, timeline, scheduler, cover`);
  if (doc.format !== FORMAT) err("format", `expected "${FORMAT}"`);
  if (typeof doc.name !== "string" || !doc.name.trim()) err("name", "give the effect a name");
  else if (doc.name.length > 60) err("name", "keep the name under 60 characters");
  if (doc.cover !== undefined && (typeof doc.cover !== "string" || !COLOR_RE.test(doc.cover)))
    err("cover", 'cover must be a hex color like "#ffffff"');

  // params
  const paramNames: string[] = [];
  const paramDefaults: Record<string, number> = {};
  const paramMax: Record<string, number> = {};
  if (doc.params !== undefined) {
    if (!isObj(doc.params)) err("params", "params must be an object of sliders");
    else {
      const entries = Object.entries(doc.params as Record<string, unknown>);
      if (entries.length > LIMITS.params) err("params", `at most ${LIMITS.params} sliders`);
      for (const [name, p] of entries) {
        const path = `params.${name}`;
        if (!NAME_RE.test(name)) {
          err(path, "slider names use letters, digits and _ and start with a letter");
          continue;
        }
        if (GLOBAL_VARS.includes(name) || (CELL_VARS as readonly string[]).includes(name)) {
          err(path, `"${name}" is a built-in variable; pick another name`);
          continue;
        }
        if (!isObj(p)) {
          err(path, 'a slider is { "type", "default", "min", "max" }');
          continue;
        }
        const pp = p as Record<string, unknown>;
        for (const k of Object.keys(pp))
          if (!["type", "default", "min", "max", "label"].includes(k)) err(`${path}.${k}`, `unknown slider key "${k}"`);
        if (!(PARAM_TYPES as readonly string[]).includes(pp.type as string))
          err(`${path}.type`, `type must be one of ${PARAM_TYPES.join(", ")}`);
        const nums = ["default", "min", "max"] as const;
        let okNums = true;
        for (const k of nums)
          if (typeof pp[k] !== "number" || !Number.isFinite(pp[k])) {
            err(`${path}.${k}`, `${k} must be a number`);
            okNums = false;
          }
        if (okNums) {
          const [d, mn, mx] = [pp.default as number, pp.min as number, pp.max as number];
          if (mn > mx) err(`${path}.min`, "min is larger than max");
          else if (d < mn || d > mx) err(`${path}.default`, "default must be between min and max");
          paramDefaults[name] = d;
          paramMax[name] = mx;
        }
        if (pp.label !== undefined && typeof pp.label !== "string") err(`${path}.label`, "label must be text");
        paramNames.push(name);
      }
    }
  }
  const known = new Set([...GLOBAL_VARS, ...CELL_VARS, ...paramNames]);

  const worstVars: Record<string, number> = { ...DEFAULT_SLIDERS, ...paramMax, row: 0, col: 0, rows: 6, cols: 6, i: 0 };
  // worst case for durations: high values, slow speed
  const worst: Ctx = { vars: { ...worstVars, speed: 1 }, rng: () => 0.999, varyFactor: 1 + DEFAULT_SLIDERS.vary };

  const checkValue = (path: string, v: unknown, allowPercent: boolean): boolean => {
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        err(path, "not a finite number");
        return false;
      }
      return true;
    }
    if (typeof v === "string") {
      let src = v.trim();
      if (src.endsWith("%")) {
        if (!allowPercent) {
          err(path, "percent values only work for x and y");
          return false;
        }
        src = src.slice(0, -1);
      }
      try {
        for (const name of referencedVars(src))
          if (!known.has(name)) {
            err(path, `unknown variable "$${name}". Add it to params or use a built-in one`);
            return false;
          }
      } catch (e) {
        err(path, e instanceof ExprError ? `expression: ${e.message}` : "bad expression");
        return false;
      }
      return true;
    }
    if (isObj(v)) {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o);
      if (keys.length !== 1 || keys[0] !== "random" || !Array.isArray(o.random) || o.random.length !== 2) {
        err(path, 'a random value looks like { "random": [a, b] }');
        return false;
      }
      return checkValue(`${path}.random[0]`, o.random[0], allowPercent) && checkValue(`${path}.random[1]`, o.random[1], allowPercent);
    }
    err(path, "values are numbers, expressions in quotes, or { \"random\": [a, b] }");
    return false;
  };

  const seconds = (v: Value): number => {
    try {
      return resolveNumber(v, worst);
    } catch {
      return 0;
    }
  };

  // timeline
  let maxSeconds = 0;
  if (!Array.isArray(doc.timeline) || doc.timeline.length === 0) err("timeline", "timeline must be a list with at least one step");
  else {
    if (doc.timeline.length > LIMITS.steps) err("timeline", `at most ${LIMITS.steps} steps`);
    let cursor = 0;
    let prevStart = 0;
    doc.timeline.forEach((s, i) => {
      const path = `timeline[${i}]`;
      if (!isObj(s)) {
        err(path, "each step is an object");
        return;
      }
      const st = s as Record<string, unknown>;
      if (st.with !== undefined) {
        if (st.with !== "prev") err(`${path}.with`, 'the only option is "with": "prev"');
        else if (i === 0) err(`${path}.with`, 'the first step cannot run "with" a previous one');
      }
      const start = st.with === "prev" ? prevStart : cursor;
      let dur = 0;
      if ("wait" in st) {
        for (const k of Object.keys(st)) if (!["wait", "with"].includes(k)) err(`${path}.${k}`, `a wait step only has "wait" (and "with")`);
        if (checkValue(`${path}.wait`, st.wait, false)) {
          dur = seconds(st.wait as Value);
          if (dur > LIMITS.stepSeconds) err(`${path}.wait`, `at most ${LIMITS.stepSeconds} s`);
        }
      } else {
        if (!(LAYERS as readonly string[]).includes(st.layer as string))
          err(`${path}.layer`, st.layer === undefined ? 'add "layer": "old", "new" or "cover"' : `unknown layer "${String(st.layer)}". Use old, new or cover`);
        const isSet = "set" in st;
        const allowed = isSet ? ["layer", "set", "with"] : ["layer", "dur", "from", "to", "ease", "with"];
        for (const k of Object.keys(st)) if (!allowed.includes(k)) err(`${path}.${k}`, `unknown key "${k}" in a ${isSet ? "set" : "tween"} step`);
        const parts = isSet ? ["set"] : ["from", "to"];
        for (const part of parts) {
          const props = st[part];
          if (props === undefined) continue;
          if (!isObj(props)) {
            err(`${path}.${part}`, `${part} must be an object of properties`);
            continue;
          }
          for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
            if (!(PROPS as readonly string[]).includes(k)) {
              err(`${path}.${part}.${k}`, `unknown property "${k}". Allowed: ${PROPS.join(", ")}`);
              continue;
            }
            checkValue(`${path}.${part}.${k}`, v, k === "x" || k === "y");
          }
        }
        if (!isSet) {
          if (st.dur === undefined) err(`${path}.dur`, 'add "dur" in seconds');
          else if (checkValue(`${path}.dur`, st.dur, false)) {
            dur = seconds(st.dur as Value);
            if (dur > LIMITS.stepSeconds) err(`${path}.dur`, `at most ${LIMITS.stepSeconds} s per step`);
            if (dur < 0) err(`${path}.dur`, "duration cannot be negative");
          }
          if (st.from === undefined && st.to === undefined) err(path, 'a tween needs "to" (and optionally "from")');
          if (st.ease !== undefined && (typeof st.ease !== "string" || !isEase(st.ease)))
            err(`${path}.ease`, `unknown ease. Use ${EASES.join(", ")} or "cubic-bezier(a,b,c,d)"`);
        }
      }
      prevStart = start;
      cursor = Math.max(cursor, start + Math.max(0, dur));
      maxSeconds = Math.max(maxSeconds, cursor);
    });
    if (maxSeconds > LIMITS.totalSeconds) err("timeline", `a whole swap can last at most ${LIMITS.totalSeconds} s (this one can reach ${maxSeconds.toFixed(1)} s)`);
  }

  // scheduler
  if (doc.scheduler !== undefined) {
    if (!isObj(doc.scheduler)) err("scheduler", "scheduler must be an object");
    else {
      const sc = doc.scheduler as Record<string, unknown>;
      for (const k of Object.keys(sc))
        if (!["every", "jitter", "maxChanging", "hold", "pick", "stagger"].includes(k)) err(`scheduler.${k}`, `unknown scheduler key "${k}"`);
      for (const k of ["every", "jitter", "maxChanging", "hold"]) if (sc[k] !== undefined) checkValue(`scheduler.${k}`, sc[k], false);
      if (sc.pick !== undefined && !(PICKS as readonly string[]).includes(sc.pick as string))
        err("scheduler.pick", `pick must be one of ${PICKS.join(", ")}`);
      if (sc.stagger !== undefined) {
        if (typeof sc.stagger !== "string" && typeof sc.stagger !== "number") err("scheduler.stagger", 'stagger is an expression like "$col * 0.08"');
        else checkValue("scheduler.stagger", sc.stagger, false);
      }
      if (sc.jitter !== undefined) {
        const j = seconds(sc.jitter as Value);
        if (j < 0 || j > 0.49) err("scheduler.jitter", "jitter must be between 0 and 0.49");
      }
      if (sc.every !== undefined && seconds(sc.every as Value) < 0.1) err("scheduler.every", "swaps can start at most 10 times a second");
    }
  }

  if (errors.length) {
    errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    return { ok: false, errors };
  }
  const d = doc as unknown as MotionDoc;
  const steps = d.timeline.length;
  const sliders = Object.keys(d.params ?? {}).length;
  return {
    ok: true,
    doc: d,
    maxSeconds,
    summary: `${steps} step${steps === 1 ? "" : "s"} · ${sliders} slider${sliders === 1 ? "" : "s"} · up to ${maxSeconds.toFixed(1)} s · pick: ${d.scheduler?.pick ?? "oldest-half-random"}`,
  };
}

export function paramDefaults(doc: MotionDoc): Record<string, number> {
  return Object.fromEntries(Object.entries(doc.params ?? {}).map(([k, p]) => [k, p.default]));
}

/** Resolve a Value to a number (percent sign stripped; caller decides what % means). */
export function resolveNumber(v: Value, ctx: Ctx): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.trim();
    return evalExpr(s.endsWith("%") ? s.slice(0, -1) : s, ctx);
  }
  const a = resolveNumber(v.random[0], ctx);
  const b = resolveNumber(v.random[1], ctx);
  return a + ctx.rng() * (b - a);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

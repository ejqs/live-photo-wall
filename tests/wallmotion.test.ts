import { describe, expect, it } from "vitest";
import {
  DEFAULT_SLIDERS,
  TEMPLATES,
  WHITEN_AND_DROP,
  checkEffect,
  makeRng,
  planSwap,
  resolveScheduler,
  aiBrief,
} from "@/wallmotion";

const cell = { row: 1, col: 2, rows: 5, cols: 6, i: 8 };

describe("checkEffect", () => {
  it("accepts the built-in effect and every template", () => {
    expect(checkEffect(JSON.stringify(WHITEN_AND_DROP, null, 2)).ok).toBe(true);
    for (const t of TEMPLATES) expect(checkEffect(JSON.stringify(t.doc, null, 2))).toMatchObject({ ok: true });
  });

  it("accepts the example embedded in the AI brief", () => {
    const line = aiBrief().split("\n").find((l) => l.startsWith('{"format"'))!;
    expect(checkEffect(line).ok).toBe(true);
  });

  it("points at the line of an unknown property", () => {
    const text = `{
  "format": "wallmotion/1",
  "name": "x",
  "timeline": [
    { "layer": "new", "dur": 1,
      "to": { "wobble": 2 } }
  ]
}`;
    const r = checkEffect(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].path).toBe("timeline[0].to.wobble");
      expect(r.errors[0].line).toBe(6);
      expect(r.errors[0].message).toMatch(/unknown property/);
    }
  });

  it("reports JSON syntax errors with a line", () => {
    const r = checkEffect('{\n  "format": "wallmotion/1",\n  "name": "x",\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].line).toBe(4);
  });

  it("rejects unknown variables, layers and long swaps", () => {
    const base = { format: "wallmotion/1", name: "x" };
    const bad = (timeline: unknown) => checkEffect({ ...base, timeline });
    expect(bad([{ layer: "new", dur: "$nope", to: { opacity: 1 } }]).ok).toBe(false);
    expect(bad([{ layer: "top", dur: 1, to: { opacity: 1 } }]).ok).toBe(false);
    expect(bad([{ layer: "new", dur: 11, to: { opacity: 1 } }]).ok).toBe(false);
    expect(bad([{ wait: 9 }, { wait: 9 }, { wait: 9 }]).ok).toBe(false);
    expect(bad([{ layer: "new", dur: "eval(1)", to: { opacity: 1 } }]).ok).toBe(false);
    expect(checkEffect({ ...base, timeline: [{ layer: "new", dur: 1, to: { opacity: 1 } }], extra: 1 }).ok).toBe(false);
  });
});

describe("planSwap", () => {
  it("plans the built-in effect with the slider timings", () => {
    const plan = planSwap(WHITEN_AND_DROP, DEFAULT_SLIDERS, {}, cell, makeRng(1));
    const cover = plan.animations[0];
    expect(cover.layer).toBe("cover");
    expect(cover.frames[0].opacity).toBe("0");
    expect(cover.frames[1].opacity).toBe("1");
    // new photo appears after whiten + empty wait
    expect(plan.newVisibleAt).toBeGreaterThan(cover.dur);
    const drop = plan.animations.find((a) => a.layer === "new" && a.frames[0].translate)!;
    expect(drop.frames[0].translate).toMatch(/^0px -\d+(\.\d+)?% *$|^0px -[\d.]+%$/);
    expect(drop.frames[1].translate).toBe("0px 0px");
    expect(plan.total).toBeGreaterThan(1.5);
    expect(plan.total).toBeLessThan(5);
  });

  it("divides durations by speed", () => {
    const slow = planSwap(WHITEN_AND_DROP, { ...DEFAULT_SLIDERS, vary: 0 }, {}, cell, makeRng(2));
    const fast = planSwap(WHITEN_AND_DROP, { ...DEFAULT_SLIDERS, vary: 0, speed: 2 }, {}, cell, makeRng(2));
    expect(fast.total).toBeCloseTo(slow.total / 2, 5);
  });

  it("resolves scheduler defaults from the sliders", () => {
    const s = resolveScheduler(WHITEN_AND_DROP, { ...DEFAULT_SLIDERS, swapEvery: 2 }, {});
    expect(s.every).toBe(2);
    expect(s.pick).toBe("oldest-half-random");
  });
});

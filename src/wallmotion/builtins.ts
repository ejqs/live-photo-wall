import { FORMAT, type MotionDoc, type MotionSliders } from "./types";

/**
 * The built-in effect: the photo fades to white, the slot waits, then the next photo
 * glides down with a slight tilt and settles. Driven by the Motion sliders ($whiten, $slide…).
 */
export const WHITEN_AND_DROP: MotionDoc = {
  format: FORMAT,
  name: "Whiten and drop",
  timeline: [
    { layer: "cover", dur: "vary($whiten)", ease: "cubic-bezier(.65,0,.55,1)", from: { opacity: 0 }, to: { opacity: 1 } },
    { layer: "old", set: { opacity: 0 } },
    { wait: "max(0.06, rand($emptyMin, $emptyMax))" },
    { layer: "new", dur: "vary($slide)", ease: "cubic-bezier(.15,.65,.25,1)", from: { y: "-vary($slideFrom) * 100%" }, to: { y: 0 } },
    { layer: "new", with: "prev", dur: "vary($slide) * 1.1", ease: "cubic-bezier(.15,.65,.25,1)", from: { rotate: "pick(-1, 1) * $tilt * rand(0.5, 1)" }, to: { rotate: 0 } },
    { layer: "new", with: "prev", dur: "vary($slide) * 0.85", ease: "cubic-bezier(.15,.65,.25,1)", from: { scale: "$settle" }, to: { scale: 1 } },
    { layer: "new", with: "prev", dur: "vary($slide) * $fadeIn", ease: "cubic-bezier(.2,.6,.35,1)", from: { opacity: 0 }, to: { opacity: 1 } },
  ],
  scheduler: { every: "$swapEvery", jitter: "$jitter", maxChanging: "$maxChanging", hold: "$hold", pick: "oldest-half-random" },
};

export const BUILTIN_ID = "builtin";

/** Starting points offered by "+ New custom effect". */
export const TEMPLATES: { id: string; label: string; doc: MotionDoc }[] = [
  {
    id: "soft-zoom",
    label: "Soft zoom",
    doc: {
      format: FORMAT,
      name: "Soft zoom",
      params: { speedIn: { type: "duration", default: 0.9, min: 0.2, max: 3, label: "Zoom in" } },
      timeline: [
        { layer: "old", dur: 0.5, to: { opacity: 0, blur: 6 } },
        { layer: "new", dur: "$speedIn", ease: "easeOutCubic", from: { scale: 1.15, opacity: 0 }, to: { scale: 1, opacity: 1 } },
      ],
      scheduler: { every: "$swapEvery", pick: "random" },
    },
  },
  {
    id: "column-wave",
    label: "Column wave",
    doc: {
      format: FORMAT,
      name: "Column wave",
      params: {
        glide: { type: "duration", default: 1.2, min: 0.2, max: 4, label: "Glide" },
        gap: { type: "duration", default: 0.08, min: 0, max: 0.5, label: "Gap between columns" },
      },
      timeline: [
        { layer: "old", dur: 0.5, ease: "easeInSine", to: { opacity: 0, blur: 6 } },
        { layer: "new", dur: "$glide", ease: "easeOutCubic", from: { x: "-100%", opacity: 0 }, to: { x: 0, opacity: 1 } },
      ],
      scheduler: { every: 30, pick: "wave-cols", stagger: "$col * $gap", maxChanging: 1 },
    },
  },
  {
    id: "crossfade",
    label: "Crossfade",
    doc: {
      format: FORMAT,
      name: "Crossfade",
      params: { fade: { type: "duration", default: 1.2, min: 0.2, max: 4, label: "Fade" } },
      timeline: [
        { layer: "new", dur: "$fade", ease: "easeInOutSine", from: { opacity: 0 }, to: { opacity: 1 } },
      ],
      scheduler: { every: "$swapEvery", pick: "oldest-half-random" },
    },
  },
  {
    id: "blank",
    label: "Blank",
    doc: {
      format: FORMAT,
      name: "Untitled effect",
      params: {},
      timeline: [
        { layer: "old", dur: 0.6, to: { opacity: 0 } },
        { layer: "new", dur: 0.8, from: { scale: 1.2, opacity: 0 }, to: { scale: 1, opacity: 1 } },
      ],
      scheduler: { every: "$swapEvery", pick: "random" },
    },
  },
];

export const PRESETS: { name: string; desc: string; s: Partial<MotionSliders> }[] = [
  { name: "Calm", desc: "Slow and gentle, for long dinners.", s: { swapEvery: 2.5, hold: 10, maxChanging: 0.2, speed: 0.8 } },
  { name: "Default", desc: "The original effect's timing.", s: {} },
  { name: "Lively", desc: "More movement, for short sessions.", s: { swapEvery: 0.5, hold: 2, maxChanging: 0.5, speed: 1.3 } },
];

export function prettyJson(doc: unknown) {
  return JSON.stringify(doc, null, 2);
}

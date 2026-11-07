export const FORMAT = "wallmotion/1" as const;

export const LAYERS = ["old", "new", "cover"] as const;
export type LayerName = (typeof LAYERS)[number];

export const PROPS = ["opacity", "x", "y", "scale", "rotate", "blur", "brightness", "clip", "radius"] as const;
export type PropName = (typeof PROPS)[number];

export const PICKS = [
  "random",
  "oldest",
  "oldest-half-random",
  "wave-rows",
  "wave-cols",
  "spiral",
  "all-at-once",
] as const;
export type Pick = (typeof PICKS)[number];

export const PARAM_TYPES = ["duration", "number", "angle", "percent"] as const;

export const EASES = [
  "linear",
  "easeInSine",
  "easeOutSine",
  "easeInOutSine",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInBack",
  "easeOutBack",
  "spring",
] as const;

export type Value = number | string | { random: [Value, Value] };
export type PropValues = Partial<Record<PropName, Value>>;

export type TweenStep = {
  layer: LayerName;
  dur: Value;
  from?: PropValues;
  to?: PropValues;
  ease?: string;
  with?: "prev";
};
export type SetStep = { layer: LayerName; set: PropValues; with?: "prev" };
export type WaitStep = { wait: Value; with?: "prev" };
export type Step = TweenStep | SetStep | WaitStep;

export type Param = {
  type: (typeof PARAM_TYPES)[number];
  default: number;
  min: number;
  max: number;
  label?: string;
};

export type Scheduler = {
  every?: Value;
  jitter?: Value;
  maxChanging?: Value;
  hold?: Value;
  pick?: Pick;
  stagger?: string;
};

export type MotionDoc = {
  format: typeof FORMAT;
  name: string;
  params?: Record<string, Param>;
  timeline: Step[];
  scheduler?: Scheduler;
  /** Color of the cover layer (default white) */
  cover?: string;
};

export const LIMITS = { steps: 24, stepSeconds: 10, totalSeconds: 20, params: 12 } as const;

/** The motion sliders every effect can read as $name. */
export type MotionSliders = {
  swapEvery: number;
  jitter: number;
  maxChanging: number;
  hold: number;
  speed: number;
  whiten: number;
  emptyMin: number;
  emptyMax: number;
  slide: number;
  slideFrom: number;
  fadeIn: number;
  tilt: number;
  settle: number;
  vary: number;
  cols: number;
  rows: number;
};

export const DEFAULT_SLIDERS: MotionSliders = {
  swapEvery: 1,
  jitter: 0.45,
  maxChanging: 0.34,
  hold: 4,
  speed: 1,
  whiten: 0.76,
  emptyMin: 0.1,
  emptyMax: 0.5,
  slide: 1.52,
  slideFrom: 0.6,
  fadeIn: 0.4,
  tilt: 1.5,
  settle: 1.03,
  vary: 0.15,
  cols: 6,
  rows: 5,
};

/** Cell variables available in expressions. */
export const CELL_VARS = ["row", "col", "rows", "cols", "i"] as const;

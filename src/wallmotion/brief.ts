import { WHITEN_AND_DROP } from "./builtins";
import { EASES, LIMITS, PICKS, PROPS } from "./types";

/** Instructions an admin can paste into any AI chat so it writes valid effect files. */
export function aiBrief(): string {
  return [
    "You are helping me write a custom swap animation for a photo wall app.",
    "The wall is a grid of photo cells. Every few seconds one cell swaps its photo for a new one, and an effect file describes what happens inside that one cell during the swap.",
    "",
    'Reply with ONE JSON object in the "wallmotion/1" format and nothing else. Rules:',
    '- Top-level keys: format ("wallmotion/1"), name, params, timeline, scheduler, and optionally cover (a hex color for the cover layer, white by default).',
    '- params: named sliders. Each is { "type": "duration" | "number" | "angle" | "percent", "default", "min", "max", "label" }. Use them in values as "$name".',
    '- Layers (fixed, bottom to top): "old" = photo leaving, "cover" = solid color layer, "new" = photo arriving. The new photo stays hidden until the first step that touches the "new" layer starts.',
    '- timeline: steps run in order. A step is { "layer", "dur" (seconds), "from", "to", "ease" } or { "layer", "set" } or { "wait": seconds }. Add "with": "prev" to start a step at the same time as the previous one.',
    `- Animatable properties ONLY: ${PROPS.join(", ")}. x and y are px or a percent of the cell like "-60%"; rotate is degrees; blur is px; brightness 1 is normal; clip is an inset percent (for wipes); radius is px.`,
    '- Values: numbers, an expression in quotes, or { "random": [a, b] }. Expressions support + - * / and parentheses, $param, the wall sliders ($swapEvery $jitter $maxChanging $hold $speed $whiten $slide $slideFrom $tilt $settle $vary $fadeIn $emptyMin $emptyMax), cell variables ($row $col $rows $cols $i), and the functions min(), max(), abs(), round(), rand(a, b), pick(a, b, …) and vary(x) (x varied by the "Vary each swap" slider).',
    `- Eases: ${EASES.join(", ")}, or "cubic-bezier(a,b,c,d)".`,
    `- scheduler: { "every": seconds or "$swapEvery", "jitter": 0-0.49, "maxChanging": 0-1, "hold": seconds, "pick": ${PICKS.map((p) => `"${p}"`).join(" | ")}, "stagger": optional expression like "$col * 0.08" }.`,
    `- Limits: at most ${LIMITS.steps} steps, each dur at most ${LIMITS.stepSeconds} s, a whole swap at most ${LIMITS.totalSeconds} s. No JavaScript, no other keys. The Motion speed slider divides every duration.`,
    "- Keep it tasteful for a large LED wall: avoid flashing faster than 3 times per second.",
    "",
    "Example (the built-in effect):",
    JSON.stringify(WHITEN_AND_DROP),
    "",
    "Ask me what feel I want (calm, playful, dramatic) if I have not said. When I report an error message from the editor, fix only that part and send the whole JSON again.",
  ].join("\n");
}

import {
  makeRng,
  planSwap,
  resolveScheduler,
  staggerFor,
  type MotionDoc,
  type MotionSliders,
  type ResolvedScheduler,
  type SwapPlan,
} from "@/wallmotion";
import type { Rng } from "@/wallmotion/expr";
import { imgUrl, type WallPhoto } from "./types";

type Role = "a" | "b";

type Swap = {
  start: number;
  end: number;
  photoId: string;
  anims: Animation[];
  plan: SwapPlan;
  firstShow: boolean;
};

type Cell = {
  index: number;
  row: number;
  col: number;
  el: HTMLDivElement;
  imgs: Record<Role, HTMLImageElement>;
  cover: HTMLDivElement;
  oldRole: Role;
  photoId: string | null;
  lastChanged: number;
  busyUntil: number;
  swap: Swap | null;
  /** a fast-lane swap waiting to start */
  pending: { at: number; photoId: string; plan: SwapPlan; hold: number } | null;
};

export type MotionConfig = { doc: MotionDoc; sliders: MotionSliders; params: Record<string, number> };

export type EngineOptions = {
  /** "live" lets the browser run animations; "render" drives them from tick() (frame-exact video export) */
  mode: "live" | "render";
  seed?: number;
  onShown?: (photoId: string) => void;
  onSwap?: () => void;
};

export type Reservation = { row: number; col: number; rows: number; cols: number; showAt: number; hold: number };

/**
 * The photo wall player: a grid of cells, each with two photo layers and a cover layer.
 * A scheduler picks cells to swap; each swap plays a wallmotion effect with the Web
 * Animations API. Pure DOM, no React, so the same code drives the wall, the live preview
 * and the server-side video render.
 */
export class WallEngine {
  private root: HTMLElement;
  private cells: Cell[] = [];
  private cols = 6;
  private rows = 5;
  private motion: MotionConfig;
  private sched: ResolvedScheduler;
  private rng: Rng;
  private photos = new Map<string, WallPhoto>();
  private ready = new Set<string>();
  private order: string[] = [];
  private nextId: string | null = null;
  private priority: { id: string; hold: number }[] = [];
  private nextAt = 0;
  private lastGroupAt = -Infinity;
  private known = new Set<string>();
  private orderMode: "filename" | "random" | "guests-first" = "filename";
  private gap = 0;
  private radius = 0;
  private coverColor = "#ffffff";
  swaps = 0;
  warning: string | null = null;

  constructor(
    root: HTMLElement,
    motion: MotionConfig,
    private opts: EngineOptions,
  ) {
    this.root = root;
    this.motion = motion;
    this.rng = makeRng(opts.seed);
    this.sched = resolveScheduler(motion.doc, motion.sliders, motion.params);
    this.coverColor = motion.doc.cover ?? "#ffffff";
  }

  // ---------- configuration ----------

  setMotion(m: MotionConfig) {
    this.motion = m;
    this.sched = resolveScheduler(m.doc, m.sliders, m.params);
    this.coverColor = m.doc.cover ?? "#ffffff";
    for (const c of this.cells) c.cover.style.background = this.coverColor;
  }

  setLook(gapPctOfHeight: number, radiusPctOfCell: number) {
    this.gap = gapPctOfHeight;
    this.radius = radiusPctOfCell;
    this.applyLayout();
  }

  setGrid(cols: number, rows: number, now: number) {
    cols = Math.max(1, Math.min(24, Math.round(cols)));
    rows = Math.max(1, Math.min(16, Math.round(rows)));
    if (cols === this.cols && rows === this.rows && this.cells.length) return;
    this.cols = cols;
    this.rows = rows;
    this.build(now);
  }

  /** Update the photo list. ids in `ready` are fully downloaded and decoded. */
  setPhotos(list: WallPhoto[], order: "filename" | "random" | "guests-first", now: number) {
    const first = this.known.size === 0;
    this.photos = new Map(list.map((p) => [p.id, p]));
    this.orderMode = order;
    for (const p of list) {
      if (!first && !this.known.has(p.id) && p.source === "guest" && !this.priority.some((x) => x.id === p.id))
        this.priority.push({ id: p.id, hold: 0 });
      this.known.add(p.id);
    }
    this.priority = this.priority.filter((x) => this.photos.has(x.id));
    this.order = this.buildOrder(list);
    // photos removed from the rotation leave the wall at the next opportunity
    for (const c of this.cells) {
      if (c.photoId && !this.photos.has(c.photoId)) c.busyUntil = Math.min(c.busyUntil, now);
      if (c.pending && !this.photos.has(c.pending.photoId)) {
        c.pending = null;
        c.busyUntil = now;
      }
    }
    if (!this.cells.length) this.build(now);
    else this.fillEmpty(now);
  }

  markReady(id: string, now: number) {
    this.ready.add(id);
    this.fillEmpty(now);
  }

  isReady(id: string) {
    return this.ready.has(id);
  }

  // ---------- fast lane ----------

  /**
   * Reserve a cell to show `photoId` in about `lead` seconds. Returns where and when the
   * photo will become visible, or null when no cell is free.
   */
  reserve(photoId: string, lead: number, hold: number, now: number): Reservation | null {
    if (!this.ready.has(photoId)) return null;
    if (this.cells.some((c) => c.pending?.photoId === photoId)) return null;
    const plan = (cell: Cell) => planSwap(this.motion.doc, this.motion.sliders, this.motion.params, this.cellVars(cell), this.rng);
    const candidates = this.cells
      .filter((c) => !c.pending && (c.swap ? c.swap.end : 0) < now + lead && c.photoId !== photoId)
      .sort((a, b) => a.lastChanged - b.lastChanged);
    if (!candidates.length) return null;
    const pool = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 2)));
    const cell = pool[Math.floor(this.rng() * pool.length)];
    const p = plan(cell);
    const start = Math.max(now + 0.5, now + lead - p.newVisibleAt);
    cell.pending = { at: start, photoId, plan: p, hold };
    cell.busyUntil = Number.POSITIVE_INFINITY;
    this.priority = this.priority.filter((x) => x.id !== photoId);
    return { row: cell.row, col: cell.col, rows: this.rows, cols: this.cols, showAt: start + p.newVisibleAt, hold };
  }

  // ---------- stats ----------

  shownIds(): string[] {
    return this.cells.map((c) => c.swap?.photoId ?? c.photoId).filter((x): x is string => !!x);
  }

  upNext(n: number): string[] {
    const shown = new Set(this.shownIds());
    const out: string[] = [];
    for (const p of this.priority) if (!shown.has(p.id) && out.length < n) out.push(p.id);
    if (!this.order.length) return out;
    const i = Math.max(0, this.nextId ? this.order.indexOf(this.nextId) : 0);
    for (let k = 0; k < this.order.length && out.length < n; k++) {
      const id = this.order[(i + k) % this.order.length];
      if (!shown.has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  }

  grid() {
    return { cols: this.cols, rows: this.rows };
  }

  /** What each cell shows, in reading order (the photo it is changing to, mid-swap). */
  cellIds(): (string | null)[] {
    return this.cells.map((c) => c.swap?.photoId ?? c.photoId);
  }

  /** Cells changing right now, the most allowed at once, priority photos waiting, seconds between swaps. */
  activity() {
    const changing = this.cells.filter((c) => c.swap || c.pending).length;
    const limit = Math.max(1, Math.floor(this.sched.maxChanging * this.cells.length));
    return { changing, limit, cells: this.cells.length, priority: this.priority.length, every: this.sched.every, maxChanging: this.sched.maxChanging };
  }

  // ---------- main loop ----------

  tick(now: number) {
    // finish swaps
    for (const c of this.cells) {
      if (c.swap && now >= c.swap.end) this.finish(c);
      if (c.pending && now >= c.pending.at) {
        const p = c.pending;
        c.pending = null;
        this.start(c, p.photoId, now, p.plan, Math.max(p.hold, this.sched.hold));
      }
    }
    if (this.opts.mode === "render") {
      for (const c of this.cells) {
        if (!c.swap) continue;
        const t = (now - c.swap.start) * 1000;
        for (const a of c.swap.anims) a.currentTime = t;
      }
    }
    if (!this.cells.length || this.ready.size === 0) return;

    const group = ["wave-rows", "wave-cols", "spiral", "all-at-once"].includes(this.sched.pick);
    if (group) {
      if (now - this.lastGroupAt < this.sched.every) return;
      if (this.cells.some((c) => c.swap || c.pending)) return;
      this.lastGroupAt = now;
      for (const c of this.cells) {
        const id = this.take(c);
        if (!id) continue;
        const delay = staggerFor(this.sched, this.motion.sliders, this.motion.params, this.cellVars(c));
        const plan = planSwap(this.motion.doc, this.motion.sliders, this.motion.params, this.cellVars(c), this.rng);
        c.pending = { at: now + delay, photoId: id, plan, hold: 0 };
        c.busyUntil = Number.POSITIVE_INFINITY;
      }
      return;
    }

    if (now < this.nextAt) return;
    let changing = 0;
    const free: Cell[] = [];
    for (const c of this.cells) {
      if (c.swap || c.pending) changing++;
      else if (c.busyUntil <= now) free.push(c);
    }
    const limit = Math.max(1, Math.floor(this.sched.maxChanging * this.cells.length));
    if (changing >= limit || !free.length) return;
    const cell = this.pick(free);
    const id = this.take(cell);
    if (id) {
      const prio = this.lastTakenHold;
      this.start(cell, id, now, undefined, Math.max(this.sched.hold, prio));
    }
    const j = this.sched.jitter;
    this.nextAt = now + this.sched.every * (1 + (this.rng() * 2 - 1) * j);
  }

  destroy() {
    for (const c of this.cells) c.swap?.anims.forEach((a) => a.cancel());
    this.root.replaceChildren();
    this.cells = [];
  }

  // ---------- internals ----------

  private lastTakenHold = 0;

  private pick(free: Cell[]): Cell {
    const p = this.sched.pick;
    if (p === "random") return free[Math.floor(this.rng() * free.length)];
    const sorted = [...free].sort((a, b) => a.lastChanged - b.lastChanged);
    if (p === "oldest") return sorted[0];
    const pool = Math.max(1, Math.ceil(sorted.length / 2));
    return sorted[Math.floor(this.rng() * pool)];
  }

  /** Next photo for a cell: fast-lane first, then the rotation, skipping what is on screen. */
  private take(cell: Cell, allowRepeat = true): string | null {
    this.lastTakenHold = 0;
    const shown = new Set(this.shownIds());
    for (const c of this.cells) if (c.pending) shown.add(c.pending.photoId);
    const pi = this.priority.findIndex((x) => this.ready.has(x.id) && !shown.has(x.id));
    if (pi >= 0) {
      const [p] = this.priority.splice(pi, 1);
      this.lastTakenHold = p.hold;
      return p.id;
    }
    const n = this.order.length;
    if (!n) return null;
    let i = this.nextId ? this.order.indexOf(this.nextId) : 0;
    if (i < 0) i = 0;
    let fallback: string | null = null;
    for (let k = 0; k < n; k++) {
      const id = this.order[(i + k) % n];
      if (!this.ready.has(id)) continue;
      if (shown.has(id) || id === cell.photoId) {
        fallback ??= id === cell.photoId ? null : id;
        continue;
      }
      this.nextId = this.order[(i + k + 1) % n];
      if ((i + k + 1) % n === 0 && this.orderMode === "random") this.reshuffle();
      return id;
    }
    // fewer ready photos than cells: allow repeats, but never the same photo in place
    if (!allowRepeat) return null;
    for (let k = 0; k < n; k++) {
      const id = this.order[(i + k) % n];
      if (this.ready.has(id) && id !== cell.photoId) {
        this.nextId = this.order[(i + k + 1) % n];
        return id;
      }
    }
    return fallback;
  }

  private reshuffle() {
    const next = [...this.order];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    this.order = next;
    this.nextId = next[0] ?? null;
  }

  private buildOrder(list: WallPhoto[]): string[] {
    const roster = list.filter((p) => p.source === "roster");
    const guests = list.filter((p) => p.source === "guest").sort((a, b) => a.at - b.at);
    let ids: string[];
    if (this.orderMode === "guests-first") ids = [...[...guests].reverse(), ...roster].map((p) => p.id);
    else if (this.orderMode === "random") {
      ids = list.map((p) => p.id);
      const prev = new Map(this.order.map((id, i) => [id, i]));
      // keep the existing shuffle stable; new photos go to random positions
      ids.sort((a, b) => (prev.get(a) ?? this.rng() * this.order.length) - (prev.get(b) ?? this.rng() * this.order.length));
    } else ids = [...roster, ...guests].map((p) => p.id);
    if (this.nextId && !ids.includes(this.nextId)) this.nextId = ids[0] ?? null;
    return ids;
  }

  private cellVars(c: Cell) {
    return { row: c.row, col: c.col, rows: this.rows, cols: this.cols, i: c.index };
  }

  private build(now: number) {
    for (const c of this.cells) c.swap?.anims.forEach((a) => a.cancel());
    this.root.replaceChildren();
    this.cells = [];
    const n = this.cols * this.rows;
    for (let i = 0; i < n; i++) {
      const el = document.createElement("div");
      el.className = "lpw-cell";
      const a = document.createElement("img");
      const b = document.createElement("img");
      const cover = document.createElement("div");
      for (const img of [a, b]) {
        img.decoding = "async";
        img.alt = "";
        img.draggable = false;
        img.className = "lpw-layer";
      }
      cover.className = "lpw-layer lpw-cover";
      cover.style.background = this.coverColor;
      el.append(a, cover, b);
      this.root.append(el);
      const cell: Cell = {
        index: i,
        row: Math.floor(i / this.cols),
        col: i % this.cols,
        el,
        imgs: { a, b },
        cover,
        oldRole: "a",
        photoId: null,
        lastChanged: now - this.rng(),
        busyUntil: now + 0.5 + this.rng() * 2.5,
        swap: null,
        pending: null,
      };
      this.styleRoles(cell);
      this.cells.push(cell);
    }
    this.applyLayout();
    this.fillEmpty(now);
    this.nextAt = now + 0.8;
  }

  private applyLayout() {
    const s = this.root.style;
    s.display = "grid";
    s.gridTemplateColumns = `repeat(${this.cols}, minmax(0, 1fr))`;
    s.gridTemplateRows = `repeat(${this.rows}, minmax(0, 1fr))`;
    s.gap = this.gap ? `${this.gap}cqh` : "0";
    s.padding = this.gap ? `${this.gap}cqh` : "0";
    for (const c of this.cells) {
      c.el.style.borderRadius = this.radius ? `${this.radius}cqh` : "";
    }
  }

  private fillEmpty(now: number) {
    // while photos are still downloading, fill empty cells with distinct photos only; repeats are
    // allowed once everything is ready (a wall with fewer photos than cells)
    const allReady = this.order.every((id) => this.ready.has(id));
    for (const c of this.cells) {
      if (c.photoId || c.swap || c.pending) continue;
      const id = this.take(c, allReady);
      if (!id) continue;
      c.photoId = id;
      const img = c.imgs[c.oldRole];
      img.src = this.url(id);
      c.busyUntil = Math.max(c.busyUntil, now + 1);
    }
  }

  private url(id: string) {
    const p = this.photos.get(id);
    return p ? imgUrl("view", p.hash) : "";
  }

  private newRole(c: Cell): Role {
    return c.oldRole === "a" ? "b" : "a";
  }

  /** z-order: old photo (1) < cover (2) < new photo (3); the new layer starts hidden. */
  private styleRoles(c: Cell) {
    const oldEl = c.imgs[c.oldRole];
    const newEl = c.imgs[this.newRole(c)];
    oldEl.style.zIndex = "1";
    oldEl.style.visibility = "visible";
    c.cover.style.zIndex = "2";
    c.cover.style.opacity = "0";
    newEl.style.zIndex = "3";
    newEl.style.visibility = "hidden";
  }

  private start(c: Cell, photoId: string, now: number, plan?: SwapPlan, hold = this.sched.hold) {
    const p = plan ?? planSwap(this.motion.doc, this.motion.sliders, this.motion.params, this.cellVars(c), this.rng);
    const newEl = c.imgs[this.newRole(c)];
    newEl.src = this.url(photoId);
    const targets = { old: c.imgs[c.oldRole], new: newEl, cover: c.cover } as const;
    const anims: Animation[] = [];
    for (const a of p.animations) {
      const anim = targets[a.layer].animate([a.frames[0], a.frames[1]] as Keyframe[], {
        duration: Math.max(1, a.dur * 1000),
        delay: a.start * 1000,
        easing: a.ease,
        fill: "forwards",
      });
      anims.push(anim);
    }
    anims.push(
      newEl.animate([{ visibility: "visible" }, { visibility: "visible" }], {
        duration: 1,
        delay: p.newVisibleAt * 1000,
        fill: "forwards",
      }),
    );
    if (this.opts.mode === "render") for (const a of anims) a.pause();
    c.el.style.zIndex = "5";
    const firstShow = !c.swap;
    c.swap = { start: now, end: now + p.total, photoId, anims, plan: p, firstShow };
    c.lastChanged = now;
    c.busyUntil = now + p.total + hold;
    this.swaps++;
    this.opts.onSwap?.();
    this.opts.onShown?.(photoId);
  }

  private finish(c: Cell) {
    const s = c.swap!;
    const newRole = this.newRole(c);
    c.oldRole = newRole;
    c.photoId = s.photoId;
    // the arriving photo becomes the resting layer: make it visible before dropping its animations
    this.styleRoles(c);
    for (const a of s.anims) a.cancel();
    c.imgs[this.newRole(c)].removeAttribute("src");
    c.el.style.zIndex = "";
    c.swap = null;
  }
}

/** CSS the engine expects (inject once). */
export const ENGINE_CSS = `
.lpw-cell{position:relative;min-width:0;min-height:0;}
.lpw-layer{position:absolute;inset:0;border-radius:inherit;width:100%;height:100%;object-fit:cover;display:block;user-select:none;-webkit-user-drag:none;backface-visibility:hidden;}
.lpw-cover{pointer-events:none;}
.lpw-cell img:not([src]){visibility:hidden;}
`;

/**
 * Tiny, safe expression evaluator for wallmotion values. No eval: a hand-written
 * recursive-descent parser over numbers, $variables, + - * /, parentheses and a
 * fixed set of functions.
 */

export type Vars = Record<string, number>;
export type Rng = () => number;

export type Ctx = {
  vars: Vars;
  rng: Rng;
  /** Shared per-swap variation factor used by vary() */
  varyFactor: number;
};

type Tok =
  | { t: "num"; v: number }
  | { t: "var"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

export class ExprError extends Error {}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const n = Number(src.slice(i, j));
      if (!Number.isFinite(n)) throw new ExprError(`bad number "${src.slice(i, j)}"`);
      out.push({ t: "num", v: n });
      i = j;
      continue;
    }
    if (c === "$") {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      if (j === i + 1) throw new ExprError("a $ must be followed by a name");
      out.push({ t: "var", v: src.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/(),".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new ExprError(`unexpected "${c}"`);
  }
  return out;
}

export const FUNCTIONS: Record<string, { min: number; max: number }> = {
  min: { min: 1, max: 16 },
  max: { min: 1, max: 16 },
  abs: { min: 1, max: 1 },
  round: { min: 1, max: 1 },
  rand: { min: 2, max: 2 },
  pick: { min: 1, max: 16 },
  vary: { min: 1, max: 1 },
};

type Node =
  | { k: "num"; v: number }
  | { k: "var"; v: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; f: string; args: Node[] };

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const isOp = (v: string) => {
    const t = toks[p];
    return t?.t === "op" && t.v === v;
  };
  function expr(): Node {
    let a = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: string }).v;
      a = { k: "bin", op, a, b: term() };
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    while (isOp("*") || isOp("/")) {
      const op = (toks[p++] as { v: string }).v;
      a = { k: "bin", op, a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (isOp("-")) {
      p++;
      return { k: "neg", a: unary() };
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    return atom();
  }
  function atom(): Node {
    const t = toks[p++];
    if (!t) throw new ExprError("expression ends too early");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "var") return { k: "var", v: t.v };
    if (t.t === "op" && t.v === "(") {
      const e = expr();
      if (!isOp(")")) throw new ExprError('missing ")"');
      p++;
      return e;
    }
    if (t.t === "id") {
      const f = FUNCTIONS[t.v];
      if (!f) throw new ExprError(`unknown function "${t.v}"`);
      if (!isOp("(")) throw new ExprError(`"${t.v}" needs parentheses`);
      p++;
      const args: Node[] = [];
      if (!isOp(")")) {
        args.push(expr());
        while (isOp(",")) {
          p++;
          args.push(expr());
        }
      }
      if (!isOp(")")) throw new ExprError('missing ")"');
      p++;
      if (args.length < f.min || args.length > f.max)
        throw new ExprError(`${t.v}() takes ${f.min === f.max ? f.min : `${f.min} to ${f.max}`} values`);
      return { k: "call", f: t.v, args };
    }
    throw new ExprError(`unexpected "${t.v}"`);
  }
  const n = expr();
  if (p < toks.length) throw new ExprError(`unexpected "${String((toks[p] as { v: unknown }).v)}"`);
  return n;
}

const cache = new Map<string, Node>();
function compiled(src: string): Node {
  let n = cache.get(src);
  if (!n) {
    n = parse(src);
    if (cache.size > 500) cache.clear();
    cache.set(src, n);
  }
  return n;
}

function run(n: Node, ctx: Ctx): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "var": {
      const v = ctx.vars[n.v];
      if (v === undefined) throw new ExprError(`unknown variable "$${n.v}"`);
      return v;
    }
    case "neg":
      return -run(n.a, ctx);
    case "bin": {
      const a = run(n.a, ctx);
      const b = run(n.b, ctx);
      if (n.op === "+") return a + b;
      if (n.op === "-") return a - b;
      if (n.op === "*") return a * b;
      return b === 0 ? 0 : a / b;
    }
    case "call": {
      const xs = n.args.map((a) => run(a, ctx));
      switch (n.f) {
        case "min":
          return Math.min(...xs);
        case "max":
          return Math.max(...xs);
        case "abs":
          return Math.abs(xs[0]);
        case "round":
          return Math.round(xs[0]);
        case "rand":
          return xs[0] + ctx.rng() * (xs[1] - xs[0]);
        case "pick":
          return xs[Math.floor(ctx.rng() * xs.length) % xs.length];
        case "vary":
          return xs[0] * ctx.varyFactor;
      }
    }
  }
  throw new ExprError("bad expression");
}

/** Variables referenced by an expression (for validation). */
export function referencedVars(src: string): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.k === "var") out.push(n.v);
    else if (n.k === "neg") walk(n.a);
    else if (n.k === "bin") {
      walk(n.a);
      walk(n.b);
    } else if (n.k === "call") n.args.forEach(walk);
  };
  walk(compiled(src));
  return out;
}

export function evalExpr(src: string, ctx: Ctx): number {
  const v = run(compiled(src), ctx);
  return Number.isFinite(v) ? v : 0;
}

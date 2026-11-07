/**
 * Strict JSON parser that remembers the line where each value starts, so the editor can
 * point at the exact line of a problem ("timeline[2].to.opacity" → line 14).
 */

export class JsonSyntaxError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
  ) {
    super(message);
  }
}

export type Parsed = { value: unknown; lines: Map<string, number> };

export function parseWithLines(text: string): Parsed {
  const lines = new Map<string, number>();
  let i = 0;
  let line = 1;
  let col = 1;

  const fail = (msg: string): never => {
    throw new JsonSyntaxError(msg, line, col);
  };
  const advance = () => {
    if (text[i] === "\n") {
      line++;
      col = 1;
    } else col++;
    i++;
  };
  const ws = () => {
    while (i < text.length && " \t\r\n".includes(text[i])) advance();
  };
  const expect = (ch: string) => {
    if (text[i] !== ch) fail(`expected "${ch}" but found ${text[i] ? `"${text[i]}"` : "the end"}`);
    advance();
  };

  function str(): string {
    expect('"');
    let out = "";
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\n") fail("unterminated string");
      if (text[i] === "\\") {
        advance();
        const e = text[i];
        const map: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (e === "u") {
          const hex = text.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("bad \\u escape");
          out += String.fromCharCode(parseInt(hex, 16));
          for (let k = 0; k < 5; k++) advance();
          continue;
        }
        if (!(e in map)) fail(`bad escape "\\${e}"`);
        out += map[e];
        advance();
        continue;
      }
      out += text[i];
      advance();
    }
    expect('"');
    return out;
  }

  function num(): number {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail(`unexpected "${text[i]}"`);
    for (let k = 0; k < m![0].length; k++) advance();
    return Number(m![0]);
  }

  function value(path: string): unknown {
    ws();
    lines.set(path, line);
    const c = text[i];
    if (c === "{") {
      advance();
      const obj: Record<string, unknown> = {};
      ws();
      if (text[i] === "}") {
        advance();
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail(text[i] === "}" ? "remove the comma before }" : "expected a quoted key");
        const k = str();
        ws();
        expect(":");
        obj[k] = value(path ? `${path}.${k}` : k);
        ws();
        if (text[i] === ",") {
          advance();
          continue;
        }
        if (text[i] === "}") {
          advance();
          return obj;
        }
        fail('expected "," or "}"');
      }
    }
    if (c === "[") {
      advance();
      const arr: unknown[] = [];
      ws();
      if (text[i] === "]") {
        advance();
        return arr;
      }
      for (;;) {
        arr.push(value(`${path}[${arr.length}]`));
        ws();
        if (text[i] === ",") {
          advance();
          ws();
          if (text[i] === "]") fail("remove the comma before ]");
          continue;
        }
        if (text[i] === "]") {
          advance();
          return arr;
        }
        fail('expected "," or "]"');
      }
    }
    if (c === '"') return str();
    if (c === "t" && text.startsWith("true", i)) {
      for (let k = 0; k < 4; k++) advance();
      return true;
    }
    if (c === "f" && text.startsWith("false", i)) {
      for (let k = 0; k < 5; k++) advance();
      return false;
    }
    if (c === "n" && text.startsWith("null", i)) {
      for (let k = 0; k < 4; k++) advance();
      return null;
    }
    if (c === undefined) fail("the file ends too early");
    return num();
  }

  const v = value("");
  ws();
  if (i < text.length) fail(`unexpected "${text[i]}" after the end`);
  return { value: v, lines };
}

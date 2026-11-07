import "server-only";
import { EventEmitter } from "node:events";

/**
 * In-process event bus feeding the server-sent event streams (walls, guests, admin).
 * The app runs as a single web service, so no external broker is needed.
 */
export type BusEvent =
  | { type: "manifest"; version: number }
  | { type: "resync"; wallId: string | null }
  | { type: "approved"; photoId: string }
  | { type: "queue"; pending: number }
  | { type: "guest"; guestId: string; photoId: string; status: string }
  | { type: "reservation"; guestId: string | null; photoId: string; row: number; col: number; rows: number; cols: number; showAt: number; hold: number; wallName: string }
  | { type: "gallery" }
  | { type: "walls" }
  | { type: "exports" };

const g = globalThis as unknown as { __lpwBus?: EventEmitter };
const emitter = (g.__lpwBus ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(0);
  return e;
})());

export function publish(event: BusEvent) {
  emitter.emit("event", event);
}

export function subscribe(fn: (e: BusEvent) => void): () => void {
  emitter.on("event", fn);
  return () => emitter.off("event", fn);
}

/** Build a text/event-stream Response that forwards selected bus events. */
export function sseResponse(
  request: Request,
  opts: {
    filter: (e: BusEvent) => unknown | null | undefined;
    initial?: () => Promise<unknown[]> | unknown[];
    heartbeatMs?: number;
    onOpen?: () => void;
    onClose?: () => void;
  },
): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (data: unknown, event?: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };
      const unsub = subscribe((e) => {
        const out = opts.filter(e);
        if (out !== null && out !== undefined) send(out);
      });
      const hb = setInterval(() => send({ t: Date.now() }, "ping"), opts.heartbeatMs ?? 15000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(hb);
        unsub();
        opts.onClose?.();
        try {
          controller.close();
        } catch {}
      };
      cleanup = close;
      request.signal.addEventListener("abort", close);
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      opts.onOpen?.();
      if (opts.initial) for (const item of await opts.initial()) send(item);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

import "server-only";
import { storage } from "./storage";

/**
 * Small in-memory LRU in front of the bucket. Photo files are content-addressed and never
 * change, so a few hundred MB here plus immutable HTTP caching (CDN + service worker) keeps
 * 500 phones from hammering the bucket. Concurrent misses for the same key share one fetch.
 */
const MAX_BYTES = Number(process.env.IMAGE_CACHE_MB ?? 200) * 1024 * 1024;

type Entry = { buf: Buffer };
const g = globalThis as unknown as { __lpwBlobCache?: { map: Map<string, Entry>; bytes: number; inflight: Map<string, Promise<Buffer | null>> } };
const state = (g.__lpwBlobCache ??= { map: new Map(), bytes: 0, inflight: new Map() });

export async function cachedBlob(key: string): Promise<Buffer | null> {
  const hit = state.map.get(key);
  if (hit) {
    state.map.delete(key);
    state.map.set(key, hit);
    return hit.buf;
  }
  let p = state.inflight.get(key);
  if (!p) {
    p = storage()
      .get(key)
      .then((buf) => {
        if (buf && buf.length < MAX_BYTES / 10) {
          state.map.set(key, { buf });
          state.bytes += buf.length;
          while (state.bytes > MAX_BYTES) {
            const oldest = state.map.keys().next().value;
            if (oldest === undefined) break;
            state.bytes -= state.map.get(oldest)!.buf.length;
            state.map.delete(oldest);
          }
        }
        return buf;
      })
      .finally(() => state.inflight.delete(key));
    state.inflight.set(key, p);
  }
  return p;
}

export function evict(key: string) {
  const e = state.map.get(key);
  if (e) {
    state.bytes -= e.buf.length;
    state.map.delete(key);
  }
}

export const IMMUTABLE = "public, max-age=31536000, immutable";

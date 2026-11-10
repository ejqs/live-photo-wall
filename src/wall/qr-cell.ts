import type { Design, QrLayer } from "@/lib/settings-types";

/** A QR card sits in a grid cell unless the layer opts out (older designs have no flag: they snap too). */
export const inCell = (l: QrLayer) => l.cell !== false;

/** The grid cell nearest a layer's position. */
export function cellAt(x: number, y: number, cols: number, rows: number) {
  const col = Math.min(cols - 1, Math.max(0, Math.floor((x / 100) * cols)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor((y / 100) * rows)));
  return { row, col, index: row * cols + col };
}

/** Cells taken by visible QR cards; the wall never puts photos there. */
export function qrCells(design: Design, cols: number, rows: number, hideQr: boolean): number[] {
  if (hideQr) return [];
  const out = new Set<number>();
  for (const l of design.layers) if (l.type === "qr" && !l.hidden && inCell(l)) out.add(cellAt(l.x, l.y, cols, rows).index);
  // never take every cell
  return out.size >= cols * rows ? [] : [...out];
}

/** Share of a cell a floating QR card (or a protected text or image layer) must cover before the cell is kept to roster photos. */
export const COVER_THRESHOLD = 0.02;

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };

/**
 * Cells (reading order) that a floating QR card covers by more than COVER_THRESHOLD of their
 * area. Only roster photos play there, so a guest photo is never hidden behind the card. The wall
 * and the design editor both use this, so what the editor highlights is what the wall does.
 */
export function coveredCells(cells: Box[], cards: Box[]): number[] {
  const out: number[] = [];
  cells.forEach((r, i) => {
    for (const c of cards) {
      const ox = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left));
      const oy = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
      if (ox * oy > COVER_THRESHOLD * r.width * r.height) {
        out.push(i);
        break;
      }
    }
  });
  return out;
}

/** Elements whose cells stay roster-only: a floating QR card, and text or image layers set to protect. */
export const COVER_SELECTOR = "[data-lpw-cover]";

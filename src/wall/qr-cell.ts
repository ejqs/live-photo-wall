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

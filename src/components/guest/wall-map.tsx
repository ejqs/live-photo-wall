import { cn } from "@/lib/utils";

/** Small map of the wall as you face it, with the guest's cell highlighted. */
export function WallMap({ rows, cols, row, col, className }: { rows: number; cols: number; row: number; col: number; className?: string }) {
  return (
    <div
      className={cn("grid aspect-video w-full gap-0.5 rounded-md bg-zinc-900 p-1", className)}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`Wall map: row ${row + 1}, ${ordinal(col + 1)} from the left`}
    >
      {Array.from({ length: rows * cols }, (_, i) => {
        const hit = Math.floor(i / cols) === row && i % cols === col;
        return <span key={i} className={cn("rounded-[2px]", hit ? "animate-pulse bg-amber-400" : "bg-zinc-700")} />;
      })}
    </div>
  );
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function whereText(row: number, col: number) {
  return `row ${row + 1}, ${ordinal(col + 1)} from the left`;
}

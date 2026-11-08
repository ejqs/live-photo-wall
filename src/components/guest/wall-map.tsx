import { cn } from "@/lib/utils";

/** Small map of the wall as you face it, with the guest's cell highlighted. */
export function WallMap({
  rows,
  cols,
  row,
  col,
  photo,
  className,
}: {
  rows: number;
  cols: number;
  row: number;
  col: number;
  /** once the photo has landed, draw it in its cell */
  photo?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn("grid aspect-video w-full gap-0.5 rounded-md bg-zinc-900 p-1", className)}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
      role="img"
      aria-label={`Wall map: row ${row + 1}, ${ordinal(col + 1)} from the left`}
    >
      {Array.from({ length: rows * cols }, (_, i) => {
        const hit = Math.floor(i / cols) === row && i % cols === col;
        if (!hit) return <span key={i} className="rounded-[2px] bg-zinc-700" />;
        return (
          <span
            key={i}
            className={cn("rounded-[2px] bg-cover bg-center outline-2 outline-offset-2 outline-green-300", photo ? "bg-zinc-700" : "animate-pulse bg-white")}
            style={photo ? { backgroundImage: `url(${JSON.stringify(photo)})` } : undefined}
          />
        );
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

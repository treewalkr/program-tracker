import type { PulseCell, PulseCellSet, SetType } from "@pt/shared";

/** Plain number, decimals kept ("107.5", never "107."). */
const n = (v: number) => String(Math.round(v * 100) / 100);

/** "150 kg × 3 @ 8", "BW × 8 @ 9", "10 kg · 45 s @ 7" — what was actually done. */
export function drillLoad(r: PulseCellSet): string {
  const rpe = r.rpe != null && r.rpe > 0 ? ` @ ${n(r.rpe)}` : "";
  if (r.timed) return `${r.weightKg ? `${n(r.weightKg)} kg · ` : ""}${r.reps} s${rpe}`;
  return `${r.weightKg ? `${n(r.weightKg)} kg` : "BW"} × ${r.reps}${rpe}`;
}

export function drillType(t: SetType): string {
  return t === "backoff" ? "Back-off" : "Working";
}

const CELL_LABEL: Record<PulseCell, { label: string; unit: string }> = {
  volume: { label: "overall volume", unit: "loaded set" },
  sets: { label: "sets", unit: "set" },
  rpe: { label: "avg RPE", unit: "rated set" },
  e1rm: { label: "best e1RM", unit: "loaded set" },
};

/** "Week 3 · overall volume · 4 loaded sets". */
export function drillHeading(cell: PulseCell, week: number, count: number): string {
  const { label, unit } = CELL_LABEL[cell];
  const sets = `${count} ${unit}${count === 1 ? "" : "s"}`;
  return `Week ${week} · ${label} · ${sets}${cell === "e1rm" ? ", highest first" : ""}`;
}

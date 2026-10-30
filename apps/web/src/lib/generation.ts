import type { GenerationDto } from "./api/types";

export const STALE_PENDING_MS = 15 * 60_000;
export const POLL_INTERVAL_MS = 5_000;
export type GeneratePhase = "form" | "generating" | "review" | "failed";

export function progressFraction(elapsedMs: number, expectedSeconds: number): number {
  const safeSeconds = Math.max(1, expectedSeconds);
  const fraction = elapsedMs / 1000 / safeSeconds;
  return Math.min(0.9, Math.max(0, fraction));
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const padSec = String(seconds).padStart(2, "0");
  if (hours > 0) {
    const padMin = String(minutes).padStart(2, "0");
    return `${hours}:${padMin}:${padSec}`;
  }
  return `${minutes}:${padSec}`;
}

export function typicalLabel(seconds: number): string {
  if (seconds < 60) {
    return `≈${seconds}s`;
  }
  const mins = seconds / 60;
  const formatted = mins.toFixed(1).replace(/\.0$/, "");
  return `≈${formatted} min`;
}

export function isLivePending(g: GenerationDto | null | undefined, now = Date.now()): boolean {
  if (!g || g.status !== "pending") return false;
  const createdMs = new Date(g.createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  const elapsed = now - createdMs;
  return elapsed <= STALE_PENDING_MS;
}

export function generationPhase(g: GenerationDto | null | undefined, now = Date.now()): GeneratePhase {
  if (!g) return "form";
  switch (g.status) {
    case "pending":
      return isLivePending(g, now) ? "generating" : "form";
    case "validated":
      return "review";
    case "failed_validation":
    case "failed_provider":
      return "failed";
    case "approved":
    case "rejected":
    default:
      return "form";
  }
}

export function revisionChain(gens: GenerationDto[], currentId: string): GenerationDto[] {
  if (!currentId) return [];
  const map = new Map<string, GenerationDto>();
  for (const g of gens) {
    map.set(g.id, g);
  }
  const current = map.get(currentId);
  if (!current) return [];

  const chain: GenerationDto[] = [current];
  const seen = new Set<string>([current.id]);
  let cursor = current;
  while (cursor.parentGenerationId) {
    const parent = map.get(cursor.parentGenerationId);
    if (!parent || seen.has(parent.id)) break;
    chain.push(parent);
    seen.add(parent.id);
    cursor = parent;
  }
  return chain.reverse();
}

export const PREFERENCE_SIGNAL_KINDS = ["instruction", "revision", "reject", "approved-diff", "note"] as const;
export type PreferenceSignalKind = (typeof PREFERENCE_SIGNAL_KINDS)[number];

export interface PreferenceSignal {
  kind: PreferenceSignalKind;
  clientName: string | null;
  at: string; // ISO createdAt of the generation row
  text: string;
}

export function renderPreferenceSignals(signals: PreferenceSignal[]): string {
  return signals
    .map((s) => `- ${s.kind} · ${s.clientName ?? "trainer-wide"} · ${s.at.slice(0, 10)}: ${s.text}`)
    .join("\n");
}

export function mockDistillPreferences(signals: PreferenceSignal[]): string {
  if (signals.length === 0) {
    return "Mock distilled preferences:";
  }
  // One very long signal (a 6,000-character brief) mustn't push every other line past the 4,000 cap.
  const lines = renderPreferenceSignals(signals)
    .split("\n")
    .map((l) => (l.length > 300 ? `${l.slice(0, 299)}…` : l));
  // Over 50 lines or 4,000 characters, the oldest lines drop first: recent feedback matters most.
  const head = "Mock distilled preferences:";
  const budget = 4000 - head.length - 40; // room for the "(+ n earlier signals)" line
  const kept: string[] = [];
  let size = 0;
  for (let i = lines.length - 1; i >= 0 && kept.length < 50; i--) {
    if (size + lines[i].length + 1 > budget) break;
    kept.unshift(lines[i]);
    size += lines[i].length + 1;
  }
  const dropped = lines.length - kept.length;
  return [head, ...(dropped > 0 ? [`(+ ${dropped} earlier signals)`] : []), ...kept].join("\n");
}

export function combinePreferenceDocs(trainer: string | null, client: string | null): string | null {
  const t = trainer?.trim() || null;
  const c = client?.trim() || null;
  if (t && c) {
    return `${t}\n\nClient-specific preferences:\n${c}`;
  }
  if (t) return t;
  if (c) return c;
  return null;
}

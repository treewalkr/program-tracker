export const PREFERENCE_SIGNAL_KINDS = ["instruction", "revision", "reject", "approved-diff"] as const;
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
  const lines = renderPreferenceSignals(signals).split("\n");
  const rendered = [
    "Mock distilled preferences:",
    ...lines.slice(0, 50),
    ...(lines.length > 50 ? [`(+ ${lines.length - 50} more signals)`] : []),
  ].join("\n");
  return rendered.slice(0, 4000);
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

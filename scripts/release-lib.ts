/** Pure helpers for scripts/release.ts — kept separate so they can be tested. */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** Next version: an explicit "x.y.z", else the patch bump (0.1.x stays 0.1.x until you say otherwise). */
export function nextVersion(current: string, explicit?: string): string {
  const cur = SEMVER.exec(current);
  if (!cur) throw new Error(`current version "${current}" is not x.y.z`);
  if (explicit) {
    const want = SEMVER.exec(explicit.replace(/^v/, ""));
    if (!want) throw new Error(`"${explicit}" is not x.y.z`);
    const rank = (m: RegExpExecArray) => [1, 2, 3].map((i) => Number(m[i]));
    const [a, b] = [rank(want), rank(cur)];
    const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    if (newer <= 0) throw new Error(`${explicit} is not newer than ${current}`);
    return want.slice(1).join(".");
  }
  return `${cur[1]}.${cur[2]}.${Number(cur[3]) + 1}`;
}

/** Release notes from one-line commit subjects: features, then fixes; chores and docs left out. */
export function releaseNotes(version: string, subjects: string[]): string {
  const pick = (type: string) =>
    subjects.filter((s) => s.startsWith(`${type}:`)).map((s) => `- ${s.slice(type.length + 1).trim()}`);
  const feats = pick("feat");
  const fixes = pick("fix");
  const out = [`v${version}`];
  if (feats.length) out.push("", "Features", ...feats);
  if (fixes.length) out.push("", "Fixes", ...fixes);
  if (!feats.length && !fixes.length) out.push("", "Maintenance only.");
  return out.join("\n");
}

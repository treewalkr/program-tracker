/**
 * The product changelog (repo-root CHANGELOG.md) parsed for the What's new page.
 * Released sections only: `## Unreleased` is work in progress and never shown.
 * A bullet may carry its Thai text as an indented sub-bullet: `  - th: …`.
 */

export interface ChangelogSection {
  /** "New", "Improved", "Fixed" — or null for lines with no `###` heading above them. */
  kind: string | null;
  items: string[];
  /** Thai text per item (same index), null where the changelog has no Thai line. */
  th: (string | null)[];
}

export interface Release {
  /** "0.1.9", without the leading v. */
  version: string;
  /** ISO calendar date, "2026-11-09". */
  date: string;
  sections: ChangelogSection[];
}

const RELEASE = /^## v(\d+\.\d+\.\d+)\s+[—–-]\s+(\d{4}-\d{2}-\d{2})\s*$/;

export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let section: ChangelogSection | null = null;
  let item: number | null = null; // index of the bullet a continuation line belongs to

  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const m = RELEASE.exec(line);
      release = m ? { version: m[1], date: m[2], sections: [] } : null; // Unreleased and odd headings are skipped
      if (release) releases.push(release);
      section = null;
      item = null;
      continue;
    }
    if (!release) continue;
    const h = /^### (.+?)\s*$/.exec(line);
    if (h) {
      section = { kind: h[1], items: [], th: [] };
      release.sections.push(section);
      item = null;
      continue;
    }
    const thLine = /^\s+[-*] th:\s*(.+)$/.exec(line);
    if (thLine) {
      if (section && item !== null) section.th[item] = thLine[1].trim();
      continue;
    }
    const bullet = /^[-*] (.+)$/.exec(line);
    if (bullet) {
      if (!section) {
        section = { kind: null, items: [], th: [] };
        release.sections.push(section);
      }
      item = section.items.push(bullet[1].trim()) - 1;
      section.th[item] = null;
    } else if (line.trim() && section && item !== null && /^\s/.test(line)) {
      section.items[item] += ` ${line.trim()}`;
    } else if (!line.trim()) {
      item = null;
    }
  }
  return releases.map((r) => ({ ...r, sections: r.sections.filter((s) => s.items.length) }));
}

/** Newest released version, or null when nothing has been released. */
export const latestVersion = (releases: Release[]): string | null => releases[0]?.version ?? null;

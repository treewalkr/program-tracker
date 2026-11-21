/** Free-typed tags: split pasted text, add without case-insensitive duplicates. Pure. */

/** "a, b\nc,," → ["a", "b", "c"]. */
export function splitTags(text: string): string[] {
	return text
		.split(/[,\n]/)
		.map((t) => t.trim())
		.filter(Boolean);
}

/** Append the new tags; ones already there (any case, or repeated in `incoming`) go to `duplicates`. */
export function addTags(existing: readonly string[], incoming: readonly string[]): { tags: string[]; duplicates: string[] } {
	const tags = [...existing];
	const duplicates: string[] = [];
	const seen = new Set(existing.map((t) => t.toLowerCase()));
	for (const t of incoming) {
		const key = t.toLowerCase();
		if (seen.has(key)) duplicates.push(t);
		else {
			seen.add(key);
			tags.push(t);
		}
	}
	return { tags, duplicates };
}

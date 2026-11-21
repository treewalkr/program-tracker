/** Typed durations for the duration field: "35:10", "1:05:00", or a bare number of minutes. Pure. */

/**
 * Text → seconds. "35:10" is mm:ss, "1:05:00" is h:mm:ss, a bare "40" (or
 * "40.5", "40,5") is minutes. Blank or junk → null; seconds past 59 are junk.
 */
export function parseDuration(text: string): number | null {
	const t = text.trim().replace(/\s+/g, '');
	if (!t) return null;
	if (/^\d+([.,]\d+)?$/.test(t)) {
		const min = Number(t.replace(',', '.'));
		return Number.isFinite(min) ? Math.round(min * 60) : null;
	}
	const parts = t.split(':');
	if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
	const nums = parts.map(Number);
	const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
	if (s > 59 || (nums.length === 3 && m > 59)) return null;
	return h * 3600 + m * 60 + s;
}

/** Seconds → "35:10", or "1:05:00" from an hour (or always, with `hours`). Null → "". */
export function formatDuration(sec: number | null | undefined, { hours = false }: { hours?: boolean } = {}): string {
	if (sec == null || !Number.isFinite(sec)) return '';
	const total = Math.max(0, Math.round(sec));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const ss = String(s).padStart(2, '0');
	if (h > 0 || hours) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
	return `${m}:${ss}`;
}

/** "Between 1:00 and 5:00:00" when out of range, else null. Blank isn't a range issue. */
export function durationIssue(sec: number | null, min?: number, max?: number): string | null {
	if (sec === null) return null;
	const below = min !== undefined && sec < min;
	const above = max !== undefined && sec > max;
	if (!below && !above) return null;
	if (min !== undefined && max !== undefined) return `Between ${formatDuration(min)} and ${formatDuration(max)}`;
	if (min !== undefined) return `At least ${formatDuration(min)}`;
	return `At most ${formatDuration(max)}`;
}

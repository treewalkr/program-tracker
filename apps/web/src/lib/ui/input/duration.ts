/** Typed durations for the duration field: "35:10", "1:05:00", keypad digits "3510", or a bare number of minutes. Pure. */

/**
 * Text → seconds. "35:10" is mm:ss, "1:05:00" is h:mm:ss. Digits alone are
 * read the way a phone keypad (no ":") types a clock: three or more digits get
 * the colon from the right — "3510" → 35:10, "530" → 5:30, "10530" → 1:05:30;
 * one or two digits (or "40.5", "40,5") are minutes. Blank or junk → null;
 * seconds (or minutes after an hour) past 59 are junk.
 */
export function parseDuration(text: string): number | null {
	const t = text.trim().replace(/\s+/g, '');
	if (!t) return null;
	if (/^\d{3,6}$/.test(t)) return clock(t.length > 4 ? [t.slice(0, -4), t.slice(-4, -2), t.slice(-2)] : [t.slice(0, -2), t.slice(-2)]);
	if (/^(\d{1,2}|\d+[.,]\d+)$/.test(t)) {
		const min = Number(t.replace(',', '.'));
		return Number.isFinite(min) ? Math.round(min * 60) : null;
	}
	const parts = t.split(':');
	if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
	return clock(parts);
}

function clock(parts: string[]): number | null {
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

/** Range messages; `{min}` and `{max}` are filled in the field's own format. English by default. */
export interface RangeWords {
	between: string;
	atLeast: string;
	atMost: string;
}

export const RANGE_WORDS_EN: RangeWords = { between: 'Between {min} and {max}', atLeast: 'At least {min}', atMost: 'At most {max}' };

/** Fill a range message. */
export function rangeText(words: RangeWords, min: string | undefined, max: string | undefined): string {
	const fill = (t: string) => t.replace('{min}', min ?? '').replace('{max}', max ?? '');
	if (min !== undefined && max !== undefined) return fill(words.between);
	if (min !== undefined) return fill(words.atLeast);
	return fill(words.atMost);
}

/** "Between 1:00 and 5:00:00" when out of range, else null. Blank isn't a range issue. */
export function durationIssue(sec: number | null, min?: number, max?: number, words: RangeWords = RANGE_WORDS_EN): string | null {
	if (sec === null) return null;
	const below = min !== undefined && sec < min;
	const above = max !== undefined && sec > max;
	if (!below && !above) return null;
	return rangeText(words, min === undefined ? undefined : formatDuration(min), max === undefined ? undefined : formatDuration(max));
}

/** True when a logged time is under 30 % of the planned one — likely a typo (minutes read as seconds). */
export function farUnderPlan(sec: number | null | undefined, plannedSec: number | null | undefined): boolean {
	return sec != null && plannedSec != null && plannedSec > 0 && sec < plannedSec * 0.3;
}

/** Typed figures for the unit and diff fields: parse, format, step, range-check. Pure. */

import { RANGE_WORDS_EN, rangeText, type RangeWords } from './duration';

/** "102,5" or " 102.5 " → 102.5; blank or junk → null. */
export function parseFigure(text: string): number | null {
	const t = text.trim().replace(/\s+/g, '').replace(',', '.');
	if (!/^[-−]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
	const n = Number(t.replace('−', '-'));
	return Number.isFinite(n) ? n : null;
}

/** Fixed decimals when given, else the shortest form: 100, 102.5. Null → "". */
export function formatFigure(n: number | null, decimals?: number): string {
	if (n === null) return '';
	if (decimals !== undefined) return n.toFixed(decimals);
	return String(Number(n.toFixed(6)));
}

/** One step up (dir 1) or down (dir -1), clamped to min/max, free of float drift. */
export function stepFigure(n: number | null, step: number, dir: 1 | -1, min?: number, max?: number): number {
	const places = (String(step).split('.')[1] ?? '').length;
	let next = Number(((n ?? min ?? 0) + step * dir).toFixed(places));
	if (min !== undefined) next = Math.max(min, next);
	if (max !== undefined) next = Math.min(max, next);
	return next;
}

/** "Between 0 and 500 kg" when out of range, else null. Blank isn't a range issue. */
export function rangeIssue(n: number | null, min?: number, max?: number, unit?: string, words: RangeWords = RANGE_WORDS_EN): string | null {
	if (n === null) return null;
	const below = min !== undefined && n < min;
	const above = max !== undefined && n > max;
	if (!below && !above) return null;
	const u = unit ? ` ${unit}` : '';
	const text = rangeText(words, min === undefined ? undefined : String(min), max === undefined ? undefined : String(max));
	return `${text}${u}`;
}

/** The signed change with a real minus: "+2.5", "−5"; 0 → "0". */
export function signedDelta(n: number): string {
	const s = formatFigure(Math.abs(n));
	return n > 0 ? `+${s}` : n < 0 ? `−${s}` : '0';
}

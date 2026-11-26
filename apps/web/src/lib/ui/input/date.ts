/** Date-field helpers. Dates are ISO "YYYY-MM-DD", compared as UTC days. Pure. */

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/** Whole calendar months from `from` to `to` (to ≥ from): 21 Jan → 21 Nov is 10, → 20 Nov is 9. */
function wholeMonths(from: string, to: string): number {
	const [y1, m1, d1] = from.slice(0, 10).split('-').map(Number);
	const [y2, m2, d2] = to.slice(0, 10).split('-').map(Number);
	return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

/** "today", "tomorrow", "yesterday", "in 3 days", "3 days ago"; past 60 days,
 *  calendar months ("10 months ago"), and from two years, years (a birth date). */
export function relativeDay(date: string, today: string): string {
	const diff = dayNumber(date) - dayNumber(today);
	if (diff === 0) return 'today';
	if (diff === 1) return 'tomorrow';
	if (diff === -1) return 'yesterday';
	const say = (n: number, unit: string) => (diff > 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`);
	if (Math.abs(diff) <= 60) return say(Math.abs(diff), 'days');
	const months = diff > 0 ? wholeMonths(today, date) : wholeMonths(date, today);
	return months >= 24 ? say(Math.floor(months / 12), 'years') : say(months, 'months');
}

export function isMonday(date: string): boolean {
	return new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay() === 1;
}

/** "Sat" for 2026-11-21. */
export function weekdayShort(date: string): string {
	return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

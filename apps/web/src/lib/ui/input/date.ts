/** Date-field helpers. Dates are ISO "YYYY-MM-DD", compared as UTC days. Pure. */

const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/** "today", "tomorrow", "yesterday", "in 3 days", "3 days ago". */
export function relativeDay(date: string, today: string): string {
	const diff = dayNumber(date) - dayNumber(today);
	if (diff === 0) return 'today';
	if (diff === 1) return 'tomorrow';
	if (diff === -1) return 'yesterday';
	return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

export function isMonday(date: string): boolean {
	return new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay() === 1;
}

/** "Sat" for 2026-11-21. */
export function weekdayShort(date: string): string {
	return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
}

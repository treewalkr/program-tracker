import { describe, expect, test } from 'bun:test';
import { isMonday, relativeDay, weekdayShort } from './date';

describe('relativeDay', () => {
	const today = '2026-11-21';
	test('names near days', () => {
		expect(relativeDay('2026-11-21', today)).toBe('today');
		expect(relativeDay('2026-11-22', today)).toBe('tomorrow');
		expect(relativeDay('2026-11-20', today)).toBe('yesterday');
	});
	test('counts further days both ways, across a month end', () => {
		expect(relativeDay('2026-11-24', today)).toBe('in 3 days');
		expect(relativeDay('2026-11-18', today)).toBe('3 days ago');
		expect(relativeDay('2026-12-01', today)).toBe('in 10 days');
	});
	test('says far dates in calendar months, then years', () => {
		expect(relativeDay('2026-09-22', today)).toBe('60 days ago');
		expect(relativeDay('2026-01-21', today)).toBe('10 months ago');
		expect(relativeDay('2026-01-22', today)).toBe('9 months ago');
		expect(relativeDay('2027-05-21', today)).toBe('in 6 months');
		expect(relativeDay('1990-04-12', today)).toBe('36 years ago');
		expect(relativeDay('1990-11-22', today)).toBe('35 years ago');
	});
});

describe('isMonday', () => {
	test('true only on Mondays', () => {
		expect(isMonday('2026-11-23')).toBe(true);
		expect(isMonday('2026-11-21')).toBe(false);
	});
});

describe('weekdayShort', () => {
	test('three-letter weekday', () => {
		expect(weekdayShort('2026-11-21')).toBe('Sat');
	});
});

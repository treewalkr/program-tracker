import { describe, expect, test } from 'bun:test';
import { durationIssue, formatDuration, parseDuration } from './duration';

describe('parseDuration', () => {
	test('mm:ss, h:mm:ss and bare minutes', () => {
		expect(parseDuration('1:05:00')).toBe(3900);
		expect(parseDuration('40')).toBe(2400);
		expect(parseDuration('2,5')).toBe(150);
		expect(parseDuration(' 2 : 00 ')).toBe(120);
	});
	test('blank and junk are null; 60 seconds is junk', () => {
		expect(parseDuration('')).toBeNull();
		expect(parseDuration('abc')).toBeNull();
		expect(parseDuration('3:75')).toBeNull();
		expect(parseDuration('1:2:3:4')).toBeNull();
	});
});

describe('formatDuration', () => {
	test('minutes and seconds, hours from an hour', () => {
		expect(formatDuration(2110)).toBe('35:10');
		expect(formatDuration(120)).toBe('2:00');
		expect(formatDuration(3900)).toBe('1:05:00');
		expect(formatDuration(600, { hours: true })).toBe('0:10:00');
		expect(formatDuration(null)).toBe('');
	});
	test('round trip', () => {
		for (const s of [59, 600, 1980, 4 * 3600]) expect(parseDuration(formatDuration(s))).toBe(s);
	});
});

test('durationIssue names the range in the field format', () => {
	expect(durationIssue(30, 60, 18000)).toBe('Between 1:00 and 5:00:00');
	expect(durationIssue(120, 60, 18000)).toBeNull();
	expect(durationIssue(null, 60)).toBeNull();
});

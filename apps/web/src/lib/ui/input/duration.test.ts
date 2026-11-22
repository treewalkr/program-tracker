import { describe, expect, test } from 'bun:test';
import { durationIssue, farUnderPlan, formatDuration, parseDuration } from './duration';

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

describe('keypad digits (no ":" on the iPhone numeric keypad)', () => {
	test('three or more digits get the colon from the right', () => {
		expect(parseDuration('3510')).toBe(35 * 60 + 10);
		expect(parseDuration('530')).toBe(5 * 60 + 30);
		expect(parseDuration('10530')).toBe(3600 + 5 * 60 + 30);
		expect(parseDuration('010530')).toBe(3600 + 5 * 60 + 30);
		expect(parseDuration('0045')).toBe(45);
	});
	test('one or two digits stay minutes; typed colons still work', () => {
		expect(parseDuration('5')).toBe(300);
		expect(parseDuration('40')).toBe(2400);
		expect(parseDuration('35:10')).toBe(2110);
		expect(parseDuration('1:05:30')).toBe(3930);
	});
	test('impossible clock digits are junk', () => {
		expect(parseDuration('375')).toBeNull(); // 3:75
		expect(parseDuration('16030')).toBeNull(); // 1:60:30
		expect(parseDuration('1234567')).toBeNull();
	});
});

test('durationIssue takes translated words', () => {
	expect(durationIssue(30, 60, 18000, { between: 'ระหว่าง {min} ถึง {max}', atLeast: '', atMost: '' })).toBe('ระหว่าง 1:00 ถึง 5:00:00');
});

test('farUnderPlan warns under 30 % of the plan', () => {
	expect(farUnderPlan(35, 1980)).toBe(true);
	expect(farUnderPlan(1500, 1980)).toBe(false);
	expect(farUnderPlan(35, null)).toBe(false);
	expect(farUnderPlan(null, 1980)).toBe(false);
});

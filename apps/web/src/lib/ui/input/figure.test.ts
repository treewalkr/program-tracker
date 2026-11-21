import { describe, expect, test } from 'bun:test';
import { formatFigure, parseFigure, rangeIssue, signedDelta, stepFigure } from './figure';

describe('parseFigure', () => {
	test('reads dot or comma decimals and trims', () => {
		expect(parseFigure('102,5')).toBe(102.5);
		expect(parseFigure(' 102.5 ')).toBe(102.5);
		expect(parseFigure('100')).toBe(100);
		expect(parseFigure('.5')).toBe(0.5);
		expect(parseFigure('-5')).toBe(-5);
	});
	test('blank and junk are null', () => {
		expect(parseFigure('')).toBeNull();
		expect(parseFigure('  ')).toBeNull();
		expect(parseFigure('abc')).toBeNull();
		expect(parseFigure('1.2.3')).toBeNull();
		expect(parseFigure('10kg')).toBeNull();
	});
});

describe('formatFigure', () => {
	test('shortest form, or fixed decimals', () => {
		expect(formatFigure(100)).toBe('100');
		expect(formatFigure(102.5)).toBe('102.5');
		expect(formatFigure(0.1 + 0.2)).toBe('0.3');
		expect(formatFigure(100, 1)).toBe('100.0');
		expect(formatFigure(null)).toBe('');
	});
});

describe('stepFigure', () => {
	test('steps without float drift', () => {
		expect(stepFigure(102.5, 2.5, 1)).toBe(105);
		expect(stepFigure(0.1, 0.2, 1)).toBe(0.3);
		expect(stepFigure(10, 1, -1)).toBe(9);
	});
	test('clamps to min and max', () => {
		expect(stepFigure(0, 1, -1, 0)).toBe(0);
		expect(stepFigure(500, 10, 1, 0, 500)).toBe(500);
	});
	test('starts from min (or 0) when empty', () => {
		expect(stepFigure(null, 1, 1)).toBe(1);
		expect(stepFigure(null, 5, 1, 20)).toBe(25);
	});
});

describe('rangeIssue', () => {
	test('names the range with the unit', () => {
		expect(rangeIssue(600, 0, 500, 'kg')).toBe('Between 0 and 500 kg');
		expect(rangeIssue(-1, 0, undefined, 'min')).toBe('At least 0 min');
		expect(rangeIssue(120, undefined, 100, '%')).toBe('At most 100 %');
	});
	test('in range or blank is fine', () => {
		expect(rangeIssue(250, 0, 500, 'kg')).toBeNull();
		expect(rangeIssue(null, 0, 500)).toBeNull();
		expect(rangeIssue(5)).toBeNull();
	});
});

describe('signedDelta', () => {
	test('uses a real minus', () => {
		expect(signedDelta(2.5)).toBe('+2.5');
		expect(signedDelta(-5)).toBe('−5');
		expect(signedDelta(0)).toBe('0');
	});
});

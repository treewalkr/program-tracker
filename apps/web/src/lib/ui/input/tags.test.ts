import { describe, expect, test } from 'bun:test';
import { addTags, splitTags } from './tags';

describe('splitTags', () => {
	test('splits on comma and newline, trims, drops empties', () => {
		expect(splitTags('Squat, back squat\nBB squat,, ')).toEqual(['Squat', 'back squat', 'BB squat']);
		expect(splitTags('')).toEqual([]);
		expect(splitTags(' , \n ')).toEqual([]);
	});
});

describe('addTags', () => {
	test('appends new tags in order', () => {
		expect(addTags(['a'], ['b', 'c'])).toEqual({ tags: ['a', 'b', 'c'], duplicates: [] });
	});
	test('duplicates are case-insensitive, including within incoming', () => {
		expect(addTags(['Squat'], ['squat', 'Box', 'BOX'])).toEqual({ tags: ['Squat', 'Box'], duplicates: ['squat', 'BOX'] });
	});
});

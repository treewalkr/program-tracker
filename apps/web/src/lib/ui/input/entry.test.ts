import { describe, expect, test } from 'bun:test';
import { fieldAfter, isEntryField, type FieldLike } from './entry';

const field = (over: Partial<FieldLike> & { id?: string } = {}): FieldLike & { id?: string } => ({
	tagName: 'INPUT',
	type: 'number',
	disabled: false,
	readOnly: false,
	tabIndex: 0,
	getClientRects: () => ({ length: 1 }),
	...over,
});

describe('isEntryField', () => {
	test('typed inputs, textareas and selects take Enter', () => {
		expect(isEntryField(field())).toBe(true);
		expect(isEntryField(field({ type: 'text' }))).toBe(true);
		expect(isEntryField(field({ tagName: 'TEXTAREA', type: undefined }))).toBe(true);
		expect(isEntryField(field({ tagName: 'SELECT', type: undefined }))).toBe(true);
	});
	test('toggles, buttons, disabled, read-only, untabbable and hidden fields are skipped', () => {
		expect(isEntryField(field({ type: 'checkbox' }))).toBe(false);
		expect(isEntryField(field({ type: 'submit' }))).toBe(false);
		expect(isEntryField(field({ tagName: 'BUTTON' }))).toBe(false);
		expect(isEntryField(field({ disabled: true }))).toBe(false);
		expect(isEntryField(field({ readOnly: true }))).toBe(false);
		expect(isEntryField(field({ tabIndex: -1 }))).toBe(false);
		expect(isEntryField(field({ getClientRects: () => ({ length: 0 }) }))).toBe(false);
	});
});

describe('fieldAfter', () => {
	const kg = field({ id: 'kg' });
	const bw = field({ id: 'bw', type: 'checkbox' });
	const off = field({ id: 'off', disabled: true });
	const reps = field({ id: 'reps' });
	const all = [kg, bw, off, reps];

	test('skips what Enter cannot land on', () => {
		expect(fieldAfter(all, kg)).toBe(reps);
	});
	test('Shift goes back', () => {
		expect(fieldAfter(all, reps, -1)).toBe(kg);
	});
	test('null past either end, or for a field not in the list', () => {
		expect(fieldAfter(all, reps)).toBeNull();
		expect(fieldAfter(all, kg, -1)).toBeNull();
		expect(fieldAfter(all, field())).toBeNull();
	});
});

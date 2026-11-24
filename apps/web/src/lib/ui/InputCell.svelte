<script lang="ts">
	import { formatFigure, parseFigure, stepFigure } from './input/figure';
	import { selectOnTap } from './input/entry';

	/**
	 * Input 04 · Quiet cell — text or a figure edited inside a dense table or
	 * week row. Plain text at rest (aligned with the column), the field on
	 * hover, the full focus ring on focus — the same rhythm as Select 04.
	 * Enter commits, Esc reverts; `oncommit` fires only when the value changed.
	 * A figure cell with `step` steps on ↑/↓ like a number field. Tapping any
	 * figure cell selects its figure, so typing replaces it.
	 */
	interface Props {
		/** Accessible name: "Notes for Back squat". */
		label: string;
		value?: string;
		placeholder?: string;
		/** Mono, tabular, right-aligned. */
		figure?: boolean;
		/** Width in `ch`; omit to fill the cell. */
		width?: number;
		disabled?: boolean;
		maxlength?: number;
		/** Marks the cell as holding a value that can't be saved; the message sits outside the cell. */
		invalid?: boolean;
		/** With `figure`: ↑/↓ step the figure by this (Shift ×10), clamped to min/max. */
		step?: number;
		min?: number;
		max?: number;
		/** With `figure`: the value can be negative, so phones get a keyboard with a minus key (iOS's decimal pad has none). */
		signed?: boolean;
		oncommit?: (value: string) => void;
	}

	let { label, value = $bindable(''), placeholder, figure = false, width, disabled = false, maxlength, invalid = false, step, min, max, signed = false, oncommit }: Props = $props();

	let start = '';
	let el = $state<HTMLInputElement>();

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			el?.blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			value = start;
			el?.blur();
		} else if (figure && step && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
			e.preventDefault();
			value = formatFigure(stepFigure(parseFigure(value), step * (e.shiftKey ? 10 : 1), e.key === 'ArrowUp' ? 1 : -1, min, max));
		}
	}

	function onblur() {
		if (value !== start) oncommit?.(value);
	}
</script>

<input
	bind:this={el}
	class="cell"
	class:fig={figure}
	type="text"
	inputmode={figure && !signed ? 'decimal' : undefined}
	aria-label={label}
	{placeholder}
	{disabled}
	{maxlength}
	aria-invalid={invalid || undefined}
	autocomplete="off"
	enterkeyhint="done"
	style:width={width ? `calc(${width}ch + 14px)` : undefined}
	bind:value
	onfocus={() => (start = value)}
	{onblur}
	{onkeydown}
	{@attach figure && selectOnTap}
/>

<style>
	.cell {
		width: calc(100% + 12px);
		min-width: 0;
		padding: 2px 6px;
		margin: 0 -6px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		color: var(--ink);
		font: 400 var(--field-font, 14px)/17px var(--font-ui);
		min-height: var(--field-h, auto);
		caret-color: var(--blue);
	}
	.cell::placeholder { color: var(--muted); }
	.fig { font: 400 var(--field-font, 13px)/17px var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; }
	.cell:hover:not(:disabled):not(:focus) { border-color: var(--line); background: var(--well); }
	.cell:focus { outline: none; border-color: var(--blue); background: var(--surface); box-shadow: 0 0 0 3px var(--focus-ring); }
	.cell[aria-invalid='true'], .cell[aria-invalid='true']:hover { border-color: var(--bad); }
	.cell:disabled { cursor: not-allowed; opacity: 0.55; }
	/* No hover on touch: a resting hairline marks the field as editable. */
	@media (hover: none) { .cell:not(:focus) { border-color: var(--line-soft); } }
</style>

<script lang="ts">
	/**
	 * Input 04 · Quiet cell — text or a figure edited inside a dense table or
	 * week row. Plain text at rest (aligned with the column), the field on
	 * hover, the full focus ring on focus — the same rhythm as Select 04.
	 * Enter commits, Esc reverts; `oncommit` fires only when the value changed.
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
		oncommit?: (value: string) => void;
	}

	let { label, value = $bindable(''), placeholder, figure = false, width, disabled = false, oncommit }: Props = $props();

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
	inputmode={figure ? 'decimal' : undefined}
	aria-label={label}
	{placeholder}
	{disabled}
	autocomplete="off"
	style:width={width ? `calc(${width}ch + 14px)` : undefined}
	bind:value
	onfocus={() => (start = value)}
	{onblur}
	{onkeydown}
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
		font: 400 14px var(--font-ui);
		caret-color: var(--blue);
	}
	.cell::placeholder { color: var(--muted); }
	.fig { font: 400 13px var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; }
	.cell:hover:not(:disabled):not(:focus) { border-color: var(--line); background: var(--well); }
	.cell:focus { outline: none; border-color: var(--blue); background: var(--surface); box-shadow: 0 0 0 3px var(--focus-ring); }
	.cell:disabled { cursor: not-allowed; opacity: 0.55; }
	@media (max-width: 720px) { .cell { min-height: 40px; font-size: 16px; } }
</style>

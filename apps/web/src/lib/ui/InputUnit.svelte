<script lang="ts">
	import { untrack } from 'svelte';
	import FieldFrame from './input/FieldFrame.svelte';
	import { describedBy } from './input/field';
	import { enterToNext, selectOnTap } from './input/entry';
	import { formatFigure, parseFigure, rangeIssue, stepFigure } from './input/figure';
	import { RANGE_WORDS_EN, type RangeWords } from './input/duration';

	/**
	 * Input 02 · Unit field — a typed number with its unit in a cap: 1RM kg,
	 * bodyweight, cardio minutes, % of 1RM. Right-aligned mono figure, no
	 * native spinners. ↑/↓ step (Shift ×10); min/max check on blur. A tap
	 * selects a prefilled figure, so typing replaces it; Enter moves to the
	 * next field and never submits the form.
	 */
	interface Props {
		label: string;
		value?: number | null;
		/** Suffix cap: "kg", "min", "%". */
		unit: string;
		/** Optional left cap: "1RM", "@". */
		prefix?: string;
		step?: number;
		min?: number;
		max?: number;
		/** Rounds the figure; 0 = whole numbers, with the digits-only keypad. */
		decimals?: number;
		hint?: string | null;
		error?: string | null;
		optional?: boolean | string;
		disabled?: boolean;
		/** `auto` fits about 7 figures plus the caps; `fill` takes the column. */
		width?: 'auto' | 'fill';
		/** Keep the label for screen readers only (a figure in a list row). */
		hideLabel?: boolean;
		/** Range messages, in the page's language. */
		rangeWords?: RangeWords;
		onchange?: (value: number | null) => void;
	}

	let {
		label,
		value = $bindable(null),
		unit,
		prefix,
		step = 1,
		min,
		max,
		decimals,
		hint,
		error,
		optional = false,
		disabled = false,
		width = 'fill',
		hideLabel = false,
		rangeWords = RANGE_WORDS_EN,
		onchange,
	}: Props = $props();

	const id = $props.id();
	let text = $state(untrack(() => formatFigure(value ?? null, decimals)));
	let focused = $state(false);
	let checked = $state(false);

	// Follow outside changes while the field isn't being typed in.
	$effect(() => {
		const v = value ?? null;
		if (!focused) text = formatFigure(v, decimals);
	});

	const issue = $derived(error ?? (checked ? rangeIssue(value ?? null, min, max, unit, rangeWords) : null));

	function set(v: number | null) {
		value = v;
		onchange?.(v);
	}

	function oninput() {
		const n = parseFigure(text);
		if (n !== null || text.trim() === '') set(n);
	}

	function onblur() {
		focused = false;
		checked = true;
		text = formatFigure(value ?? null, decimals);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') return enterToNext(e);
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		const next = stepFigure(value ?? null, step * (e.shiftKey ? 10 : 1), e.key === 'ArrowUp' ? 1 : -1, min, max);
		set(next);
		text = formatFigure(next, decimals);
	}
</script>

<FieldFrame {id} {label} {hint} error={issue} {optional} {hideLabel}>
	<div class="box" class:auto={width === 'auto'} class:bad={!!issue} class:off={disabled}>
		{#if prefix}<span class="cap" aria-hidden="true">{prefix}</span>{/if}
		<input
			{id}
			class="in"
			type="text"
			inputmode={decimals === 0 ? 'numeric' : 'decimal'}
			pattern={decimals === 0 ? '[0-9]*' : undefined}
			enterkeyhint="next"
			autocomplete="off"
			spellcheck="false"
			{disabled}
			aria-invalid={issue ? true : undefined}
			aria-describedby={[`${id}-unit`, describedBy(id, { hint, error: issue })].filter(Boolean).join(' ')}
			bind:value={text}
			onfocus={() => (focused = true)}
			{oninput}
			{onblur}
			{onkeydown}
			{@attach selectOnTap}
		/>
		<span class="cap" id="{id}-unit">{unit}</span>
	</div>
</FieldFrame>

<style>
	.box {
		display: flex;
		align-items: stretch;
		min-height: var(--field-h, 32px);
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.box.auto { width: fit-content; }
	.box:focus-within { background: var(--surface); border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.box.bad { border-color: var(--bad); }
	.box.off { opacity: 0.55; }
	.in {
		flex: 1;
		min-width: 0;
		padding: 5px 10px 5px 12px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 400 var(--field-font, 13px) var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
		caret-color: var(--blue);
	}
	.auto .in { flex: none; width: calc(7ch + 22px); }
	.in:focus { outline: none; }
	.in:disabled { cursor: not-allowed; }
	.cap {
		display: flex;
		align-items: center;
		padding: 0 10px;
		font: 500 12px var(--font-ui);
		color: var(--muted);
		background: var(--well-2);
		white-space: nowrap;
	}
	.cap:first-child { border-right: 1px solid var(--line); }
	.cap:last-child { border-left: 1px solid var(--line); }
</style>

<script lang="ts">
	import { untrack } from 'svelte';
	import Icon from './Icon.svelte';
	import FieldFrame from './input/FieldFrame.svelte';
	import { describedBy } from './input/field';
	import { formatFigure, parseFigure, rangeIssue, signedDelta, stepFigure } from './input/figure';
	import { RANGE_WORDS_EN, type RangeWords } from './input/duration';

	/**
	 * Input 08 · Diff field — change a figure against a baseline: plan vs
	 * actual, was → now. A unit field with a leading baseline cap; when the
	 * value differs, the baseline is struck and a blue delta chip and a reset
	 * button appear, in DraftReview's diff grammar. Changed, not good or bad.
	 */
	interface Props {
		label: string;
		value?: number | null;
		baseline: number;
		/** Word in the baseline cap and the reset button: "plan", "was", "last". */
		baselineLabel?: string;
		unit: string;
		step?: number;
		min?: number;
		max?: number;
		decimals?: number;
		hint?: string | null;
		error?: string | null;
		disabled?: boolean;
		/** Label for screen readers only, for a table cell under a column head. */
		hideLabel?: boolean;
		/** Range messages, in the page's language. */
		rangeWords?: RangeWords;
		onchange?: (value: number | null) => void;
	}

	let {
		label,
		value = $bindable(null),
		baseline,
		baselineLabel = 'plan',
		unit,
		step = 1,
		min,
		max,
		decimals,
		hint,
		error,
		disabled = false,
		hideLabel = false,
		rangeWords = RANGE_WORDS_EN,
		onchange,
	}: Props = $props();

	const id = $props.id();
	let text = $state(untrack(() => formatFigure(value ?? null, decimals)));
	let focused = $state(false);
	let checked = $state(false);
	let input = $state<HTMLInputElement>();

	$effect(() => {
		const v = value ?? null;
		if (!focused) text = formatFigure(v, decimals);
	});

	const delta = $derived(value === null || value === undefined ? 0 : Number((value - baseline).toFixed(6)));
	const changed = $derived(delta !== 0);
	const issue = $derived(error ?? (checked ? rangeIssue(value ?? null, min, max, unit, rangeWords) : null));
	const word = $derived(baselineLabel.charAt(0).toUpperCase() + baselineLabel.slice(1));
	const spoken = $derived(
		changed
			? `${word} ${formatFigure(baseline)} ${unit}, now ${formatFigure(value ?? null)} ${unit}, ${delta > 0 ? 'up' : 'down'} ${formatFigure(Math.abs(delta))}`
			: '',
	);

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
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		const next = stepFigure(value ?? baseline, step * (e.shiftKey ? 10 : 1), e.key === 'ArrowUp' ? 1 : -1, min, max);
		set(next);
		text = formatFigure(next, decimals);
	}

	function reset() {
		set(baseline);
		text = formatFigure(baseline, decimals);
		input?.focus();
	}
</script>

<FieldFrame {id} {label} {hint} error={issue} {hideLabel}>
	<div class="row">
		<div class="box" class:bad={!!issue} class:off={disabled}>
			<span class="cap base" id="{id}-base">{baselineLabel}&nbsp;{#if changed}<s>{formatFigure(baseline)}</s>{:else}<span class="fig">{formatFigure(baseline)}</span>{/if}</span>
			<input
				bind:this={input}
				{id}
				class="in"
				type="text"
				inputmode="decimal"
				autocomplete="off"
				spellcheck="false"
				{disabled}
				aria-invalid={issue ? true : undefined}
				aria-describedby={[`${id}-base`, `${id}-unit`, describedBy(id, { hint, error: issue })].filter(Boolean).join(' ')}
				bind:value={text}
				onfocus={() => (focused = true)}
				{oninput}
				{onblur}
				{onkeydown}
			/>
			<span class="cap" id="{id}-unit">{unit}</span>
		</div>
		<!-- the chip and reset keep their slot when hidden, so boxes in a column share a right edge -->
		<span class="after" class:hide={!changed}>
			<span class="delta" aria-hidden="true">{changed ? signedDelta(delta) : '+0.0'}</span>
			<button type="button" class="undo" aria-label="Reset to {baselineLabel}" title="Reset to {baselineLabel}" {disabled} onclick={reset}><Icon name="undo" /></button>
		</span>
	</div>
	<span class="sr-only" aria-live="polite">{spoken}</span>
</FieldFrame>

<style>
	.row { display: flex; align-items: center; gap: 6px; min-width: 0; }
	.box {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: stretch;
		min-height: var(--field-h, 32px);
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.box:focus-within { background: var(--surface); border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.box.bad { border-color: var(--bad); }
	.box.off { opacity: 0.55; }
	.in {
		flex: 1;
		min-width: calc(6ch + 22px);
		padding: 5px 10px 5px 12px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 400 var(--field-font, 13px) var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
		caret-color: var(--blue);
	}
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
		border-left: 1px solid var(--line);
	}
	.base { border-left: 0; border-right: 1px solid var(--line); }
	.fig, s { font: 400 12px var(--font-mono); font-variant-numeric: tabular-nums; }
	s { color: var(--muted); text-decoration-color: var(--line-strong); }
	.after { flex: none; display: flex; align-items: center; gap: 6px; }
	.after.hide { visibility: hidden; }
	.delta {
		flex: none;
		min-width: 6ch;
		text-align: center;
		padding: 0 6px;
		border-radius: 99px;
		border: 1px solid var(--blue-line);
		background: var(--pulse-now-bg);
		color: var(--blue);
		font: 600 12px/20px var(--font-mono);
		font-variant-numeric: tabular-nums;
	}
	.undo {
		flex: none;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.undo:hover:not(:disabled) { background: var(--well-2); color: var(--ink); }
	.undo:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
	.undo :global(svg) { width: 14px; height: 14px; }
	@media (max-width: 720px), (pointer: coarse) {
		.undo { width: 32px; height: 32px; }
	}
</style>

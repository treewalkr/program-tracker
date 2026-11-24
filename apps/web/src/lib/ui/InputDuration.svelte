<script lang="ts">
	import { untrack } from 'svelte';
	import FieldFrame from './input/FieldFrame.svelte';
	import { describedBy } from './input/field';
	import { enterToNext, selectOnTap } from './input/entry';
	import { durationIssue, formatDuration, parseDuration, RANGE_WORDS_EN, type RangeWords } from './input/duration';

	/**
	 * Input 11 · Duration field — a time typed as mm:ss or h:mm:ss. Keypad
	 * digits get the colon from the right ("3510" → 35:10), since the iPhone
	 * numeric keypad has no ":"; one or two digits are minutes. The value is whole seconds; the field shows it back
	 * in the clock format on blur. ↑/↓ step by `step` seconds (Shift ×10).
	 * `cell` is the quiet table-cell look of Input 04, for interval rows.
	 * Focus selects the time, so typing replaces a prefilled plan; Enter moves
	 * to the next field (a cell just closes) and never submits the form.
	 */
	interface Props {
		label: string;
		/** Whole seconds; null = blank. */
		value?: number | null;
		/** Seconds per arrow step. */
		step?: number;
		min?: number;
		max?: number;
		/** Always show hours (h:mm:ss). */
		hours?: boolean;
		placeholder?: string;
		hint?: string | null;
		error?: string | null;
		optional?: boolean;
		disabled?: boolean;
		/** `auto` fits a clock time; `fill` takes the column. */
		width?: 'auto' | 'fill';
		/** Quiet cell inside a dense table: no label row (the label is the accessible name). */
		cell?: boolean;
		/** The "type a time" message, in the page's language. */
		junkText?: string;
		/** Range messages, in the page's language. */
		rangeWords?: RangeWords;
		onchange?: (value: number | null) => void;
	}

	let {
		label,
		value = $bindable(null),
		step = 60,
		min,
		max,
		hours = false,
		placeholder = 'mm:ss',
		hint,
		error,
		optional = false,
		disabled = false,
		width = 'fill',
		cell = false,
		junkText = 'Type a time like 35:10',
		rangeWords = RANGE_WORDS_EN,
		onchange,
	}: Props = $props();

	const id = $props.id();
	let text = $state(untrack(() => formatDuration(value, { hours })));
	let focused = $state(false);
	let checked = $state(false);
	let junk = $state(false);

	// A new value from outside reformats the text; blur does its own, and keeps typed junk on screen.
	$effect(() => {
		const v = value ?? null;
		untrack(() => {
			if (focused) return;
			text = formatDuration(v, { hours });
			junk = false;
		});
	});

	const issue = $derived(error ?? (junk ? junkText : checked ? durationIssue(value ?? null, min, max, rangeWords) : null));

	function set(v: number | null) {
		value = v;
		onchange?.(v);
	}

	function oninput() {
		const n = parseDuration(text);
		junk = false;
		if (n !== null || text.trim() === '') set(n);
	}

	function onblur() {
		focused = false;
		checked = true;
		junk = text.trim() !== '' && parseDuration(text) === null;
		if (!junk) text = formatDuration(value ?? null, { hours });
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !cell) return enterToNext(e);
		if (e.key === 'Enter' && cell) {
			e.preventDefault();
			(e.currentTarget as HTMLInputElement).blur();
			return;
		}
		if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
		e.preventDefault();
		const by = step * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
		let next = Math.max(min ?? 0, (value ?? 0) + by);
		if (max !== undefined) next = Math.min(max, next);
		set(next);
		text = formatDuration(next, { hours });
	}
</script>

{#snippet input()}
	<input
		{id}
		class="in"
		class:cellin={cell}
		class:bad={cell && !!issue}
		type="text"
		inputmode="numeric"
		enterkeyhint={cell ? 'done' : 'next'}
		autocomplete="off"
		spellcheck="false"
		{placeholder}
		{disabled}
		aria-label={cell ? label : undefined}
		aria-invalid={issue ? true : undefined}
		aria-describedby={cell ? undefined : describedBy(id, { hint, error: issue })}
		title={cell && issue ? issue : undefined}
		bind:value={text}
		onfocus={() => (focused = true)}
		{oninput}
		{onblur}
		{onkeydown}
		{@attach selectOnTap}
	/>
{/snippet}

{#if cell}
	{@render input()}
{:else}
	<FieldFrame {id} {label} {hint} error={issue} {optional}>
		<div class="box" class:auto={width === 'auto'} class:bad={!!issue} class:off={disabled}>
			{@render input()}
		</div>
	</FieldFrame>
{/if}

<style>
	.box {
		display: flex;
		align-items: stretch;
		min-height: 32px;
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
		padding: 5px 12px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 400 13px var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
		caret-color: var(--blue);
	}
	.in::placeholder { color: var(--muted); }
	.auto .in { flex: none; width: calc(8ch + 24px); }
	.in:focus { outline: none; }
	.in:disabled { cursor: not-allowed; }
	/* Input 04's quiet cell: text at rest, field on hover, ring on focus */
	.cellin {
		flex: none;
		width: calc(100% + 12px);
		padding: 2px 6px;
		margin: 0 -6px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		line-height: 17px;
	}
	.cellin:hover:not(:disabled):not(:focus) { border-color: var(--line); background: var(--well); }
	.cellin:focus { border-color: var(--blue); background: var(--surface); box-shadow: 0 0 0 3px var(--focus-ring); }
	.cellin.bad { border-color: var(--bad); }
	@media (max-width: 720px) { .box { min-height: 40px; } .in { font-size: 16px; } .cellin { min-height: 40px; } }
</style>

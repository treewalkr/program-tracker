<script lang="ts">
	import FieldFrame from './input/FieldFrame.svelte';
	import { describedBy } from './input/field';
	import { isMonday, relativeDay, weekdayShort } from './input/date';
	import { nextMonday } from '$lib/startDate';
	import { weekdayDayMonth } from '$lib/programEdit';

	/**
	 * Input 10 · Date field — one calendar date: program start, log date, test
	 * day. The native date input (its picker, keys and locale; no deps) in the
	 * base box, with a readout cap that says the date in words and how far
	 * away it is. `mondayOnly` warns when a start isn't a Monday and offers
	 * the next one.
	 */
	interface Props {
		label: string;
		/** ISO date, "YYYY-MM-DD"; "" when empty. */
		value?: string;
		/** Today as ISO, injectable for stories and tests. */
		today?: string;
		min?: string;
		max?: string;
		hint?: string | null;
		error?: string | null;
		optional?: boolean;
		required?: boolean;
		/** Program starts: a non-Monday gets a warning and a fix. */
		mondayOnly?: boolean;
		disabled?: boolean;
		/** Keep the label for screen readers only (a date in a list row). */
		hideLabel?: boolean;
		onchange?: (value: string) => void;
	}

	const localToday = () => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};

	let {
		label,
		value = $bindable(''),
		today = localToday(),
		min,
		max,
		hint,
		error,
		optional = false,
		required = false,
		mondayOnly = false,
		disabled = false,
		hideLabel = false,
		onchange,
	}: Props = $props();

	const id = $props.id();
	const valid = $derived(/^\d{4}-\d{2}-\d{2}$/.test(value));
	const readout = $derived(valid ? `${weekdayDayMonth(value)} · ${relativeDay(value, today)}` : '');
	const offDay = $derived(mondayOnly && valid && !isMonday(value));
	const monday = $derived(offDay ? nextMonday(value) : '');
	const warnId = $derived(offDay && !error ? `${id}-warn` : undefined);
	const described = $derived(
		[valid ? `${id}-out` : null, warnId ?? describedBy(id, { hint, error })].filter(Boolean).join(' ') || undefined,
	);

	function set(v: string) {
		value = v;
		onchange?.(v);
	}
</script>

<FieldFrame {id} {label} hint={offDay ? null : hint} {error} {optional} {hideLabel}>
	<div class="box" class:bad={!!error} class:off={disabled}>
		<input
			{id}
			class="in"
			type="date"
			{min}
			{max}
			{required}
			{disabled}
			aria-invalid={error ? true : undefined}
			aria-describedby={described}
			bind:value
			onchange={() => onchange?.(value)}
		/>
		{#if readout}<span class="cap" id="{id}-out">{readout}</span>{/if}
	</div>
	{#if offDay && !error}
		<div class="warn" id={warnId}>
			<span>Weeks run Mon–Sun — this starts on a {weekdayShort(value)}.</span>
			<button type="button" class="btn small ghost" {disabled} onclick={() => set(monday)}>Use {weekdayDayMonth(monday)}</button>
		</div>
	{/if}
</FieldFrame>

<style>
	.box {
		display: flex;
		align-items: stretch;
		min-height: var(--field-h, 32px);
		min-width: 0;
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
		min-width: 0;
		padding: 4px 10px 4px 12px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 400 var(--field-font, 13px) var(--font-mono);
		font-variant-numeric: tabular-nums;
		caret-color: var(--blue);
	}
	.in:focus { outline: none; }
	.in:disabled { cursor: not-allowed; }
	.in::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.6; }
	.in::-webkit-calendar-picker-indicator:hover { opacity: 1; }
	.in::-webkit-datetime-edit-fields-wrapper { padding: 0; }
	.in:invalid:not(:focus)::-webkit-datetime-edit { color: var(--muted); }
	.cap {
		display: flex;
		align-items: center;
		padding: 0 10px;
		font: 500 12px var(--font-ui);
		color: var(--muted);
		background: var(--well-2);
		border-left: 1px solid var(--line);
		white-space: nowrap;
	}
	.warn { display: grid; justify-items: start; gap: 2px; font: 500 12px/1.4 var(--font-ui); color: var(--warn); }
	/* the fix reads as a link-style action (CopyButton's quiet look), its label lined up with the warning text */
	.warn .btn { margin-left: -12px; color: var(--blue); }
	@media (max-width: 420px) { .box { flex-wrap: wrap; } }
</style>

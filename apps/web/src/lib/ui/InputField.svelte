<script lang="ts">
	import type { FullAutoFill, HTMLInputAttributes } from 'svelte/elements';
	import FieldFrame from './input/FieldFrame.svelte';
	import { describedBy } from './input/field';

	/**
	 * Input 01 · Primer field — the form default for single-line text (name,
	 * email, phone). Same box, label and 32px height as Select 01, so the two
	 * sit side by side in one form column.
	 */
	interface Props {
		label: string;
		value?: string;
		type?: 'text' | 'email' | 'tel' | 'url';
		placeholder?: string;
		hint?: string | null;
		error?: string | null;
		optional?: boolean;
		required?: boolean;
		disabled?: boolean;
		readonly?: boolean;
		maxlength?: number;
		autocomplete?: FullAutoFill | null;
		name?: string;
		/** Fixed id, so the page can focus the field; generated when omitted. */
		id?: string;
		inputmode?: HTMLInputAttributes['inputmode'];
		/** Off for paths and codes, so they don't get underlined as typos. */
		spellcheck?: boolean;
		/** Keep the label for screen readers only (a field inline beside its button). */
		hideLabel?: boolean;
		/** The input element, for focus and select. */
		input?: HTMLInputElement;
		oninput?: (value: string) => void;
		onchange?: (value: string) => void;
		onkeydown?: (e: KeyboardEvent) => void;
		onblur?: () => void;
	}

	let {
		label,
		value = $bindable(''),
		type = 'text',
		placeholder,
		hint,
		error,
		optional = false,
		required = false,
		disabled = false,
		readonly = false,
		maxlength,
		autocomplete,
		name,
		id: fixedId,
		inputmode,
		spellcheck,
		hideLabel = false,
		input = $bindable(),
		oninput,
		onchange,
		onkeydown,
		onblur,
	}: Props = $props();

	const autoId = $props.id();
	const id = $derived(fixedId ?? autoId);
	const left = $derived(maxlength === undefined ? Infinity : maxlength - value.length);
</script>

<FieldFrame {id} {label} {hint} {error} {optional} {hideLabel}>
	{#snippet meta()}
		{#if maxlength !== undefined && left <= 10}<span class:full={left <= 0}>{value.length} / {maxlength}</span>{/if}
	{/snippet}
	<input
		bind:this={input}
		{id}
		class="in"
		{type}
		{name}
		{placeholder}
		{required}
		{disabled}
		{readonly}
		{maxlength}
		{autocomplete}
		{inputmode}
		{spellcheck}
		aria-invalid={error ? true : undefined}
		aria-describedby={describedBy(id, { hint, error })}
		bind:value
		oninput={() => oninput?.(value)}
		onchange={() => onchange?.(value)}
		{onkeydown}
		onblur={() => onblur?.()}
	/>
</FieldFrame>

<style>
	.in {
		width: 100%;
		min-height: var(--field-h, 32px);
		padding: 5px 12px;
		font: 400 var(--field-font, 14px) var(--font-ui);
		color: var(--ink);
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		caret-color: var(--blue);
	}
	.in::placeholder { color: var(--muted); }
	.in:focus { outline: none; background: var(--surface); border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.in[aria-invalid='true'] { border-color: var(--bad); }
	.in:read-only:not(:disabled):focus { background: var(--well); border-color: var(--line-strong); box-shadow: none; }
	.in:disabled { opacity: 0.55; cursor: not-allowed; }
	.full { color: var(--warn); }
</style>

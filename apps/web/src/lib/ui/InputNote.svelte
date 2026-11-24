<script lang="ts">
	import type { Snippet } from 'svelte';
	import FieldFrame from './input/FieldFrame.svelte';
	import { describedBy } from './input/field';

	/**
	 * Input 05 · Note box — several lines: notes, limitations, a reject reason.
	 * A Primer comment box: the textarea grows from `rows` up to `maxRows`,
	 * then scrolls; a foot strip under a hairline carries the hint and the
	 * `n / max` count.
	 */
	interface Props {
		label: string;
		value?: string;
		placeholder?: string;
		hint?: string | null;
		error?: string | null;
		optional?: boolean;
		rows?: number;
		maxRows?: number;
		maxlength?: number;
		disabled?: boolean;
		readonly?: boolean;
		name?: string;
		/** Fixed id, so the page can focus the box; generated when omitted. */
		id?: string;
		/** Keep the label for screen readers only (an inline reply box). */
		hideLabel?: boolean;
		/** Mono body, for text pasted into a prompt as written (rules, templates). */
		mono?: boolean;
		/** Right side of the label row: a save state, a count. */
		meta?: Snippet;
		oninput?: (value: string) => void;
		onkeydown?: (e: KeyboardEvent) => void;
		onblur?: () => void;
	}

	let {
		label,
		value = $bindable(''),
		placeholder,
		hint,
		error,
		optional = false,
		rows = 3,
		maxRows = 10,
		maxlength,
		disabled = false,
		readonly = false,
		name,
		id: fixedId,
		hideLabel = false,
		mono = false,
		meta,
		oninput,
		onkeydown,
		onblur,
	}: Props = $props();

	const autoId = $props.id();
	const id = $derived(fixedId ?? autoId);
	const PAD = 16;
	let el = $state<HTMLTextAreaElement>();

	/** Grow to fit the text from `rows` up to `maxRows`, then scroll. Measured, so it works without `field-sizing`. */
	function fit() {
		if (!el) return;
		const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
		el.style.minHeight = `${rows * line + PAD}px`;
		el.style.height = 'auto';
		const max = maxRows * line + PAD;
		el.style.height = `${Math.min(el.scrollHeight, max)}px`;
		el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
	}

	// Refit when the value changes from outside, and once on mount.
	$effect(() => {
		void value;
		fit();
	});
</script>

<FieldFrame {id} {label} {error} {optional} {hideLabel} {meta}>
	<div class="box" class:bad={!!error} class:off={disabled} class:ro={readonly}>
		<textarea
			bind:this={el}
			{id}
			class="ta"
			class:mono
			{name}
			{rows}
			{placeholder}
			{maxlength}
			{disabled}
			{readonly}
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy(id, { hint, error })}
			bind:value
			oninput={() => (fit(), oninput?.(value))}
			{onkeydown}
			onblur={() => onblur?.()}
		></textarea>
		{#if hint || maxlength !== undefined}
			<div class="foot">
				{#if hint}<span id="{id}-hint">{hint}</span>{/if}
				{#if maxlength !== undefined}<span class="cnt" class:full={value.length >= maxlength}>{value.length} / {maxlength}</span>{/if}
			</div>
		{/if}
	</div>
</FieldFrame>

<style>
	.box {
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}
	.box:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.box.ro:focus-within { border-color: var(--line-strong); box-shadow: none; }
	.box.bad { border-color: var(--bad); }
	.box.off { opacity: 0.55; }
	.ta {
		display: block;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 400 var(--field-font, 14px)/var(--field-lh, 20px) var(--font-ui);
		caret-color: var(--blue);
		resize: none;
		overflow-y: hidden;
	}
	.ta.mono { font: 400 var(--field-font, 12px)/var(--field-lh, 20px) var(--font-mono); }
	.ta::placeholder { color: var(--muted); }
	.ta:focus { outline: none; }
	.box:not(.ro):focus-within .ta { background: var(--surface); }
	.ta:disabled { cursor: not-allowed; }
	.foot {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		padding: 5px 12px;
		border-top: 1px solid var(--line-soft);
		font: 400 12px/1.4 var(--font-ui);
		color: var(--muted);
	}
	.cnt { margin-left: auto; font-family: var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
	.full { color: var(--warn); }
</style>

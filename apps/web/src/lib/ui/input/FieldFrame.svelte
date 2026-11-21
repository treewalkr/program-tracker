<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The shared label row and message line for the text-input family. Same
	 * 12px/500 label and 4px gap as the select family's `.lbl`, so a form
	 * column reads as one shape. The error line replaces the hint.
	 */
	interface Props {
		/** The control's id; the label points at it and the messages hang off it. */
		id: string;
		label: string;
		hint?: string | null;
		error?: string | null;
		optional?: boolean;
		/** Keep the label for screen readers only (table cells under a column head). */
		hideLabel?: boolean;
		/** Right side of the label row (counts). */
		meta?: Snippet;
		children: Snippet;
	}

	let { id, label, hint, error, optional = false, hideLabel = false, meta, children }: Props = $props();
</script>

<div class="field">
	<div class="row" class:sr-only={hideLabel}>
		<label class="lbl" id="{id}-l" for={id}>{label}{#if optional}{' '}<span class="opt">optional</span>{/if}</label>
		{#if meta}<span class="meta">{@render meta()}</span>{/if}
	</div>
	{@render children()}
	{#if error}
		<p class="msg err" id="{id}-err">{error}</p>
	{:else if hint}
		<p class="msg hint" id="{id}-hint">{hint}</p>
	{/if}
</div>

<style>
	/* relative: keeps sr-only labels and live regions inside scrolling tables */
	.field { position: relative; display: grid; gap: 4px; min-width: 0; }
	.row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
	.lbl { font: 500 12px var(--font-ui); color: var(--ink); }
	.opt { font-weight: 400; color: var(--muted); }
	.meta { font: 400 12px var(--font-mono); font-variant-numeric: tabular-nums; color: var(--muted); }
	.msg { margin: 0; }
	.hint { font: 400 12px/1.4 var(--font-ui); color: var(--muted); }
	.err { font: 500 13px/1.5 var(--font-ui); color: var(--bad); }
</style>

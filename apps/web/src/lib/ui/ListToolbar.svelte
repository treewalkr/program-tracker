<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The row above every list (DESIGN.md › Lists): search → filters/tabs →
	 * sort → result count. Bind `value` to the list state's debounced
	 * `search`; pass filters and sort as the `filters` snippet in that order.
	 * The count is a polite live region, so screen readers hear new totals.
	 */
	interface Props {
		value: string;
		/** Accessible name and placeholder ("Search clients"). */
		label: string;
		placeholder?: string;
		/** Keyboard shortcut drawn inside the box (the page wires the key). */
		kbd?: string;
		/** Result count ("3 of 19"); omit when nothing narrows the list. */
		count?: string;
		filters?: Snippet;
		/** The search input, for focus shortcuts. */
		input?: HTMLInputElement;
	}

	let { value = $bindable(), label, placeholder = label, kbd, count, filters, input = $bindable() }: Props = $props();
</script>

<div class="list-toolbar" role="search">
	<div class="search" class:has-kbd={kbd}>
		<input bind:this={input} class="input" type="search" {placeholder} aria-label={label} bind:value />
		{#if kbd}<kbd aria-hidden="true">{kbd}</kbd>{/if}
	</div>
	{@render filters?.()}
	<span class="count" role="status">{count ?? ''}</span>
</div>

<style>
	.list-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	.search {
		position: relative;
		flex: 1 1 240px;
		max-width: 320px;
	}
	.search .input {
		width: 100%;
	}
	.has-kbd .input {
		padding-right: 36px;
	}
	kbd {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
		font: 500 11px/1 var(--font-mono);
		padding: 2px 5px;
		border: 1px solid var(--line);
		border-bottom-width: 2px;
		border-radius: 4px;
		background: var(--surface);
		color: var(--muted);
	}
	.count {
		margin-left: auto;
		font-size: 13px;
		color: var(--muted);
		white-space: nowrap;
	}
	@container main (max-width: 700px) {
		.search {
			max-width: none;
			flex-basis: 100%;
		}
	}
</style>

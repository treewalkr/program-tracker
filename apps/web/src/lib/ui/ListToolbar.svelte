<script lang="ts">
	import type { Snippet } from 'svelte';
	import InputSearch from './InputSearch.svelte';

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
	<div class="search">
		<InputSearch {label} {placeholder} shortcut={kbd} bind:value bind:input />
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

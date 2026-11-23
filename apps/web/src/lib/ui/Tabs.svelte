<script lang="ts">
	import Counter from './Counter.svelte';
	import Skeleton from './Skeleton.svelte';
	import { tabKeyTarget, tabStop } from './tabKeys';
	/**
	 * Orange-underline tabs over the global `.tabs` styles. Buttons get
	 * `id="{idPrefix}-{tabId}"` and point at `panel-{tabId}` panels —
	 * render matching `role="tabpanel" aria-labelledby` panels yourself.
	 *
	 * Keyboard (WAI-ARIA tabs): one tab stop on the selected tab; arrows move
	 * between tabs (wrapping), Home/End jump to the ends, disabled tabs are
	 * skipped. `activation="auto"` selects as focus moves; `"manual"` waits for
	 * Enter/Space — use it when switching tabs navigates or is expensive.
	 */
	interface TabItem {
		id: string;
		label: string;
		/** Counter pill citing the tab's evidence ("8 wks"). */
		count?: string;
		disabled?: boolean;
	}

	interface Props {
		items: TabItem[];
		value: string;
		onchange?: (id: string) => void;
		/** Accessible name for the tablist. */
		label?: string;
		idPrefix?: string;
		/** Counts still loading: each `count` only sizes a shimmering pill. */
		loadingCounts?: boolean;
		/** Arrow keys select (`auto`, default) or only move focus (`manual`). */
		activation?: 'auto' | 'manual';
	}

	let {
		items,
		value,
		onchange,
		label,
		idPrefix = 'tab',
		loadingCounts = false,
		activation = 'auto',
	}: Props = $props();

	const buttons: HTMLButtonElement[] = $state([]);
	const stop = $derived(tabStop(items, value));

	function onkeydown(e: KeyboardEvent, from: number) {
		const to = tabKeyTarget(items, from, e.key);
		if (to === null) return;
		e.preventDefault();
		buttons[to]?.focus();
		if (activation === 'auto') onchange?.(items[to].id);
	}
</script>

<div class="tabs" role="tablist" aria-label={label}>
	{#each items as t, i (t.id)}
		<button
			bind:this={buttons[i]}
			type="button"
			id={`${idPrefix}-${t.id}`}
			role="tab"
			class:on={value === t.id}
			aria-selected={value === t.id}
			aria-controls={`panel-${t.id}`}
			tabindex={stop === t.id ? 0 : -1}
			disabled={t.disabled}
			onclick={() => onchange?.(t.id)}
			onkeydown={(e) => onkeydown(e, i)}
		>
			{t.label}
			{#if t.count && loadingCounts}<Skeleton shape="round" h="18px" w={`${t.count.length * 6 + 18}px`} />
			{:else if t.count}<Counter value={t.count} />{/if}
		</button>
	{/each}
</div>

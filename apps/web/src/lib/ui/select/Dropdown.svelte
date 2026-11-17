<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The one open-list panel every select shares: a relative anchor, the trigger,
	 * and a hairline popover underneath. Closes on outside press and Esc.
	 */
	interface Props {
		open?: boolean;
		trigger: Snippet;
		children: Snippet;
		/** Shrink-wrap the trigger instead of filling the column. */
		inline?: boolean;
		/** Widest the anchor may grow when it fills the column. */
		maxWidth?: string;
		/** Panel width; defaults to at least the trigger width. */
		panelWidth?: string;
	}

	let { open = $bindable(false), trigger, children, inline = false, maxWidth = '300px', panelWidth }: Props = $props();

	let root = $state<HTMLDivElement>();

	function outside(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !open) return;
		e.stopPropagation();
		open = false;
		root?.querySelector<HTMLElement>('button:not([tabindex="-1"]), input')?.focus();
	}
</script>

<svelte:window onpointerdown={outside} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dd" class:inline bind:this={root} style:max-width={inline ? undefined : maxWidth} {onkeydown}>
	{@render trigger()}
	{#if open}
		<div class="pop" style:width={panelWidth}>{@render children()}</div>
	{/if}
</div>

<style>
	.dd { position: relative; width: 100%; }
	.dd.inline { display: inline-block; width: auto; }
	.pop {
		position: absolute;
		z-index: 30;
		top: 100%;
		left: 0;
		margin-top: 4px;
		min-width: 100%;
		width: max-content;
		max-width: min(360px, 90vw);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow-overlay);
		overflow: hidden;
	}
</style>

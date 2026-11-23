<script lang="ts">
	/**
	 * `‹ Back` for the home-screen app, which has no browser toolbar. A click
	 * returns to the page the user came from (skipping this page's hash and
	 * query entries, never onto sign-in); with no such page it follows `fallback`,
	 * the page's parent. Modifier-clicks open `fallback` like any link.
	 */
	import Icon from "./Icon.svelte";
	import { goBack } from "$lib/nav/back.svelte";

	let { fallback, label = "Back" }: { fallback: string; label?: string } = $props();

	function onclick(e: MouseEvent) {
		if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		goBack(fallback);
	}
</script>

<a class="back" href={fallback} {onclick}><Icon name="chevron" /><span>{label}</span></a>

<style>
	/* A 28px line (the menu toggle's), with a 44px touch target around it. */
	.back {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		max-width: 100%;
		height: 28px;
		margin-left: -6px;
		padding: 0 6px;
		border-radius: 6px;
		font: 500 16px/1 var(--font-ui);
		color: var(--blue);
		vertical-align: middle;
	}
	.back::before { content: ""; position: absolute; inset: -8px; }
	.back span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.back:hover { background: var(--well-2); }
	.back:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
	.back :global(svg) { flex: none; width: 16px; height: 16px; transform: rotate(90deg); }
</style>

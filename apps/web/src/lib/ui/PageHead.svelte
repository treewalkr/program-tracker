<script lang="ts">
	import type { Snippet } from 'svelte';
	import Crumbs from './Crumbs.svelte';

	/**
	 * Page opener: optional crumbs, headline (+ optional suffix snippet for
	 * status pills), `.sub` context line, and right-aligned actions.
	 */
	interface Crumb {
		href?: string;
		label: string;
	}

	interface Props {
		title: string;
		sub?: string;
		crumbs?: Crumb[];
		/** Inline suffix inside the h1 (e.g. a StatusPill). */
		titleSuffix?: Snippet;
		actions?: Snippet;
	}

	let { title, sub, crumbs, titleSuffix, actions }: Props = $props();
</script>

{#if crumbs}<Crumbs items={crumbs} />{/if}
<div class="page-head">
	<div class="head-text">
		<h1>
			{title}
			{@render titleSuffix?.()}
		</h1>
		{#if sub}<p class="sub">{sub}</p>{/if}
	</div>
	{#if actions}<div class="head-actions">{@render actions()}</div>{/if}
</div>

<style>
	/* Title + context line wrap inside their own box, so actions keep the
	   top-right slot instead of dropping to an orphaned row. */
	.head-text {
		flex: 1 1 0;
		min-width: min(14rem, 100%);
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 16px;
	}
	.sub { margin: 0; }
	h1 {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
</style>

<script lang="ts">
	/**
	 * Breadcrumb trail. The last item without an `href` renders as the plain
	 * current segment ("Client / Log session").
	 *
	 * Phones and the home-screen app (no browser toolbar there) show `‹ Back`
	 * in its place instead: back to where the user came from, else to the last
	 * linked crumb. A CSS switch, so the server render already shows the right one.
	 */
	import BackButton from "./BackButton.svelte";

	interface Crumb {
		href?: string;
		label: string;
	}

	let { items = [] }: { items?: Crumb[] } = $props();

	const parent = $derived(items.findLast((c) => c.href)?.href);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<p class="crumbs" class:compact={!!parent}>
	<span class="trail">
		{#each items as c, i (i)}
			{#if i > 0}<span class="sep" aria-hidden="true">{" / "}</span>{/if}
			{#if c.href}<a href={c.href}>{c.label}</a>{:else}{c.label}{/if}
		{/each}
	</span>
	{#if parent}<span class="back"><BackButton fallback={parent} /></span>{/if}
</p>

<style>
	.crumbs {
		margin: 0 0 4px;
		font-size: 13px;
		color: var(--faint);
	}
	.crumbs a:hover { text-decoration: underline; }
	.back { display: none; }
	@media (max-width: 860px), (display-mode: standalone) {
		.compact .trail { display: none; }
		.compact .back { display: flex; } /* a 28px box: rides the menu toggle's line exactly */
	}
</style>

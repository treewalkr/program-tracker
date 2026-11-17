<script lang="ts">
	import Skeleton from './Skeleton.svelte';

	/**
	 * Page-head stand-in for pages whose head comes from data (a client's
	 * name, a program's): crumbs, headline and context line at the real
	 * type metrics, plus button-sized action slots. Pass `title` / `sub`
	 * when they are static — they render as real text and only the data
	 * (the crumb's client name, the action buttons) shimmers.
	 */
	interface Props {
		crumbs?: boolean;
		/** Leading avatar (client header). */
		avatar?: boolean;
		/** Action-button slots on the right: a count, or each slot's CSS width. */
		actions?: number | string[];
		/** Tab strip under the head (number of tabs). */
		tabs?: number;
		/** Static headline: real text instead of a shimmer. */
		title?: string;
		/** Static context line (with `title`). */
		sub?: string;
		/** Shimmering context lines under the title (avatar header's meta); 0 = one line beside the title. */
		meta?: number;
		label?: string;
	}

	let {
		crumbs = true,
		avatar = false,
		actions = 0,
		tabs = 0,
		title,
		sub,
		meta = 0,
		label = 'Loading…'
	}: Props = $props();
	const TAB_W = ['64px', '48px', '56px', '60px', '52px'];
	const ACTION_W = ['104px', '72px', '118px', '160px'];
	const META_W = ['min(420px, 90%)', 'min(300px, 70%)', 'min(360px, 80%)'];
	const actionWidths = $derived(
		typeof actions === 'number'
			? Array.from({ length: actions }, (_, i) => ACTION_W[(actions - 1 - i) % ACTION_W.length])
			: actions
	);
</script>

<div class="skel-head" aria-busy="true">
	<span class="sr-only" role="status">{label}</span>
	{#if crumbs}<div class="skel-crumbs"><Skeleton shape="line" h="12px" w="128px" /></div>{/if}
	<div class="page-head">
		{#if avatar}<Skeleton shape="round" w="44px" h="44px" />{/if}
		{#if title}
			<div class="skel-title is-text">
				<h1>{title}</h1>
				{#if sub}<p class="sub">{sub}</p>{/if}
			</div>
		{:else if meta > 0}
			<div class="skel-title is-stacked">
				<span class="skel-h1"><Skeleton shape="line" h="20px" w="min(240px, 70%)" /></span>
				{#each { length: meta }, i (i)}
					<span class="skel-meta"><Skeleton shape="line" h="11px" w={META_W[i % META_W.length]} /></span>
				{/each}
			</div>
		{:else}
			<div class="skel-title">
				<Skeleton shape="line" h="20px" w="min(240px, 70%)" />
				<Skeleton shape="line" h="11px" w="min(420px, 90%)" />
			</div>
		{/if}
		{#if actionWidths.length > 0}
			<div class="head-actions">
				{#each actionWidths as w, i (i)}
					<Skeleton h="26px" {w} />
				{/each}
			</div>
		{/if}
	</div>
	{#if tabs > 0}
		<div class="tabs skel-tabs">
			{#each { length: tabs }, i (i)}<Skeleton shape="line" h="12px" w={TAB_W[i % TAB_W.length]} />{/each}
		</div>
	{/if}
</div>

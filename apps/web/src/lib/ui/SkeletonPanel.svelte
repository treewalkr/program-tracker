<script lang="ts">
	import type { Snippet } from 'svelte';
	import Skeleton from './Skeleton.svelte';
	import SkeletonRows from './SkeletonRows.svelte';

	/**
	 * The loading state of a Panel. Static chrome stays real — pass the
	 * panel's own `title` and the head renders as it will once loaded —
	 * and only the data shimmers: `rows` for a Box list (default), `height`
	 * for a chart or grid block, or `children` for a bespoke body.
	 */
	interface Props {
		title?: string;
		/** Head whose title comes from data: a shimmering title line. */
		head?: boolean;
		rows?: number;
		/** Block body of this height (px) instead of rows. */
		height?: number;
		avatar?: number;
		/** Counter-pill slot beside the title. */
		count?: boolean;
		trail?: boolean;
		dense?: boolean;
		/** Announced to screen readers while loading. */
		label?: string;
		class?: string;
		children?: Snippet;
	}

	let {
		title,
		head = false,
		rows = 4,
		height,
		avatar,
		count = false,
		trail,
		dense,
		label = 'Loading…',
		class: cls,
		children
	}: Props = $props();
</script>

<section class={['panel', cls]} aria-busy="true">
	{#if title || head}
		<div class="panel-head">
			{#if title}<h2>{title}</h2>{:else}<Skeleton shape="line" h="12px" w="132px" />{/if}
			{#if count}<Skeleton shape="round" w="28px" h="18px" />{/if}
		</div>
	{/if}
	<span class="sr-only" role="status">{label}</span>
	{#if children}
		{@render children()}
	{:else if height}
		<div class="panel-body"><Skeleton h={`${height}px`} /></div>
	{:else}
		<SkeletonRows {rows} {avatar} {trail} {dense} />
	{/if}
</section>

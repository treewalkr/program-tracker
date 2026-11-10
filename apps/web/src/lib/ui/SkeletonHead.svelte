<script lang="ts">
	import Skeleton from './Skeleton.svelte';

	/**
	 * Page-head stand-in for pages whose title comes from data (a client's
	 * name, a program's): crumbs, headline and context line at the real
	 * type metrics, plus button-sized action slots. Pages with a static
	 * title render the real PageHead instead.
	 */
	interface Props {
		crumbs?: boolean;
		/** Leading avatar (client header). */
		avatar?: boolean;
		/** Number of action-button slots on the right. */
		actions?: number;
		/** Tab strip under the head (number of tabs). */
		tabs?: number;
		label?: string;
	}

	let { crumbs = true, avatar = false, actions = 0, tabs = 0, label = 'Loading…' }: Props = $props();
	const TAB_W = ['64px', '48px', '56px', '60px', '52px'];
	const ACTION_W = ['104px', '72px', '118px', '160px'];
</script>

<div class="skel-head" aria-busy="true">
	<span class="sr-only" role="status">{label}</span>
	{#if crumbs}<div class="skel-crumbs"><Skeleton shape="line" h="12px" w="128px" /></div>{/if}
	<div class="page-head">
		{#if avatar}<Skeleton shape="round" w="44px" h="44px" />{/if}
		<div class="skel-title">
			<Skeleton shape="line" h="20px" w="min(240px, 70%)" />
			<Skeleton shape="line" h="11px" w="min(420px, 90%)" />
		</div>
		{#if actions > 0}
			<div class="head-actions">
				{#each { length: actions }, i (i)}
					<Skeleton h="32px" w={ACTION_W[(actions - 1 - i) % ACTION_W.length]} />
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

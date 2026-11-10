<script lang="ts">
	import Skeleton from './Skeleton.svelte';

	/**
	 * Box-list stand-in: N hairline-separated rows of a title line over a
	 * shorter meta line, with an optional avatar and trailing figure. Line
	 * widths walk a fixed ragged pattern so the list reads as text, not bars.
	 */
	interface Props {
		rows?: number;
		/** Leading circle, sized like the row's real avatar. */
		avatar?: number;
		/** Short right-aligned figure (counts, dates, buttons). */
		trail?: boolean;
		/** Single-line rows (no meta line). */
		dense?: boolean;
	}

	let { rows = 4, avatar, trail = true, dense = false }: Props = $props();

	const TITLE = ['38%', '52%', '31%', '46%', '41%', '57%'];
	const META = ['64%', '48%', '58%', '40%', '70%', '52%'];
</script>

<ul class="skel-rows" aria-hidden="true">
	{#each { length: rows }, i (i)}
		<li>
			{#if avatar}<Skeleton shape="round" w={`${avatar}px`} h={`${avatar}px`} />{/if}
			<span class="skel-text">
				<Skeleton shape="line" h="12px" w={TITLE[i % TITLE.length]} />
				{#if !dense}<Skeleton shape="line" h="9px" w={META[i % META.length]} />{/if}
			</span>
			{#if trail}<Skeleton shape="line" h="10px" w="48px" />{/if}
		</li>
	{/each}
</ul>

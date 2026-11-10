<script lang="ts">
	import Skeleton from '$lib/ui/Skeleton.svelte';

	/** WeekGrid's loading state: client column + seven day cells per row, at the grid's real metrics. */
	let { rows = 3 }: { rows?: number } = $props();
	const NAME = ['62%', '78%', '54%', '70%'];
	const FILLED = [
		[1, 0, 1, 0, 1, 0, 0],
		[0, 1, 0, 1, 0, 1, 0],
		[1, 0, 0, 1, 0, 0, 1],
		[0, 1, 1, 0, 1, 0, 0]
	];
</script>

<div class="wgs" aria-hidden="true">
	<div class="tr head">
		<span></span>
		{#each { length: 7 }, d (d)}<span class="day"><Skeleton shape="line" h="9px" w="22px" /></span>{/each}
	</div>
	{#each { length: rows }, r (r)}
		<div class="tr">
			<span class="who">
				<Skeleton shape="line" h="12px" w={NAME[r % NAME.length]} />
				<Skeleton shape="line" h="9px" w="44%" />
			</span>
			{#each FILLED[r % FILLED.length] as on, d (d)}
				<span class="cell">
					{#if on}<Skeleton h="40px" class="wgs-cell" />{:else}<span class="off"></span>{/if}
				</span>
			{/each}
		</div>
	{/each}
</div>

<style>
	.wgs { padding: 8px 16px 12px; container: wgs / inline-size; }
	.tr {
		display: grid;
		grid-template-columns: minmax(110px, 180px) repeat(7, minmax(0, 1fr));
		column-gap: 4px;
		align-items: center;
	}
	.tr + .tr:not(.head) { border-top: 1px solid var(--line-soft); }
	.head .day { display: flex; justify-content: center; padding: 6px 0 8px; }
	.who { display: grid; gap: 6px; padding: 8px 4px; }
	.cell { display: flex; justify-content: center; padding: 6px 0; }
	.cell :global(.wgs-cell) { width: 100%; max-width: 76px; border-radius: 4px; }
	.off { width: 100%; max-width: 76px; height: 40px; }
	@container wgs (max-width: 520px) {
		.tr { grid-template-columns: repeat(7, minmax(0, 1fr)); column-gap: 1px; }
		.head > span:first-child { display: none; }
		.who { grid-column: 1 / -1; padding: 10px 2px 2px; }
	}
</style>

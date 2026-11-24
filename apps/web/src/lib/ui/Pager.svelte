<script lang="ts">
	import SelectPrefixed from './SelectPrefixed.svelte';
	import { PAGE_LIMITS, pageRange } from '@pt/shared';

	/**
	 * Panel-foot pager for every list (DESIGN.md › Lists): row range, a rows-per-page
	 * select, Previous / Next, and "Page 2 of 3" when there's room. Hidden while the
	 * whole list fits the smallest page. Paging on the server or in the browser
	 * looks the same — the page owns the data, this owns the controls.
	 */
	interface Props {
		/** 1-based; clamped for display. */
		page: number;
		limit: number;
		total: number;
		limits?: readonly number[];
		onpage: (page: number) => void;
		onlimit?: (limit: number) => void;
		/** What a row is, for the select's label ("Clients per page"). */
		noun?: string;
	}

	let { page, limit, total, limits = PAGE_LIMITS, onpage, onlimit, noun = 'Rows' }: Props = $props();

	const range = $derived(pageRange(page, limit, total));
	const shown = $derived(total > Math.min(...limits));
</script>

{#if shown}
	<nav class="pager" aria-label="Pagination">
		<span class="range" aria-live="polite">
			<span class="fig">{range.from}–{range.to}</span> of <span class="fig">{total}</span>
		</span>
		{#if onlimit}
			<span class="per">
				<SelectPrefixed
					prefix="Rows"
					options={limits.map((n) => ({ value: String(n), label: String(n) }))}
					value={String(limit)}
					onchange={(n) => onlimit(Number(n))}
				/>
			</span>
		{/if}
		<span class="of">Page <span class="fig">{range.page}</span> of <span class="fig">{range.pages}</span></span>
		<div class="steps">
			<button type="button" class="btn small" disabled={range.page <= 1} onclick={() => onpage(range.page - 1)}>
				Previous
			</button>
			<button type="button" class="btn small" disabled={range.page >= range.pages} onclick={() => onpage(range.page + 1)}>
				Next
			</button>
		</div>
	</nav>
{/if}

<style>
	.pager {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		padding: 10px 16px;
		border-top: 1px solid var(--line);
		font-size: 13px;
		color: var(--muted);
	}
	.fig {
		font: 500 12px var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	.range {
		margin-right: auto;
	}
	.steps {
		display: flex;
		gap: 8px;
	}
	/* "Page 2 of 3" only where there's room; Previous/Next carry it on phones. */
	@container main (max-width: 700px) {
		.of {
			display: none;
		}
	}
</style>

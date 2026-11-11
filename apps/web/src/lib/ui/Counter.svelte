<script module lang="ts">
	/** One part of a split counter; no tone = the neutral Counter. */
	export interface CounterPart {
		text: string;
		tone?: 'bad' | 'warn';
	}
</script>

<script lang="ts">
	/**
	 * Count pill beside a heading or tab — cites the evidence behind it
	 * ("9 of 12 logged", "8 wks"). Counts are labels, not figures, so they
	 * don't take the mono/tabular treatment. A `tone` turns it into the
	 * matching Primer Label (`.pill.bad` / `.pill.warn`) when the count is a
	 * call to act ("2 missed"). An array of parts draws one pill per part,
	 * each in its own tone ("2 missed" red beside "17 due today" neutral);
	 * screen readers hear the parts as one phrase.
	 */
	let { value, tone }: { value: string | number | CounterPart[]; tone?: 'bad' | 'warn' } = $props();
</script>

{#if Array.isArray(value)}
	<span class="counts">
		<span class="sr-only">{value.map((p) => p.text).join(', ')}</span>
		{#each value as p (p.text)}
			<span class={p.tone ? ['pill', p.tone] : 'counter'} aria-hidden="true">{p.text}</span>
		{/each}
	</span>
{:else}
	<span class={tone ? ['pill', tone] : 'counter'}>{value}</span>
{/if}

<style>
	.counts {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}
</style>

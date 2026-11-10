<script lang="ts">
	/**
	 * Count pill beside a heading or tab — cites the evidence behind it
	 * ("9 of 12 logged", "8 wks"). Counts are labels, not figures, so they
	 * don't take the mono/tabular treatment. A `tone` turns it into the
	 * matching Primer Label (`.pill.bad` / `.pill.warn`) when the count is a
	 * call to act ("2 missed").
	 */
	let { value, tone }: { value: string | number; tone?: 'bad' | 'warn' } = $props();
</script>

<span class={tone ? ['pill', tone] : 'counter'}>{value}</span>

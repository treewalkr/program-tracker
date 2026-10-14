<script lang="ts">
	import ToggleChip from '$lib/ui/ToggleChip.svelte';

	/** ISO weekday toggles: 1=Mon … 7=Sun. Bindable — sorted on toggle. */
	let { days = $bindable() }: { days: number[] } = $props();

	const LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	function toggle(d: number) {
		days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
	}
</script>

<div class="wd-row" role="group" aria-label="Training weekdays">
	{#each LABELS as label, i (label)}
		<ToggleChip on={days.includes(i + 1)} onclick={() => toggle(i + 1)}>{label}</ToggleChip>
	{/each}
</div>

<style>
	.wd-row {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
</style>

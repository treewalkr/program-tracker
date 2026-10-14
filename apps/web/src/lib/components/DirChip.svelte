<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Periodization directive chip — neutral pill recolored per directive:
	 * +volume green, +intensity amber, transition blue; base/deload/test
	 * stay neutral. Children carry the label (e.g. "W3 +volume").
	 */
	let { directive, children }: { directive: string; children?: Snippet } = $props();

	const TONE: Record<string, string> = {
		'+volume': 'vol',
		'+intensity': 'int',
		transition: 'tr',
	};
	const tone = $derived(TONE[directive] ?? '');
</script>

<span class="dir {tone}">{@render children?.()}</span>

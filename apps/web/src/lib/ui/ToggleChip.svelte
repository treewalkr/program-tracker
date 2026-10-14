<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Hairline pill that inverts to Inverted Ink when selected. Controlled:
	 * the parent owns state (`on`) and toggles in `onclick`.
	 */
	interface Props {
		on?: boolean;
		onclick?: () => void;
		children?: Snippet;
	}

	let { on = false, onclick, children }: Props = $props();
</script>

<button type="button" class="tchip" class:on aria-pressed={on} onclick={() => onclick?.()}>
	{@render children?.()}
</button>

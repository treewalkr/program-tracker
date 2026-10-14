<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Flash/notice note — colored ink on its soft tint, hairline edge, 6px
	 * radius (Ink-on-Tint Rule). Never a saturated fill.
	 */
	type Tone = 'ok' | 'bad' | 'warn';

	interface Props {
		tone?: Tone;
		/** e.g. role="note" or role="status" for live announcements. */
		role?: string;
		children?: Snippet;
	}

	let { tone = 'ok', role, children }: Props = $props();
</script>

<div class="note {tone}" {role}>{@render children?.()}</div>

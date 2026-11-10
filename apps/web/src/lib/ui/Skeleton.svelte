<script lang="ts">
	/**
	 * Loading placeholder. `block` (default) stands in for a box or chart,
	 * `line` for a line of text, `round` for an avatar or pill. Purely
	 * decorative — wrap groups in SkeletonPanel / SkeletonHead, which carry
	 * the busy state for assistive tech.
	 */
	interface Props {
		/** CSS size, e.g. "80px" or "40%". */
		w?: string;
		h?: string;
		shape?: 'block' | 'line' | 'round';
		class?: string;
	}

	let { w, h, shape = 'block', class: cls }: Props = $props();
</script>

<span
	class={['skeleton', shape !== 'block' && shape, cls]}
	style:width={w}
	style:height={h ?? (shape === 'line' ? '10px' : undefined)}
	aria-hidden="true"
></span>

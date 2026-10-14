<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Primer Box: canvas-white surface on a hairline border, 6px radius.
	 * Optional well head (title + evidence counter + right-aligned `act`
	 * snippet). Body content is passed through as-is — wrap tables in
	 * `<div class="panel-body tight">` yourself.
	 */
	interface Props {
		title?: string;
		/** Evidence counter next to the title ("9 of 12 logged"). */
		count?: string | number;
		/** Right-aligned head content — render `<a class="act">` inside. */
		act?: Snippet;
		children?: Snippet;
		/** Extra classes (e.g. layout variants). */
		class?: string;
	}

	let { title, count, act, children, class: cls }: Props = $props();
</script>

<section class={['panel', cls]}>
	{#if title || act}
		<div class="panel-head">
			{#if title}<h2>{title}</h2>{/if}
			{#if count}<span class="counter">{count}</span>{/if}
			{@render act?.()}
		</div>
	{/if}
	{@render children?.()}
</section>

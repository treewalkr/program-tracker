<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Form field wrapper: label (+ optional subtle hint suffix), the control
	 * via children, and an error line. The control itself stays a plain
	 * `.input` / `.select` / `.textarea` element.
	 */
	interface Props {
		label: string;
		/** Links the label to the control's id. */
		htmlFor?: string;
		/** Subtle suffix inside the label ("— drives the weekly plan grid"). */
		hint?: string;
		error?: string;
		children: Snippet;
	}

	let { label, htmlFor, hint, error, children }: Props = $props();
</script>

<div>
	{#if htmlFor}
		<label class="label" for={htmlFor}>
			{label}{#if hint} <span class="subtle">— {hint}</span>{/if}
		</label>
	{:else}
		<span class="label">
			{label}{#if hint} <span class="subtle">— {hint}</span>{/if}
		</span>
	{/if}
	{@render children()}
	{#if error}<p class="err" role="alert">{error}</p>{/if}
</div>

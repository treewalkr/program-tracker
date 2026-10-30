<script lang="ts">
	import Button from '$lib/ui/Button.svelte';

	/** One-tap copy for client-facing text (paste into LINE by hand).
	 *  "Copy" → "Copied ✓" for 2 s; failures surface the error in place. */
	interface Props {
		text: string;
		label?: string;
	}

	let { text, label = 'Copy' }: Props = $props();

	let copied = $state(false);
	let failed = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		return () => clearTimeout(timer);
	});

	async function copy() {
		failed = null;
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 2000);
		} catch (err) {
			copied = false;
			failed = (err as Error).message || 'Copy failed';
		}
	}
</script>

<span class="copybtn" aria-live="polite">
	<Button small onclick={copy}>{copied ? 'Copied ✓' : label}</Button>
	{#if failed}<span class="copy-fail" role="alert">{failed}</span>{/if}
</span>

<style>
	.copybtn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.copy-fail {
		font: 400 12px/1.3 var(--font-ui);
		color: var(--bad);
		max-width: 260px;
		overflow-wrap: anywhere;
	}
</style>

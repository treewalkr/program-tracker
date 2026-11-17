<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	/** One-tap copy for client-facing text (paste into LINE by hand).
	 *  "Copy" → "Copied" for 2 s; failures surface the error in place.
	 *  `quiet` is the in-row form: a bare link glyph (named by `ariaLabel`, else `label`, and
	 *  shown as a tooltip) that turns into a green check on copy, for lists where a bordered
	 *  well or a word on every row would shout. */
	interface Props {
		text: string;
		label?: string;
		/** Called after a successful copy. */
		oncopy?: () => void;
		/** Spoken name when several copy buttons share one label, e.g. one per table row. */
		ariaLabel?: string;
		/** Icon-only ghost, for rows of a table or list. */
		quiet?: boolean;
	}

	let { text, label = 'Copy', oncopy, ariaLabel, quiet = false }: Props = $props();

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
			oncopy?.();
		} catch (err) {
			copied = false;
			failed = (err as Error).message || 'Copy failed';
		}
	}

	const name = $derived(ariaLabel ? (copied ? 'Copied' : ariaLabel) : undefined);
	/** Quiet has no visible word, so it always carries a name. */
	const quietName = $derived(copied ? 'Copied' : (ariaLabel ?? label));
</script>

<span class="copybtn" aria-live="polite">
	{#if quiet}
		<Button
			small
			variant="ghost"
			class="quiet"
			data-copied={copied || undefined}
			onclick={copy}
			aria-label={quietName}
			title={copied ? 'Copied' : label}
		>
			{#snippet icon()}<Icon name={copied ? 'check' : 'link'} />{/snippet}
		</Button>
	{:else}
		<Button small onclick={copy} aria-label={name}>{copied ? 'Copied ✓' : label}</Button>
	{/if}
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
		white-space: normal;
	}

	/* — quiet: at rest only a 14px glyph in a 32px target; the hairline and well arrive on hover — */
	.copybtn :global(.btn.quiet) {
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		color: var(--muted);
		transition: background 120ms, color 120ms;
	}
	.copybtn :global(.btn.quiet:hover) {
		color: var(--ink);
		border-color: var(--btn-border);
		box-shadow: var(--btn-lip);
	}
	.copybtn :global(.btn.quiet:active) {
		box-shadow: none;
	}
	/* copied: the check takes the success ink */
	.copybtn :global(.btn.quiet[data-copied]) {
		color: var(--done-ink);
	}
	@media (prefers-reduced-motion: reduce) {
		.copybtn :global(.btn.quiet) {
			transition: none;
		}
	}
</style>

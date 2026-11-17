<script lang="ts">
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	/** One-tap copy for client-facing text (paste into LINE by hand).
	 *  "Copy" → "Copied" for 2 s; failures surface the error in place.
	 *  `quiet` is the in-row form: a ghost with a link glyph that turns green on copy,
	 *  for lists where a bordered well on every row would shout. */
	interface Props {
		text: string;
		label?: string;
		/** Called after a successful copy. */
		oncopy?: () => void;
		/** Spoken name when several copy buttons share one label, e.g. one per table row. */
		ariaLabel?: string;
		/** Ghost, icon-led, for rows of a table or list. */
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
</script>

<span class="copybtn" aria-live="polite">
	{#if quiet}
		<Button small variant="ghost" class="quiet" data-copied={copied || undefined} onclick={copy} aria-label={name}>
			{#snippet icon()}<Icon name={copied ? 'check' : 'link'} />{/snippet}
			<!-- both words sit in one grid cell, so the button never changes width when the word swaps -->
			<span class="swap">
				<span class="word" class:off={copied}>{label}</span>
				<span class="word" class:off={!copied} aria-hidden="true">Copied</span>
			</span>
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

	/* — quiet: at rest only a glyph and a word; the hairline and well arrive on hover — */
	.copybtn :global(.btn.quiet) {
		gap: 5px;
		padding: 0 8px 0 7px;
		min-height: 32px;
		font-size: 13px;
		color: var(--ink);
	}
	.copybtn :global(.btn.quiet svg) {
		color: var(--muted);
		transition: color 120ms;
	}
	.copybtn :global(.btn.quiet:hover) {
		border-color: var(--btn-border);
		box-shadow: var(--btn-lip);
	}
	.copybtn :global(.btn.quiet:hover svg) {
		color: var(--ink);
	}
	.copybtn :global(.btn.quiet:active) {
		box-shadow: none;
	}
	/* copied: the glyph and word take the success ink, the well stays so the change reads */
	.copybtn :global(.btn.quiet[data-copied]),
	.copybtn :global(.btn.quiet[data-copied] svg) {
		color: var(--done-ink);
	}
	.swap {
		display: inline-grid;
	}
	.word {
		grid-area: 1 / 1;
		text-align: left;
	}
	.word.off {
		visibility: hidden;
	}
	@media (prefers-reduced-motion: reduce) {
		.copybtn :global(.btn.quiet svg) {
			transition: none;
		}
	}
</style>

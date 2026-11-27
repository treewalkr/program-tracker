<script lang="ts">
	import Button from '$lib/ui/Button.svelte';

	/** One-tap copy for client-facing text (paste into LINE by hand).
	 *  "Copy" → "Copied ✓" for 2 s; failures surface the error in place.
	 *  `quiet` is the in-row form: a plain blue text link, like the other row actions,
	 *  whose word turns into a green "Copied" — for lists where a bordered button on
	 *  every row would shout. */
	interface Props {
		text: string;
		label?: string;
		/** Called after a successful copy. */
		oncopy?: () => void;
		/** Spoken name when several copy buttons share one label, e.g. one per table row.
		 *  Keep the visible label in it ("Copy link for Ada") so voice control can say what it sees. */
		ariaLabel?: string;
		/** A text link instead of a button, for rows of a table or list. */
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
		<button type="button" class="quiet" data-copied={copied || undefined} onclick={copy} aria-label={name}>
			<!-- both words sit in one grid cell, so the link never changes width when the word swaps -->
			<span class="swap">
				<span class="word" class:off={copied}>{label}</span>
				<span class="word" class:off={!copied} aria-hidden="true">Copied</span>
			</span>
		</button>
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

	/* — quiet: a 13px blue text link in a 32px target, the same as "Turn on…" beside it — */
	.quiet {
		appearance: none;
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		margin: 0;
		padding: 0 8px;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: var(--blue);
		font: 400 13px/1 var(--font-ui);
		cursor: pointer;
		transition: color 120ms;
	}
	/* Touch: the same 44px target as "Turn on…" beside it. */
	@media (pointer: coarse) {
		.quiet {
			min-height: 44px;
		}
	}
	.quiet:hover .word {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.quiet:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}
	/* copied: the word takes the success ink and drops the underline */
	.quiet[data-copied] {
		color: var(--done-ink);
	}
	.quiet[data-copied]:hover .word {
		text-decoration: none;
	}
	.swap {
		display: inline-grid;
	}
	.word {
		grid-area: 1 / 1;
		text-align: right;
	}
	.word.off {
		visibility: hidden;
	}
	@media (prefers-reduced-motion: reduce) {
		.quiet {
			transition: none;
		}
	}
</style>

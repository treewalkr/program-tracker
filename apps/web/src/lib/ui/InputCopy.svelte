<script lang="ts">
	import Icon from './Icon.svelte';
	import FieldFrame from './input/FieldFrame.svelte';
	import { describedBy } from './input/field';

	/**
	 * Input 09 · Copy field — a read-only value to hand off: the portal link,
	 * an invite code. The value is shown whole and wraps (never ellipsised);
	 * clicking it selects it all. A joined Copy button turns into "Copied" for
	 * 2s; if the clipboard refuses, the text is selected and the error line
	 * says how to copy by hand.
	 */
	interface Props {
		label: string;
		value: string;
		hint?: string | null;
		/** Writes to the clipboard; injectable for stories and tests. */
		copy?: (text: string) => Promise<void>;
		oncopy?: () => void;
	}

	let { label, value, hint, copy = (t) => navigator.clipboard.writeText(t), oncopy }: Props = $props();

	const id = $props.id();
	let box = $state<HTMLDivElement>();
	let copied = $state(false);
	let failed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(timer));

	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
	const error = $derived(failed ? `Couldn't copy — the ${label.toLowerCase()} is selected, press ${isMac ? '⌘C' : 'Ctrl+C'}` : null);

	function selectAll() {
		if (!box) return;
		const range = document.createRange();
		range.selectNodeContents(box);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	}

	async function run() {
		failed = false;
		try {
			await copy(value);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 2000);
			oncopy?.();
		} catch {
			copied = false;
			failed = true;
			box?.focus();
			selectAll();
		}
	}
</script>

<FieldFrame {id} {label} {hint} {error}>
	<div class="grp" class:bad={failed}>
		<div
			bind:this={box}
			{id}
			class="val"
			role="textbox"
			aria-readonly="true"
			aria-labelledby="{id}-l"
			aria-describedby={describedBy(id, { hint, error })}
			tabindex="0"
			onclick={selectAll}
			onfocus={selectAll}
			onkeydown={(e) => {
				if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
					e.preventDefault();
					selectAll();
				}
			}}
		>{value}</div>
		<button type="button" class="btn cp" class:ok={copied} onclick={run}>
			{#if copied}<Icon name="check" />Copied{:else}Copy{/if}
		</button>
	</div>
	<span class="sr-only" aria-live="polite">{copied ? `${label} copied` : ''}</span>
</FieldFrame>

<style>
	.grp {
		display: flex;
		align-items: stretch;
		min-width: 0;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--well);
	}
	.grp:focus-within:has(.val:focus) { border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.grp.bad, .grp.bad:focus-within:has(.val:focus) { border-color: var(--bad); }
	.val {
		flex: 1;
		min-width: 0;
		min-height: 30px;
		padding: 6px 12px;
		font: 400 13px/18px var(--font-mono);
		color: var(--ink);
		overflow-wrap: anywhere;
		cursor: text;
		user-select: all;
	}
	.val:focus { outline: none; }
	.cp {
		flex: none;
		justify-content: center;
		min-width: 92px;
		margin: -1px -1px -1px 0;
		border-radius: 0 var(--radius) var(--radius) 0;
		box-shadow: none;
	}
	.cp:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
	.cp.ok { color: var(--done-ink); }
	@media (max-width: 720px) { .val { min-height: 38px; padding: 10px 12px; } }
</style>

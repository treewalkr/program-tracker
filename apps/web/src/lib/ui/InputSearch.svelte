<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * Input 03 · Search field — search or filter a list in a toolbar. Leading
	 * search icon, a kbd chip while empty, a round clear button and an
	 * optional "12 of 140" count once filled. Esc clears; Esc on empty blurs.
	 * No debounce here: the caller owns it (ListToolbar waits 250ms).
	 */
	interface Props {
		/** Accessible name ("Search clients"); also the placeholder by default. */
		label: string;
		value?: string;
		placeholder?: string;
		/** Key drawn inside the box while empty ("/"); the page wires the key. */
		shortcut?: string;
		/** Result count ("12 of 140"), shown while filled. */
		count?: string;
		disabled?: boolean;
		/** The input, for focus shortcuts. */
		input?: HTMLInputElement;
		oninput?: (value: string) => void;
	}

	let { label, value = $bindable(''), placeholder = label, shortcut, count, disabled = false, input = $bindable(), oninput }: Props = $props();

	function set(v: string) {
		value = v;
		oninput?.(v);
	}

	function clear() {
		set('');
		input?.focus();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		e.preventDefault();
		if (value) set('');
		else input?.blur();
	}
</script>

<div class="box" class:off={disabled}>
	<Icon name="search" />
	<input
		bind:this={input}
		class="in"
		type="search"
		aria-label={label}
		{placeholder}
		{disabled}
		autocomplete="off"
		spellcheck="false"
		bind:value
		oninput={() => oninput?.(value)}
		{onkeydown}
	/>
	<span class="cnt" role="status">{value && count ? count : ''}</span>
	{#if value}
		<button type="button" class="clr" aria-label="Clear search" {disabled} onclick={clear}><Icon name="x" /></button>
	{:else if shortcut}
		<kbd aria-hidden="true">{shortcut}</kbd>
	{/if}
</div>

<style>
	.box {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: var(--field-h, 32px);
		padding: 0 6px 0 10px;
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.box:focus-within { background: var(--surface); border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.box.off { opacity: 0.55; }
	.box > :global(svg) { width: 14px; height: 14px; flex: none; color: var(--muted); }
	.in {
		flex: 1;
		min-width: 0;
		padding: 5px 0;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 400 var(--field-font, 14px) var(--font-ui);
		caret-color: var(--blue);
	}
	.in::placeholder { color: var(--muted); }
	.in:focus { outline: none; }
	.in:disabled { cursor: not-allowed; }
	.in::-webkit-search-cancel-button, .in::-webkit-search-decoration { appearance: none; }
	kbd {
		flex: none;
		margin-right: 2px;
		font: 500 11px/1 var(--font-mono);
		padding: 2px 5px;
		border: 1px solid var(--line);
		border-bottom-width: 2px;
		border-radius: 4px;
		background: var(--surface);
		color: var(--muted);
	}
	.cnt:empty { display: none; }
	.cnt { flex: none; font: 400 12px var(--font-mono); font-variant-numeric: tabular-nums; color: var(--muted); white-space: nowrap; }
	.clr {
		flex: none;
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: 0;
		border-radius: 99px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.clr:hover:not(:disabled) { background: var(--well-2); color: var(--ink); }
	.clr:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
	.clr :global(svg) { width: 12px; height: 12px; }
	@media (max-width: 720px), (pointer: coarse) { .clr { width: 28px; height: 28px; } }
</style>

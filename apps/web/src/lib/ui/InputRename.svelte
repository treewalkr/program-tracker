<script lang="ts">
	import { tick, untrack } from 'svelte';
	import Icon from './Icon.svelte';

	/**
	 * Input 06 · Inline rename — rename a heading in place (program, phase,
	 * session). At rest the title and a quiet pencil; editing swaps in a field
	 * at the same size so nothing jumps, with Save and Cancel. Enter saves,
	 * Esc cancels, focus returns to the pencil.
	 */
	interface Props {
		value: string;
		/** What is being renamed, for the button name: "program" → "Rename program". */
		thing: string;
		size?: 'title' | 'heading' | 'row';
		/** The element the title renders as at rest. */
		tag?: 'h1' | 'h2' | 'h3' | 'span';
		/** Controlled editing state (stories, tests). */
		editing?: boolean;
		disabled?: boolean;
		maxlength?: number;
		onsave?: (name: string) => void;
	}

	let { value = $bindable(), thing, size = 'heading', tag = 'span', editing = $bindable(false), disabled = false, maxlength, onsave }: Props = $props();

	const id = $props.id();
	let draft = $state('');
	let error = $state<string | null>(null);
	let field = $state<HTMLInputElement>();
	let pencil = $state<HTMLButtonElement>();

	// Entering edit mode (from the pencil or from outside) seeds the draft and selects it.
	$effect(() => {
		if (!editing) return;
		untrack(() => {
			draft = value;
			error = null;
		});
		tick().then(() => field?.select());
	});

	function start() {
		editing = true;
	}

	async function finish() {
		editing = false;
		error = null;
		await tick();
		pencil?.focus();
	}

	function save() {
		const name = draft.trim();
		if (!name) {
			error = "Name can't be empty.";
			field?.focus();
			return;
		}
		if (name !== value) {
			value = name;
			onsave?.(name);
		}
		finish();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			save();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			finish();
		}
	}
</script>

<div class="rn {size}">
	{#if editing}
		<div class="edit">
			<input
				bind:this={field}
				class="in"
				type="text"
				{maxlength}
				aria-label="Name of {thing}"
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? `${id}-err` : undefined}
				bind:value={draft}
				oninput={() => (error = null)}
				{onkeydown}
			/>
			<button type="button" class="btn small" onclick={save}>Save</button>
			<button type="button" class="btn small ghost" onclick={finish}>Cancel</button>
		</div>
		{#if error}<p class="err" id="{id}-err">{error}</p>{/if}
	{:else}
		<div class="rest">
			<svelte:element this={tag} class="t">{value}</svelte:element>
			<button bind:this={pencil} type="button" class="pen" aria-label="Rename {thing}" {disabled} onclick={start}><Icon name="pencil" /></button>
		</div>
	{/if}
</div>

<style>
	.rn { --fs: 16px; --lh: 24px; min-width: 0; }
	.title { --fs: 20px; --lh: 28px; }
	.row { --fs: 14px; --lh: 20px; }
	.rest, .edit { display: flex; align-items: center; gap: 4px; min-height: 24px; min-width: 0; }
	.edit { gap: 6px; }
	.t {
		margin: 0;
		min-width: 0;
		font: 600 var(--fs) / var(--lh) var(--font-ui);
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.pen {
		flex: none;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		opacity: 0.45;
		transition: opacity 0.12s;
	}
	.pen :global(svg) { width: 14px; height: 14px; }
	.rest:hover .pen, .pen:focus-visible { opacity: 1; }
	.pen:hover:not(:disabled) { background: var(--well-2); color: var(--ink); }
	.pen:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
	.pen:disabled { cursor: not-allowed; }
	.in {
		flex: 1;
		min-width: 0;
		height: calc(var(--lh) + 2px);
		margin: -1px 0 -1px -7px;
		padding: 0 6px;
		font: 600 var(--fs) / var(--lh) var(--font-ui);
		color: var(--ink);
		background: var(--surface);
		border: 1px solid var(--blue);
		border-radius: var(--radius);
		box-shadow: 0 0 0 3px var(--focus-ring);
		caret-color: var(--blue);
	}
	/* a row-size rename is a field on touch: 16px so iOS doesn't zoom */
	.row .in { font-size: var(--field-font, var(--fs)); }
	.in:focus { outline: none; }
	.in[aria-invalid='true'] { border-color: var(--bad); }
	.btn { flex: none; }
	.err { margin-top: 4px; }
	@media (hover: none) { .pen { opacity: 1; } }
	@media (prefers-reduced-motion: reduce) { .pen { transition: none; } }
	@media (max-width: 720px), (pointer: coarse) {
		.pen { width: 32px; height: 32px; }
	}
</style>

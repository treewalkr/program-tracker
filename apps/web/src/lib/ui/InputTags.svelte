<script lang="ts">
	import Icon from './Icon.svelte';
	import FieldFrame from './input/FieldFrame.svelte';
	import { describedBy } from './input/field';
	import { addTags, splitTags } from './input/tags';

	/**
	 * Input 07 · Tag input — several free-typed values: aliases, equipment,
	 * cues. Same box and token look as Select 10, so the two read as one
	 * family. Enter or comma adds, paste splits on commas and lines,
	 * Backspace on the empty field removes the last tag. A duplicate isn't
	 * added: the existing token flashes and the hint says so.
	 */
	interface Props {
		label: string;
		tags?: string[];
		placeholder?: string;
		hint?: string | null;
		error?: string | null;
		optional?: boolean;
		max?: number;
		disabled?: boolean;
		onchange?: (tags: string[]) => void;
	}

	let { label, tags = $bindable([]), placeholder = 'Type and press Enter', hint, error, optional = false, max, disabled = false, onchange }: Props = $props();

	const id = $props.id();
	let text = $state('');
	let flash = $state<string | null>(null);
	let note = $state<string | null>(null);
	let said = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(timer));

	const full = $derived(max !== undefined && tags.length >= max);
	const shownHint = $derived(note ?? (full ? `${max} is the most — remove one to add another.` : hint));

	function set(next: string[]) {
		tags = next;
		onchange?.(next);
	}

	function add(incoming: string[]) {
		if (!incoming.length) return;
		const room = max === undefined ? Infinity : max - tags.length;
		const { tags: next, duplicates } = addTags(tags, incoming);
		const added = next.slice(tags.length, tags.length + Math.max(0, room));
		if (added.length) {
			set([...tags, ...added]);
			said = added.length === 1 ? `Added ${added[0]}` : `Added ${added.join(', ')}`;
		}
		if (duplicates.length) {
			const hit = tags.find((t) => t.toLowerCase() === duplicates[0].toLowerCase()) ?? null;
			flash = null;
			requestAnimationFrame(() => (flash = hit));
			note = 'Already added';
			said = `${duplicates[0]} is already added`;
			clearTimeout(timer);
			timer = setTimeout(() => ((note = null), (flash = null)), 2000);
		} else note = null;
		text = '';
	}

	function remove(tag: string) {
		set(tags.filter((t) => t !== tag));
		said = `Removed ${tag}`;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			add(splitTags(text));
		} else if (e.key === 'Backspace' && !text && tags.length) {
			remove(tags[tags.length - 1]);
		}
	}

	function onpaste(e: ClipboardEvent) {
		const pasted = e.clipboardData?.getData('text') ?? '';
		if (!/[,\n]/.test(pasted)) return;
		e.preventDefault();
		add(splitTags(text + pasted));
	}
</script>

<FieldFrame {id} {label} hint={shownHint} {error} {optional}>
	{#snippet meta()}
		{#if max !== undefined}<span>{tags.length} / {max}</span>{/if}
	{/snippet}
	<div class="sel" class:off={disabled} class:bad={!!error}>
		{#if tags.length}
			<ul class="toks" aria-label="{label}, {tags.length}">
				{#each tags as t (t)}
					<li class="tok" class:flash={flash === t}>{t}<button type="button" aria-label="Remove {t}" {disabled} onclick={() => remove(t)}><Icon name="x" /></button></li>
				{/each}
			</ul>
		{/if}
		<input
			{id}
			class="in"
			class:full
			type="text"
			placeholder={tags.length ? '' : placeholder}
			disabled={disabled || full}
			autocomplete="off"
			enterkeyhint="enter"
			aria-invalid={error ? true : undefined}
			aria-describedby={describedBy(id, { hint: shownHint, error })}
			bind:value={text}
			onblur={() => add(splitTags(text))}
			{onkeydown}
			{onpaste}
		/>
	</div>
	<span class="sr-only" aria-live="polite">{said}</span>
</FieldFrame>

<style>
	.sel {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		min-height: 32px;
		padding: 3px 8px 3px 6px;
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		cursor: text;
	}
	.sel:focus-within { background: var(--surface); border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.sel.bad { border-color: var(--bad); }
	.sel.off { opacity: 0.55; cursor: not-allowed; }
	/* contents: tokens and the input wrap as one row of flex items */
	.toks { display: contents; list-style: none; }
	.tok {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 0 2px 0 8px;
		border-radius: 99px;
		background: var(--pulse-now-bg);
		color: var(--blue);
		border: 1px solid var(--blue-line);
		font: 500 12px/20px var(--font-ui);
	}
	.tok button { display: grid; place-items: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 99px; background: none; color: inherit; cursor: pointer; opacity: 0.8; }
	.tok button:hover:not(:disabled) { opacity: 1; background: var(--blue-line); }
	.tok button:focus-visible { outline: 2px solid var(--focus); outline-offset: 0; opacity: 1; }
	.tok :global(svg) { width: 10px; height: 10px; }
	.tok.flash { animation: flash 0.9s ease-out; }
	@keyframes flash {
		0%, 40% { background: var(--blue-line); border-color: var(--blue); }
		100% { background: var(--pulse-now-bg); border-color: var(--blue-line); }
	}
	.in {
		flex: 1;
		min-width: 80px;
		padding: 2px 0 2px 4px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 400 14px var(--font-ui);
		caret-color: var(--blue);
	}
	.in::placeholder { color: var(--muted); }
	.in:focus { outline: none; }
	.in:disabled { cursor: not-allowed; }
	.in.full { min-width: 24px; }
	@media (prefers-reduced-motion: reduce) { .tok.flash { animation: none; } }
	@media (max-width: 720px) { .sel { min-height: 40px; } .in { font-size: 16px; } }
</style>

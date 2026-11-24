<script lang="ts" generics="T extends string">
	import type { Snippet } from 'svelte';
	import Icon from '../Icon.svelte';
	import { matchParts, type SelectOption } from './options';

	/**
	 * The listbox body shared by every select: tick or checkbox, label, optional
	 * second line, avatar, source tag and right-hand hint. Rows take pointer
	 * presses without moving focus, so the trigger keeps it.
	 */
	interface Props {
		id: string;
		label: string;
		options: SelectOption<T>[];
		selected: T[];
		active: number;
		onpick: (option: SelectOption<T>) => void;
		onhover?: (index: number) => void;
		/** Checkbox rows for multi-select. */
		multiple?: boolean;
		/** Highlight this text inside labels (combobox). */
		query?: string;
		/** Replace the label cell, e.g. a Pill. */
		row?: Snippet<[SelectOption<T>]>;
		emptyText?: string;
	}

	let { id, label, options, selected, active, onpick, onhover, multiple = false, query = '', row, emptyText = 'No matches' }: Props = $props();

	let list = $state<HTMLDivElement>();

	const counts = $derived.by(() => {
		const m = new Map<string, number>();
		for (const o of options) if (o.group) m.set(o.group, (m.get(o.group) ?? 0) + 1);
		return m;
	});

	$effect(() => {
		list?.querySelector(`#${CSS.escape(`${id}-${active}`)}`)?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="list" role="listbox" {id} aria-label={label} aria-multiselectable={multiple || undefined} bind:this={list}>
	{#each options as o, i (o.value)}
		{#if o.group && o.group !== options[i - 1]?.group}
			<div class="grp" role="presentation" class:next={i > 0}>{o.group}<span class="cnt">{counts.get(o.group)}</span></div>
		{/if}
		{#if o.action && !options[i - 1]?.action}<div class="sep" role="presentation"></div>{/if}
		{@const on = selected.includes(o.value)}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			id="{id}-{i}"
			role="option"
			tabindex="-1"
			aria-selected={o.action ? undefined : on}
			class="opt"
			class:on
			class:multi={multiple}
			class:hov={i === active}
			class:act={o.action}
			class:two={!!o.description}
			onpointerdown={(e) => e.preventDefault()}
			onpointermove={() => onhover?.(i)}
			onclick={() => onpick(o)}
		>
			{#if o.action}
				<Icon name="plus" />
			{:else if multiple}
				<span class="box"><Icon name="check" /></span>
			{:else}
				<span class="tick"><Icon name="check" /></span>
			{/if}
			{#if o.avatar}<span class="av" aria-hidden="true">{o.avatar}</span>{/if}
			{#if row}
				{@render row(o)}
			{:else}
				<span class="t">
					<span>{#each matchParts(o.label, query) as p}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}</span>
					{#if o.description}<span class="d">{o.description}</span>{/if}
				</span>
			{/if}
			{#if o.tag}<span class="tag">{o.tag}</span>{/if}
			{#if o.hint}<span class="r">{o.hint}</span>{/if}
		</div>
	{:else}
		<div class="empty">{emptyText}</div>
	{/each}
</div>

<style>
	.list { padding: 4px 0; max-height: min(280px, var(--pop-max, 280px)); overflow-y: auto; }
	.opt {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		margin: 0 4px;
		border-radius: var(--radius);
		font-size: 14px;
		cursor: default;
	}
	.opt.hov { background: var(--well-2); }
	.opt.on:not(.multi) { font-weight: 600; }
	.opt.two { align-items: flex-start; padding: 6px 8px; }
	.opt.two .tick, .opt.two .box { margin-top: 3px; }
	.opt.act { color: var(--blue); }
	.t { display: flex; flex-direction: column; min-width: 0; }
	.d { font-size: 12px; color: var(--muted); font-weight: 400; }
	.tick, .box :global(svg), .tick :global(svg) { width: 14px; height: 14px; }
	.tick { flex: none; color: var(--ink); visibility: hidden; }
	.on .tick { visibility: visible; }
	.box {
		width: 14px;
		height: 14px;
		flex: none;
		display: grid;
		place-items: center;
		border: 1px solid var(--line-strong);
		border-radius: 4px;
		background: var(--surface);
		color: #fff;
	}
	.box :global(svg) { width: 10px; height: 10px; stroke-width: 3; visibility: hidden; }
	.on .box { background: var(--blue); border-color: var(--blue); }
	.on .box :global(svg) { visibility: visible; }
	.opt .t { font-weight: inherit; }
	.act :global(svg) { width: 14px; height: 14px; flex: none; }
	.av {
		width: 20px;
		height: 20px;
		flex: none;
		border-radius: 99px;
		background: var(--avatar-bg);
		color: var(--ink);
		font: 600 10px/20px var(--font-ui);
		text-align: center;
	}
	.r { margin-left: auto; color: var(--muted); font: 400 12px var(--font-mono); }
	.tag { margin-left: auto; font: 500 11px var(--font-ui); color: var(--muted); background: var(--well-2); border-radius: 99px; padding: 0 8px; }
	.r, .tag { white-space: nowrap; }
	mark { background: var(--warn-bg); color: inherit; border-radius: 2px; font-weight: 600; }
	.grp {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px 2px;
		background: var(--surface);
		font: 600 12px var(--font-ui);
		color: var(--muted);
	}
	.grp.next { margin-top: 4px; }
	.cnt { font: 500 11px var(--font-mono); background: var(--well-2); border-radius: 99px; padding: 0 6px; }
	.sep { height: 1px; background: var(--line-soft); margin: 4px 0; }
	.empty { padding: 8px 12px; color: var(--muted); font-size: 13px; }
</style>

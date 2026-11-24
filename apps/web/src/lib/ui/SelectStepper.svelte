<script lang="ts">
	import { untrack } from 'svelte';
	import Dropdown from './select/Dropdown.svelte';
	import Icon from './Icon.svelte';

	/**
	 * Select 05 · Figure stepper — mono tabular value with a unit, stacked step
	 * buttons, and a number grid on open. For numbers picked repeatedly: reps,
	 * kg, RPE, rest. Closed, ↑/↓ step the value; open, arrows move through the grid.
	 */
	interface Props {
		/** Allowed values, ascending. */
		values: number[];
		/** null = not given yet: the placeholder shows and the first step lands on `start`. */
		value: number | null;
		onchange?: (value: number) => void;
		/** Shown while the value is null. */
		placeholder?: string;
		/** Where a first step or the open grid starts from a null value (default: the middle value). */
		start?: number;
		/** Accessible name: "RPE", "Rest". */
		label: string;
		/** Small unit after the figure: "RPE", "s rest", "kg". */
		unit?: string;
		/** Colour scale for the grid figures (RPE effort). */
		scale?: (value: number) => 'low' | 'mid' | 'high';
		/** Line under the grid for the highlighted figure: "about 1–2 reps in reserve". */
		describe?: (value: number) => string;
		columns?: number;
		disabled?: boolean;
		open?: boolean;
		/** Take the column's width, with the grid as wide as the field (never past the screen edge). */
		block?: boolean;
		/** The step buttons' accessible names, in the page's language; `{label}` is filled in. */
		stepWords?: { up: string; down: string };
	}

	let { values, value = $bindable(), onchange, placeholder = '—', start, label, unit, scale, describe, columns = 6, disabled = false, open = $bindable(false), block = false, stepWords = { up: 'Increase {label}', down: 'Decrease {label}' } }: Props = $props();

	const uid = $props.id();
	let active = $state(0);
	$effect(() => {
		if (open) active = untrack(() => home());
	});

	const index = $derived(value == null ? -1 : values.indexOf(value));
	const startIndex = $derived(Math.max(0, start != null ? values.indexOf(start) : Math.floor((values.length - 1) / 2)));
	/** The grid cell an opening highlights: the value, else the start. */
	const home = () => (value == null ? startIndex : Math.max(0, index));
	const shown = $derived(open ? (values[active] ?? value) : value);

	function set(v: number) {
		value = v;
		onchange?.(v);
	}

	function step(by: number) {
		if (value == null) {
			set(values[startIndex]);
			return;
		}
		const current = value;
		const from = index === -1 ? values.findIndex((v) => v >= current) : index;
		const next = values[Math.min(values.length - 1, Math.max(0, (from === -1 ? values.length - 1 : from) + by))];
		if (next !== undefined) set(next);
	}

	function show() {
		active = home();
		open = true;
	}

	function onkeydown(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
				e.preventDefault();
				step(e.key === 'ArrowUp' ? 1 : -1);
			} else if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				show();
			}
			return;
		}
		const last = values.length - 1;
		const move: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
		if (e.key in move) {
			e.preventDefault();
			active = Math.min(last, Math.max(0, active + move[e.key]));
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			set(values[active]);
			open = false;
		} else if (e.key === 'Tab') open = false;
	}
</script>

<Dropdown bind:open inline={!block} panelWidth={block ? '100%' : '280px'}>
	{#snippet trigger()}
		<div class="sel" class:off={disabled} class:block>
			<button
				type="button"
				class="v"
				role="combobox"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls="{uid}-grid"
				aria-label={label}
				aria-activedescendant={open ? `${uid}-${active}` : undefined}
				{disabled}
				onclick={() => (open ? (open = false) : show())}
				{onkeydown}
			>
				{#if value == null}<span class="ph">{placeholder}</span>{:else}{value}{/if}{#if unit}<small>{unit}</small>{/if}
			</button>
			<div class="st">
				<button type="button" tabindex="-1" aria-label={stepWords.up.replace('{label}', label)} disabled={disabled || (value != null && index === values.length - 1)} onclick={() => step(1)}><Icon name="arrow-up" /></button>
				<button type="button" tabindex="-1" aria-label={stepWords.down.replace('{label}', label)} disabled={disabled || (value != null && index === 0)} onclick={() => step(-1)}><Icon name="arrow-down" /></button>
			</div>
		</div>
	{/snippet}
	<div class="grid" id="{uid}-grid" role="listbox" aria-label={label} style:grid-template-columns="repeat({columns}, 1fr)">
		{#each values as v, i (v)}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				id="{uid}-{i}"
				role="option"
				tabindex="-1"
				aria-selected={v === value}
				class="n {scale?.(v) ?? ''}"
				class:on={v === value}
				class:hov={i === active}
				onpointerdown={(e) => e.preventDefault()}
				onpointermove={() => (active = i)}
				onclick={() => (set(v), (open = false))}
			>{v}</div>
		{/each}
	</div>
	{#if describe && shown != null}<div class="ft">{shown} · {describe(shown)}</div>{/if}
</Dropdown>

<style>
	.sel { display: inline-flex; align-items: stretch; min-height: var(--field-h, 32px); border: 1px solid var(--line); border-radius: var(--radius); background: var(--well); overflow: hidden; }
	.sel:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.sel.off { opacity: 0.55; }
	.v {
		display: flex;
		align-items: baseline;
		gap: 4px;
		min-width: 84px;
		padding: 5px 12px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 600 var(--field-font, 14px) var(--font-mono);
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		text-align: left;
	}
	.v:focus-visible { outline: none; }
	.v:hover:not(:disabled) { background: var(--well-2); }
	small { font: 400 12px var(--font-ui); color: var(--muted); }
	.ph { color: var(--muted); font-weight: 400; }
	.st { display: flex; flex-direction: column; border-left: 1px solid var(--line); }
	.st button { flex: 1; width: 26px; border: 0; background: transparent; color: var(--muted); display: grid; place-items: center; padding: 0; cursor: pointer; }
	.st button + button { border-top: 1px solid var(--line-soft); }
	.st button:hover:not(:disabled) { background: var(--well-2); color: var(--ink); }
	.st button:disabled { opacity: 0.4; cursor: default; }
	.st :global(svg) { width: 11px; height: 11px; }
	.grid { display: grid; gap: 2px; padding: 6px; }
	.n { font: 500 12px var(--font-mono); font-variant-numeric: tabular-nums; text-align: center; padding: 5px 0; border-radius: 4px; border: 1px solid transparent; cursor: default; }
	.n.low { color: var(--rpe-low); }
	.n.mid { color: var(--rpe-mid); }
	.n.high { color: var(--rpe-high); }
	.n.hov { background: var(--well-2); }
	.n.on { background: var(--hover-ink); color: var(--on-ink); }
	.ft { padding: 8px 12px; border-top: 1px solid var(--line-soft); background: var(--well); font-size: 12px; color: var(--muted); }
	.sel.block { display: flex; width: 100%; }
	.sel.block .v { flex: 1; }
	/* touch: the step buttons and the grid figures are 44px targets */
	@media (max-width: 720px), (pointer: coarse) {
		.sel { min-height: 44px; }
		.st { flex-direction: row; }
		.st button { width: 44px; }
		.st button + button { border-top: 0; border-left: 1px solid var(--line-soft); }
		.st :global(svg) { width: 14px; height: 14px; }
		.n { min-height: 44px; display: grid; place-items: center; padding: 0; font-size: 15px; }
	}
</style>

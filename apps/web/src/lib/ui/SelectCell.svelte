<script lang="ts" generics="T extends string">
	import Dropdown from './select/Dropdown.svelte';
	import OptionList from './select/OptionList.svelte';
	import Icon from './Icon.svelte';
	import { Listbox } from './select/listbox.svelte';
	import type { SelectOption } from './select/options';

	/**
	 * Select 04 · Quiet cell — plain text until hover or focus, then the field
	 * appears and the chevron fades in. Keeps dense tables scannable.
	 */
	interface Props {
		options: SelectOption<T>[];
		value?: T | undefined;
		onchange?: (value: T) => void;
		/** Accessible name: "Role for Back squat". */
		label: string;
		disabled?: boolean;
		open?: boolean;
	}

	let { options, value = $bindable(), onchange, label, disabled = false, open = $bindable(false) }: Props = $props();

	const uid = $props.id();
	const chosen = $derived(options.find((o) => o.value === value));

	const lb = new Listbox<T>({
		items: () => options,
		selectedIndex: () => options.findIndex((o) => o.value === value),
		isOpen: () => open,
		setOpen: (v) => (open = v),
		pick,
	});

	function pick(o: SelectOption<T>) {
		value = o.value;
		onchange?.(o.value);
		open = false;
	}
</script>

<Dropdown bind:open inline panelWidth="200px">
	{#snippet trigger()}
		<button
			type="button"
			class="sel"
			role="combobox"
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-controls="{uid}-list"
			aria-label="{label}: {chosen?.label ?? ''}"
			aria-activedescendant={open ? `${uid}-list-${lb.active}` : undefined}
			{disabled}
			onclick={lb.toggle}
			onkeydown={lb.onkeydown}
		>
			{chosen?.label ?? ''}<Icon name="chevron" />
		</button>
	{/snippet}
	<OptionList id="{uid}-list" {label} {options} selected={value === undefined ? [] : [value]} active={lb.active} onpick={pick} onhover={(i) => (lb.active = i)} />
</Dropdown>

<style>
	.sel {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		margin: 0 -6px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		color: var(--ink);
		font: 400 14px var(--font-ui);
		cursor: pointer;
	}
	.sel :global(svg) { width: 14px; height: 14px; color: var(--muted); opacity: 0; transition: opacity 0.12s; }
	.sel:hover:not(:disabled), .sel:focus-visible, .sel[aria-expanded='true'] { border-color: var(--line); background: var(--well); }
	.sel:hover :global(svg), .sel:focus-visible :global(svg), .sel[aria-expanded='true'] :global(svg) { opacity: 1; }
	.sel:focus-visible { border-color: var(--blue); outline: none; box-shadow: 0 0 0 3px var(--focus-ring); }
	.sel:disabled { cursor: default; }
	@media (prefers-reduced-motion: reduce) { .sel :global(svg) { transition: none; } }
	@media (max-width: 720px) { .sel { min-height: 40px; font-size: 16px; } }
</style>

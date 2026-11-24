<script lang="ts" generics="T extends string">
	import Dropdown from './select/Dropdown.svelte';
	import OptionList from './select/OptionList.svelte';
	import Pill from './Pill.svelte';
	import Icon from './Icon.svelte';
	import { Listbox } from './select/listbox.svelte';
	import type { SelectOption } from './select/options';

	/**
	 * Select 09 · Status pill — the value is a soft-tinted Label that already
	 * means something; the chevron is the only added mark. Each option's `tone`
	 * picks the colour.
	 */
	interface Props {
		options: SelectOption<T>[];
		value?: T | undefined;
		onchange?: (value: T) => void;
		/** Accessible name: "Program state". */
		label: string;
		/** Line under the options: "Activating archives the current version." */
		footer?: string;
		disabled?: boolean;
		open?: boolean;
	}

	let { options, value = $bindable(), onchange, label, footer, disabled = false, open = $bindable(false) }: Props = $props();

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

<Dropdown bind:open inline panelWidth="260px">
	{#snippet trigger()}
		<button
			type="button"
			class="sel {chosen?.tone ?? 'neutral'}"
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
	<OptionList id="{uid}-list" {label} {options} selected={value === undefined ? [] : [value]} active={lb.active} onpick={pick} onhover={(i) => (lb.active = i)}>
		{#snippet row(o)}<Pill tone={o.tone ?? 'neutral'}>{o.label}</Pill>{/snippet}
	</OptionList>
	{#if footer}<div class="ft">{footer}</div>{/if}
</Dropdown>

<style>
	.sel {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 6px 1px 10px;
		border-radius: 99px;
		border: 1px solid var(--line);
		min-height: var(--field-h, auto);
		font: 500 var(--field-font, 12px)/20px var(--font-ui);
		cursor: pointer;
	}
	.sel.good { color: var(--good); background: var(--good-bg); border-color: var(--good-line); }
	.sel.warn { color: var(--warn); background: var(--warn-bg); border-color: var(--warn-line); }
	.sel.bad { color: var(--bad); background: var(--bad-bg); border-color: var(--bad-line); }
	.sel.neutral { color: var(--muted); background: var(--well); border-color: var(--line); }
	.sel :global(svg) { width: 12px; height: 12px; flex: none; }
	.sel:focus-visible, .sel[aria-expanded='true'] { outline: none; box-shadow: 0 0 0 3px var(--focus-ring); }
	.sel:disabled { opacity: 0.55; cursor: not-allowed; }
	.ft { padding: 8px 12px; border-top: 1px solid var(--line-soft); background: var(--well); font-size: 12px; color: var(--muted); }
</style>

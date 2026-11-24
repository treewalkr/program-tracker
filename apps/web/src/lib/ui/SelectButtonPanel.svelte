<script lang="ts" generics="T extends string">
	import Dropdown from './select/Dropdown.svelte';
	import OptionList from './select/OptionList.svelte';
	import Icon from './Icon.svelte';
	import { Listbox } from './select/listbox.svelte';
	import type { SelectOption } from './select/options';

	/**
	 * Select 02 · Button panel — a button with a muted key and the value. Opens
	 * a titled panel whose footer says what choosing does. For page-level scope:
	 * client, program version, week.
	 */
	interface Props {
		options: SelectOption<T>[];
		value?: T | undefined;
		onchange?: (value: T) => void;
		/** Muted key before the value: "Client", "Week". */
		label: string;
		/** Panel heading: "Switch week". */
		title: string;
		/** Muted note on the right of the heading. */
		note?: string;
		/** Line under the options stating what choosing does. */
		footer?: string;
		/** Set the value in mono tabular figures (week numbers). */
		mono?: boolean;
		disabled?: boolean;
		open?: boolean;
	}

	let { options, value = $bindable(), onchange, label, title, note, footer, mono = false, disabled = false, open = $bindable(false) }: Props = $props();

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

<Dropdown bind:open inline panelWidth="300px">
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
			{#if chosen?.avatar}<span class="av" aria-hidden="true">{chosen.avatar}</span>{/if}
			<span class="k">{label}</span>
			<span class:mono>{chosen?.label ?? ''}</span>
			<Icon name="chevron" />
		</button>
	{/snippet}
	<div class="hd">{title}{#if note}<span>{note}</span>{/if}</div>
	<OptionList id="{uid}-list" label={title} {options} selected={value === undefined ? [] : [value]} active={lb.active} onpick={pick} onhover={(i) => (lb.active = i)} />
	{#if footer}<div class="ft">{footer}</div>{/if}
</Dropdown>

<style>
	.sel {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: var(--field-h, 32px);
		padding: 3px 12px;
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--btn-lip);
		font: 500 var(--field-font, 14px) var(--font-ui);
		color: var(--ink);
		cursor: pointer;
	}
	.sel:hover:not(:disabled) { background: var(--well-2); }
	.sel:focus-visible, .sel[aria-expanded='true'] { border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); outline: none; }
	.sel:disabled { opacity: 0.55; cursor: not-allowed; }
	.k { color: var(--muted); font-weight: 400; }
	.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
	.sel :global(svg) { width: 14px; height: 14px; flex: none; color: var(--muted); }
	.av { width: 16px; height: 16px; border-radius: 99px; background: var(--avatar-bg); color: var(--ink); font: 600 9px/16px var(--font-ui); text-align: center; }
	.hd { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--line-soft); font: 600 12px var(--font-ui); }
	.hd span { color: var(--muted); font-weight: 400; }
	.ft { padding: 8px 12px; border-top: 1px solid var(--line-soft); background: var(--well); font-size: 12px; color: var(--muted); }
</style>

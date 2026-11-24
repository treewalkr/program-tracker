<script lang="ts" generics="T extends string">
	import Dropdown from './select/Dropdown.svelte';
	import OptionList from './select/OptionList.svelte';
	import Icon from './Icon.svelte';
	import { Listbox } from './select/listbox.svelte';
	import type { SelectOption } from './select/options';

	/**
	 * Select 03 · Prefixed field — the label sits inside, in a well-deep cap.
	 * Saves a row of height and survives a toolbar. For filters and sorts.
	 */
	interface Props {
		options: SelectOption<T>[];
		value?: T | undefined;
		onchange?: (value: T) => void;
		/** The cap text, also the accessible name: "Sort", "Pattern". */
		prefix: string;
		disabled?: boolean;
		open?: boolean;
		/** Cap on the control's width; "none" lets it fill its slot. */
		maxWidth?: string;
	}

	let { options, value = $bindable(), onchange, prefix, disabled = false, open = $bindable(false), maxWidth = '300px' }: Props = $props();

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

<Dropdown bind:open {maxWidth}>
	{#snippet trigger()}
		<button
			type="button"
			class="sel"
			role="combobox"
			aria-haspopup="listbox"
			aria-expanded={open}
			aria-controls="{uid}-list"
			aria-label="{prefix}: {chosen?.label ?? ''}"
			aria-activedescendant={open ? `${uid}-list-${lb.active}` : undefined}
			{disabled}
			onclick={lb.toggle}
			onkeydown={lb.onkeydown}
		>
			<span class="p">{prefix}</span>
			<span class="v"><span class="t">{chosen?.label ?? ''}</span><Icon name="chevrons-up-down" /></span>
		</button>
	{/snippet}
	<OptionList id="{uid}-list" label={prefix} {options} selected={value === undefined ? [] : [value]} active={lb.active} onpick={pick} onhover={(i) => (lb.active = i)} />
</Dropdown>

<style>
	.sel {
		display: flex;
		align-items: stretch;
		width: 100%;
		min-height: 32px;
		padding: 0;
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
		font: 400 14px var(--font-ui);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.p {
		display: flex;
		align-items: center;
		padding: 0 10px;
		color: var(--muted);
		font: 500 12px var(--font-ui);
		background: var(--well-2);
		border-right: 1px solid var(--line);
	}
	.v { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 10px 5px 12px; }
	.sel:hover:not(:disabled) .v { background: var(--well-2); }
	.sel:focus-visible, .sel[aria-expanded='true'] { border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); outline: none; }
	.sel:disabled { opacity: 0.55; cursor: not-allowed; }
	/* A long value in a narrow slot ends in … instead of being cut. */
	.t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.v :global(svg) { width: 14px; height: 14px; flex: none; color: var(--muted); }
	@media (max-width: 720px) { .sel { min-height: 40px; font-size: 16px; } }
</style>

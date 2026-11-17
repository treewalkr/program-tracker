<script lang="ts" generics="T extends string">
	import Dropdown from './select/Dropdown.svelte';
	import OptionList from './select/OptionList.svelte';
	import Icon from './Icon.svelte';
	import { Listbox } from './select/listbox.svelte';
	import type { SelectOption } from './select/options';

	/**
	 * Select 01 · Primer field — the form default. Reads as a text input with a
	 * chevron so a form column stays one shape. Also the base for the Described
	 * (07) and Grouped (08) styles.
	 */
	interface Props {
		options: SelectOption<T>[];
		value?: T | undefined;
		onchange?: (value: T) => void;
		/** Visible label above the field; also the accessible name. */
		label: string;
		placeholder?: string;
		disabled?: boolean;
		invalid?: boolean;
		/** Controlled open state (stories, tests). */
		open?: boolean;
	}

	let { options, value = $bindable(), onchange, label, placeholder = 'Choose…', disabled = false, invalid = false, open = $bindable(false) }: Props = $props();

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

<div class="field">
	<span class="lbl" id="{uid}-l">{label}</span>
	<Dropdown bind:open>
		{#snippet trigger()}
			<button
				type="button"
				class="sel"
				class:err={invalid}
				role="combobox"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-controls="{uid}-list"
				aria-labelledby="{uid}-l"
				aria-invalid={invalid || undefined}
				aria-activedescendant={open ? `${uid}-list-${lb.active}` : undefined}
				{disabled}
				onclick={lb.toggle}
				onkeydown={lb.onkeydown}
			>
				{#if chosen}
					<span class="val">
						{#if chosen.avatar}<span class="av" aria-hidden="true">{chosen.avatar}</span>{/if}
						<span class="t">
							<span>{chosen.label}</span>
							{#if chosen.description}<span class="d">{chosen.description}</span>{/if}
						</span>
					</span>
				{:else}
					<span class="ph">{placeholder}</span>
				{/if}
				<Icon name="chevrons-up-down" />
			</button>
		{/snippet}
		<OptionList id="{uid}-list" {label} {options} selected={value === undefined ? [] : [value]} active={lb.active} onpick={pick} onhover={(i) => (lb.active = i)} />
	</Dropdown>
</div>

<style>
	.field { display: grid; gap: 4px; }
	.lbl { font: 500 12px var(--font-ui); color: var(--ink); }
	.sel {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		min-height: 32px;
		padding: 5px 12px;
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		font: 400 14px var(--font-ui);
		color: var(--ink);
		cursor: pointer;
		text-align: left;
	}
	.sel:hover:not(:disabled) { background: var(--well-2); }
	.sel:focus-visible, .sel[aria-expanded='true'] {
		background: var(--surface);
		border-color: var(--blue);
		box-shadow: 0 0 0 3px var(--focus-ring);
		outline: none;
	}
	.sel.err { border-color: var(--bad); }
	.sel:disabled { opacity: 0.55; cursor: not-allowed; }
	.sel :global(svg) { width: 14px; height: 14px; flex: none; color: var(--muted); }
	.val { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.t { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
	.d { font-size: 12px; color: var(--muted); }
	.ph { color: var(--muted); }
	.av {
		width: 20px; height: 20px; flex: none; border-radius: 99px;
		background: var(--avatar-bg); color: var(--ink);
		font: 600 10px/20px var(--font-ui); text-align: center;
	}
	@media (max-width: 720px) { .sel { min-height: 40px; font-size: 16px; } }
</style>

<script lang="ts" generics="T extends string">
	import Dropdown from './select/Dropdown.svelte';
	import OptionList from './select/OptionList.svelte';
	import Icon from './Icon.svelte';
	import { Listbox } from './select/listbox.svelte';
	import type { SelectOption } from './select/options';

	/**
	 * Select 10 · Token multi-select — chosen items become blue tokens with a
	 * remove mark. The list uses checkboxes and stays open while you pick.
	 * Backspace on the empty field removes the last token.
	 */
	interface Props {
		options: SelectOption<T>[];
		value?: T[];
		onchange?: (value: T[]) => void;
		/** Visible label above the field; also the accessible name. */
		label: string;
		placeholder?: string;
		disabled?: boolean;
		open?: boolean;
	}

	let { options, value = $bindable([]), onchange, label, placeholder = 'Choose…', disabled = false, open = $bindable(false) }: Props = $props();

	const uid = $props.id();
	const chosen = $derived(value.map((v) => options.find((o) => o.value === v)).filter((o): o is SelectOption<T> => !!o));

	const lb = new Listbox<T>({
		items: () => options,
		selectedIndex: () => options.findIndex((o) => value.includes(o.value)),
		isOpen: () => open,
		setOpen: (v) => (open = v),
		pick: toggle,
	});

	function set(next: T[]) {
		value = next;
		onchange?.(next);
	}

	function toggle(o: SelectOption<T>) {
		set(value.includes(o.value) ? value.filter((v) => v !== o.value) : [...value, o.value]);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Backspace' && !open && value.length) set(value.slice(0, -1));
		else lb.onkeydown(e);
	}
</script>

<div class="field">
	<span class="lbl" id="{uid}-l">{label}</span>
	<Dropdown bind:open maxWidth="340px">
		{#snippet trigger()}
			<div class="sel" class:off={disabled}>
				{#each chosen as o (o.value)}
					<span class="tok">{o.label}<button type="button" aria-label="Remove {o.label}" {disabled} onclick={() => toggle(o)}><Icon name="x" /></button></span>
				{/each}
				<button
					type="button"
					class="open"
					role="combobox"
					aria-haspopup="listbox"
					aria-expanded={open}
					aria-controls="{uid}-list"
					aria-labelledby="{uid}-l"
					aria-activedescendant={open ? `${uid}-list-${lb.active}` : undefined}
					{disabled}
					onclick={lb.toggle}
					{onkeydown}
				>
					{#if !chosen.length}<span class="ph">{placeholder}</span>{/if}
					<span class="cnt">{chosen.length || ''}</span>
					<Icon name="chevrons-up-down" />
				</button>
			</div>
		{/snippet}
		<OptionList id="{uid}-list" {label} {options} selected={value} multiple active={lb.active} onpick={toggle} onhover={(i) => (lb.active = i)} />
		<div class="ft">{value.length} selected · Esc to close</div>
	</Dropdown>
</div>

<style>
	.field { display: grid; gap: 4px; }
	.lbl { font: 500 12px var(--font-ui); color: var(--ink); }
	.sel {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		min-height: var(--field-h, 32px);
		padding: 3px 8px 3px 6px;
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
	}
	.sel:focus-within { background: var(--surface); border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.sel.off { opacity: 0.55; }
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
	.tok :global(svg) { width: 10px; height: 10px; }
	.open {
		flex: 1;
		min-width: 60px;
		display: flex;
		align-items: center;
		gap: 8px;
		align-self: stretch;
		padding: 0 0 0 4px;
		border: 0;
		background: none;
		font: 400 var(--field-font, 14px) var(--font-ui);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.open:focus-visible { outline: none; }
	.ph { color: var(--muted); }
	.cnt { margin-left: auto; font: 500 11px var(--font-mono); background: var(--well-2); border-radius: 99px; padding: 0 6px; color: var(--muted); }
	.cnt:empty { display: none; }
	.open :global(svg) { width: 14px; height: 14px; flex: none; color: var(--muted); }
	.cnt:empty + :global(svg) { margin-left: auto; }
	.ft { padding: 8px 12px; border-top: 1px solid var(--line-soft); background: var(--well); font-size: 12px; color: var(--muted); }
</style>

<script lang="ts" generics="T extends string">
	import Dropdown from './select/Dropdown.svelte';
	import OptionList from './select/OptionList.svelte';
	import Icon from './Icon.svelte';
	import { Listbox } from './select/listbox.svelte';
	import type { SelectOption } from './select/options';

	/**
	 * Select 06 · Search combobox — type to filter, matches highlighted, arrow
	 * keys to move. A `tag` on each option says where it comes from. For lists
	 * over about 12 items, or a library plus custom entries.
	 */
	interface Props {
		options: SelectOption<T>[];
		value?: T | undefined;
		onchange?: (value: T) => void;
		/** Accessible name: "Exercise". */
		label: string;
		placeholder?: string;
		/** When set, a "Add “query”" row ends the list; called with the typed text. */
		oncreate?: (query: string) => void;
		/** Label for the create row: "Add “sq” as a custom exercise". */
		createLabel?: (query: string) => string;
		/** Shown when nothing matches the typed text. */
		emptyText?: string;
		disabled?: boolean;
		open?: boolean;
	}

	let {
		options,
		value = $bindable(),
		onchange,
		label,
		placeholder = 'Search…',
		oncreate,
		createLabel = (q) => `Add “${q}”`,
		emptyText = 'No exercises match',
		disabled = false,
		open = $bindable(false),
	}: Props = $props();

	const uid = $props.id();
	const chosen = $derived(options.find((o) => o.value === value));
	let query = $state('');
	let typing = $state(false);

	const CREATE = '__create__' as T;
	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const hits = typing && q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
		const exact = options.some((o) => o.label.toLowerCase() === q);
		return oncreate && typing && q && !exact ? [...hits, { value: CREATE, label: createLabel(query.trim()), action: true } as SelectOption<T>] : hits;
	});

	const lb = new Listbox<T>({
		items: () => shown,
		selectedIndex: () => shown.findIndex((o) => o.value === value),
		isOpen: () => open,
		setOpen: (v) => ((open = v), v || settle()),
		pick,
		space: false,
	});

	/** Closed: the field shows the chosen label again, not a half-typed query. */
	function settle() {
		typing = false;
		query = chosen?.label ?? '';
	}

	$effect(() => {
		if (!typing) query = chosen?.label ?? '';
	});

	function pick(o: SelectOption<T>) {
		if (o.value === CREATE) oncreate?.(query.trim());
		else {
			value = o.value;
			onchange?.(o.value);
		}
		open = false;
		settle();
	}

	function oninput() {
		typing = true;
		lb.active = 0;
		open = true;
	}
</script>

<Dropdown bind:open maxWidth="340px">
	{#snippet trigger()}
		<div class="sel" class:off={disabled}>
			<Icon name="search" />
			<input
				type="text"
				role="combobox"
				autocomplete="off"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls="{uid}-list"
				aria-label={label}
				aria-activedescendant={open ? `${uid}-list-${lb.active}` : undefined}
				{placeholder}
				{disabled}
				bind:value={query}
				{oninput}
				onfocus={(e) => (e.currentTarget.select(), lb.show())}
				onclick={() => !open && lb.show()}
				onkeydown={lb.onkeydown}
			/>
		</div>
	{/snippet}
	<OptionList id="{uid}-list" {label} options={shown} selected={value === undefined ? [] : [value]} active={lb.active} query={typing ? query : ''} onpick={pick} onhover={(i) => (lb.active = i)} {emptyText} />
</Dropdown>

<style>
	.sel {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 32px;
		padding: 5px 12px;
		background: var(--well);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		color: var(--muted);
	}
	.sel:focus-within { background: var(--surface); border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
	.sel.off { opacity: 0.55; }
	.sel :global(svg) { width: 14px; height: 14px; flex: none; }
	input { flex: 1; min-width: 0; border: 0; background: transparent; padding: 0; font: 400 14px var(--font-ui); color: var(--ink); outline: none; }
	input::placeholder { color: var(--muted); }
	@media (max-width: 720px) { .sel { min-height: 40px; } input { font-size: 16px; } }
</style>

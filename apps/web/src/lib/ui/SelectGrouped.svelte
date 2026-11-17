<script lang="ts" generics="T extends string">
	import SelectField from './SelectField.svelte';
	import { groupInOrder, type SelectOption } from './select/options';

	/**
	 * Select 08 · Grouped list — sticky group headings with counters, an avatar
	 * and a quiet right-hand fact (`group`, `avatar`, `hint` on each option).
	 * Options are clustered by group in first-seen order.
	 */
	interface Props {
		options: SelectOption<T>[];
		value?: T | undefined;
		onchange?: (value: T) => void;
		label: string;
		placeholder?: string;
		disabled?: boolean;
		invalid?: boolean;
		open?: boolean;
	}

	let { value = $bindable(), open = $bindable(false), options, ...rest }: Props = $props();
	const ordered = $derived(groupInOrder(options));
</script>

<SelectField {...rest} options={ordered} bind:value bind:open />

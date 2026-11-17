<script lang="ts" generics="T extends string">
	import SelectField from './SelectField.svelte';
	import type { SelectOption } from './select/options';

	/**
	 * Select 07 · Described options — two lines per option: name, then what it
	 * does. For choices where the label alone invites a wrong pick. Give every
	 * option a `description`.
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

	let { value = $bindable(), open = $bindable(false), ...rest }: Props = $props();
</script>

<SelectField {...rest} bind:value bind:open />

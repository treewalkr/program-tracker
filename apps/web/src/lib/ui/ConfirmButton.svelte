<script lang="ts">
	import Button from './Button.svelte';

	/**
	 * Two-step destructive action: first click arms ("Delete"), second click
	 * within `ms` confirms. Auto-resets after the window closes.
	 */
	interface Props {
		label?: string;
		/** Defaults to "Confirm {label}". */
		confirmLabel?: string;
		onconfirm: () => void;
		/** Armed window in ms before auto-reset. */
		ms?: number;
		small?: boolean;
		disabled?: boolean;
	}

	let { label = 'Delete', confirmLabel, onconfirm, ms = 4000, small = false, disabled = false }: Props = $props();

	let armed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		return () => clearTimeout(timer);
	});

	function click() {
		if (armed) {
			clearTimeout(timer);
			armed = false;
			onconfirm();
		} else {
			armed = true;
			timer = setTimeout(() => (armed = false), ms);
		}
	}
</script>

<Button variant="danger" {small} disabled={disabled || undefined} onclick={click}>
	{armed ? (confirmLabel ?? `Confirm ${label.toLowerCase()}`) : label}
</Button>

<script lang="ts">
	import Button from './Button.svelte';

	/**
	 * Two-step destructive action: first click arms ("Delete"), second click
	 * within `ms` confirms. Auto-resets after the window closes. Idle, the
	 * button is only as wide as its label; armed, it keeps at least that width
	 * (so the pointer stays on it for the second click) and the longer label
	 * may wrap rather than push the row past a phone's edge.
	 */
	interface Props {
		label?: string;
		/** Defaults to "Confirm {label}". */
		confirmLabel?: string;
		onconfirm: () => void;
		/** Armed window in ms before auto-reset. */
		ms?: number;
		variant?: 'default' | 'primary' | 'danger' | 'ghost';
		/** Variant while armed — e.g. a neutral button that only turns red once armed. Defaults to `variant`. */
		armedVariant?: 'default' | 'primary' | 'danger' | 'ghost';
		small?: boolean;
		disabled?: boolean;
		/** Extra classes (e.g. "ghost" for the ghost-danger combo). */
		class?: string;
		/** What it acts on, appended to the accessible name ("Delete FB-013") so a list's buttons differ. */
		subject?: string;
	}

	let {
		label = 'Delete',
		confirmLabel,
		onconfirm,
		ms = 4000,
		variant = 'danger',
		armedVariant,
		small = false,
		disabled = false,
		class: extra,
		subject,
	}: Props = $props();

	let armed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let labelEl = $state<HTMLSpanElement>();
	/** The idle button's width, held while armed so arming never shrinks it. */
	let idleWidth = $state<number | null>(null);

	const armedText = $derived(confirmLabel ?? `Confirm ${label.toLowerCase()}`);
	const text = $derived(armed ? armedText : label);
	const cls = $derived([armed ? 'armed cb-armed' : undefined, extra].filter(Boolean).join(' ') || undefined);

	$effect(() => {
		return () => clearTimeout(timer);
	});

	function click() {
		if (armed) {
			clearTimeout(timer);
			armed = false;
			onconfirm();
		} else {
			idleWidth = labelEl?.closest('.btn')?.getBoundingClientRect().width ?? null;
			armed = true;
			timer = setTimeout(() => (armed = false), ms);
		}
	}
</script>

<Button
	variant={armed ? (armedVariant ?? variant) : variant}
	{small}
	class={cls}
	disabled={disabled || undefined}
	aria-label={subject ? `${text} ${subject}` : undefined}
	style={armed && idleWidth ? `min-width: ${idleWidth}px` : undefined}
	onclick={click}
>
	<span class="cb-label" bind:this={labelEl}>{text}</span>
</Button>

<style>
	/* Armed: a long label wraps inside the row instead of overflowing it. */
	:global(.btn.cb-armed) {
		white-space: normal;
		max-width: 100%;
		justify-content: center;
		text-align: center;
	}
	:global(.btn.cb-armed) .cb-label {
		line-height: 1.2;
	}
	:global(.btn.danger.armed) {
		outline: 2px solid var(--bad);
		outline-offset: 2px;
	}
</style>

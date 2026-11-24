<script lang="ts">
	import type { Snippet } from 'svelte';
	import { keepInView, placePanel } from './place';

	/**
	 * The one open-list panel every select shares: a relative anchor, the trigger,
	 * and a hairline popover underneath — or above it when there's no room below
	 * (the on-screen keyboard counts). Closes on outside press and Esc.
	 */
	interface Props {
		open?: boolean;
		trigger: Snippet;
		children: Snippet;
		/** Shrink-wrap the trigger instead of filling the column. */
		inline?: boolean;
		/** Widest the anchor may grow when it fills the column. */
		maxWidth?: string;
		/** Panel width; defaults to at least the trigger width. */
		panelWidth?: string;
	}

	let { open = $bindable(false), trigger, children, inline = false, maxWidth = '300px', panelWidth }: Props = $props();

	let root = $state<HTMLDivElement>();
	let pop = $state<HTMLDivElement>();
	let up = $state(false);

	/** Rows never drop below about two, whatever the panel's other chrome takes. */
	const MIN_LIST = 80;

	function place() {
		if (!root || !pop) return;
		// Measure at natural height, then cap the list to the room on the chosen side.
		pop.style.removeProperty('--pop-max');
		const h = pop.offsetHeight;
		const list = pop.querySelector<HTMLElement>('[role="listbox"]');
		const chrome = list ? h - list.offsetHeight : 0;
		const vv = window.visualViewport;
		const p = placePanel(root.getBoundingClientRect(), h, vv ? { height: vv.height, offsetTop: vv.offsetTop } : { height: window.innerHeight, offsetTop: 0 });
		up = p.side === 'above';
		pop.style.setProperty('--pop-max', `${Math.max(MIN_LIST, p.maxHeight - chrome)}px`);
		// A shorter list can hide the active row: bring it back.
		const id = trigger_()?.getAttribute('aria-activedescendant');
		const row = id ? document.getElementById(id) : null;
		if (list && row) keepInView(list, row);
	}

	const trigger_ = () => root?.querySelector<HTMLElement>('button:not([tabindex="-1"]), input');

	// A list that starts open (stories, restored state) doesn't take focus on load.
	let quiet = open;

	$effect(() => {
		if (!open || !pop || !root) return;
		// Safari doesn't focus a tapped button: put focus on the trigger so Esc and arrows reach it.
		if (quiet) quiet = false;
		else if (!root.contains(document.activeElement)) trigger_()?.focus({ preventScroll: true });
		place();
		const vv = window.visualViewport;
		vv?.addEventListener('resize', place);
		vv?.addEventListener('scroll', place);
		window.addEventListener('resize', place);
		return () => {
			vv?.removeEventListener('resize', place);
			vv?.removeEventListener('scroll', place);
			window.removeEventListener('resize', place);
		};
	});

	function outside(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !open) return;
		e.stopPropagation();
		open = false;
		trigger_()?.focus();
	}

	/** Esc with focus outside the select (it landed on the page): still closes it. */
	function onwindowkey(e: KeyboardEvent) {
		if (open && root && !root.contains(e.target as Node)) onkeydown(e);
	}
</script>

<svelte:window onpointerdown={outside} onkeydown={onwindowkey} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dd" class:inline bind:this={root} style:max-width={inline ? undefined : maxWidth} {onkeydown}>
	{@render trigger()}
	{#if open}
		<div class="pop" class:up style:width={panelWidth} bind:this={pop}>{@render children()}</div>
	{/if}
</div>

<style>
	.dd { position: relative; width: 100%; }
	.dd.inline { display: inline-block; width: auto; }
	.pop {
		position: absolute;
		z-index: 30;
		top: 100%;
		left: 0;
		margin-top: 4px;
		min-width: 100%;
		width: max-content;
		max-width: min(360px, 90vw);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow-overlay);
		overflow: hidden;
	}
	.pop.up { top: auto; bottom: 100%; margin: 0 0 4px; }
</style>

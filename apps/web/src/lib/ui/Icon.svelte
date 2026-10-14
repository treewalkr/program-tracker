<script module lang="ts">
	export type IconName =
		| 'plus'
		| 'x'
		| 'check'
		| 'sparkle'
		| 'grid'
		| 'users'
		| 'dumbbell'
		| 'layers'
		| 'lock'
		| 'bolt'
		| 'pulse';
</script>

<script lang="ts">
	/**
	 * The app's inline stroke-icon set (24×24 viewBox, currentColor).
	 * Sizes come from context CSS (`.btn svg` 14px, nav 16px, `.tchip svg` 12px);
	 * pass `size` only when the icon stands alone.
	 */
	interface IconDef {
		d: string;
		d2?: string;
		circle?: { cx: number; cy: number; r: number };
		rect?: { x: number; y: number; w: number; h: number; rx: number };
		/** Filled silhouette instead of stroke outline (bolt, pulse). */
		filled?: boolean;
	}

	interface Props {
		name: IconName;
		/** Accessible name; omit for decorative icons. */
		label?: string;
		/** Pixel size when used outside a CSS-sized context. */
		size?: number;
	}

	let { name, label, size }: Props = $props();

	const ICONS: Record<IconName, IconDef> = {
		plus: { d: 'M12 5v14M5 12h14' },
		x: { d: 'M6 6l12 12M18 6 6 18' },
		check: { d: 'M20 6 9 17l-5-5' },
		sparkle: {
			d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z',
		},
		grid: { d: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
		users: {
			d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
			d2: 'M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
			circle: { cx: 9, cy: 7, r: 4 },
		},
		dumbbell: { d: 'M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5', d2: 'M12 2v3M12 19v3M2 12h3M19 12h3' },
		layers: { d: 'M12 3 3 7l9 4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4' },
		lock: { d: 'M8 10V7a4 4 0 0 1 8 0v3', rect: { x: 4, y: 10, w: 16, h: 10, rx: 2 } },
		bolt: { d: 'M13 2 3 14h7l-1 8 10-12h-7l1-8z', filled: true },
		pulse: { d: 'M12 6l7 12H5z', filled: true },
	};

	const icon = $derived(ICONS[name]);
</script>

<svg
	viewBox="0 0 24 24"
	aria-hidden={label ? undefined : 'true'}
	role={label ? 'img' : undefined}
	aria-label={label}
	width={size}
	height={size}
	fill={icon.filled ? 'currentColor' : 'none'}
	stroke={icon.filled ? 'none' : 'currentColor'}
	stroke-width={icon.filled ? undefined : 1.7}
	stroke-linecap="round"
	stroke-linejoin="round"
>
	<path d={icon.d} />
	{#if icon.d2}<path d={icon.d2} />{/if}
	{#if icon.circle}<circle cx={icon.circle.cx} cy={icon.circle.cy} r={icon.circle.r} />{/if}
	{#if icon.rect}<rect x={icon.rect.x} y={icon.rect.y} width={icon.rect.w} height={icon.rect.h} rx={icon.rect.rx} />{/if}
</svg>

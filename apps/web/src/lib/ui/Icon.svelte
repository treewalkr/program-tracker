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
		| 'file'
		| 'star'
		| 'gear'
		| 'comment'
		| 'lock'
		| 'bolt'
		| 'pulse'
		| 'chevron'
		| 'search'
		| 'sidebar'
		| 'signout';
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
		dumbbell: { d: 'M5 7.5h3v9H5zM16 7.5h3v9h-3z', d2: 'M8 12h8M2.5 10v4M21.5 10v4' },
		layers: { d: 'M12 3 3 7l9 4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4' },
		file: { d: 'M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z', d2: 'M14 3v5h5M8.5 13h7M8.5 16.5h4.5' },
		star: { d: 'm12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z' },
		gear: {
			d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
			circle: { cx: 12, cy: 12, r: 3 },
		},
		comment: { d: 'M4 5h16v11h-9l-5 4v-4H4z' },
		lock: { d: 'M8 10V7a4 4 0 0 1 8 0v3', rect: { x: 4, y: 10, w: 16, h: 10, rx: 2 } },
		bolt: { d: 'M13 2 3 14h7l-1 8 10-12h-7l1-8z', filled: true },
		pulse: { d: 'M12 6l7 12H5z', filled: true },
		chevron: { d: 'm6 9 6 6 6-6' },
		search: { d: 'm20 20-4.2-4.2', circle: { cx: 11, cy: 11, r: 7 } },
		signout: { d: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', d2: 'M10 17l-5-5 5-5M5 12h11' },
		sidebar: { d: 'M9 4v16', rect: { x: 3, y: 4, w: 18, h: 16, rx: 2 } },
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

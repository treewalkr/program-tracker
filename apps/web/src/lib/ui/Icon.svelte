<script module lang="ts">
	export type IconName =
		| 'plus'
		| 'minus'
		| 'x'
		| 'check'
		| 'sparkle'
		| 'grid'
		| 'users'
		| 'dumbbell'
		| 'layers'
		| 'link'
		| 'file'
		| 'star'
		| 'gear'
		| 'comment'
		| 'lock'
		| 'mail'
		| 'bolt'
		| 'pulse'
		| 'chevron'
		| 'chevrons-up-down'
		| 'search'
		| 'sidebar'
		| 'signout'
		| 'sun'
		| 'moon'
		| 'monitor'
		| 'thumbs-up'
		| 'thumbs-down'
		| 'list-check'
		| 'send'
		| 'pencil'
		| 'flag'
		| 'pin'
		| 'bell'
		| 'bell-off';
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
		minus: { d: 'M5 12h14' },
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
		link: {
			d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
			d2: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
		},
		layers: { d: 'M12 3 3 7l9 4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4' },
		file: { d: 'M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z', d2: 'M14 3v5h5M8.5 13h7M8.5 16.5h4.5' },
		star: { d: 'm12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z' },
		gear: {
			d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
			circle: { cx: 12, cy: 12, r: 3 },
		},
		comment: { d: 'M4 5h16v11h-9l-5 4v-4H4z' },
		mail: { d: 'm3 7 9 6 9-6', rect: { x: 3, y: 5, w: 18, h: 14, rx: 2 } },
		lock: { d: 'M8 10V7a4 4 0 0 1 8 0v3', rect: { x: 4, y: 10, w: 16, h: 10, rx: 2 } },
		bolt: { d: 'M13 2 3 14h7l-1 8 10-12h-7l1-8z', filled: true },
		pulse: { d: 'M12 6l7 12H5z', filled: true },
		chevron: { d: 'm6 9 6 6 6-6' },
		'chevrons-up-down': { d: 'm7 15 5 5 5-5', d2: 'm7 9 5-5 5 5' },
		search: { d: 'm20 20-4.2-4.2', circle: { cx: 11, cy: 11, r: 7 } },
		signout: { d: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', d2: 'M10 17l-5-5 5-5M5 12h11' },
		sidebar: { d: 'M9 4v16', rect: { x: 3, y: 4, w: 18, h: 16, rx: 2 } },
		sun: {
			d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
			circle: { cx: 12, cy: 12, r: 4 },
		},
		moon: { d: 'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z' },
		monitor: { d: 'M8 21h8M12 17v4', rect: { x: 3, y: 4, w: 18, h: 13, rx: 2 } },
		'thumbs-up': {
			d: 'M7 10v12',
			d2: 'M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z',
		},
		'thumbs-down': {
			d: 'M17 14V2',
			d2: 'M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z',
		},
		'list-check': { d: 'M11 6h10M11 12h10M11 18h10', d2: 'm3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17' },
		pencil: { d: 'M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16z', d2: 'M13.5 6.5l4 4' },
		send: { d: 'M22 2 11 13', d2: 'M22 2l-7 20-4-9-9-4z' },
		flag: { d: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', d2: 'M4 22v-7' },
		pin: { d: 'M12 17v5', d2: 'M9 3h6M10 3v7l-4 4v3h12v-3l-4-4V3' },
		bell: {
			d: 'M10.268 21a2 2 0 0 0 3.464 0',
			d2: 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
		},
		'bell-off': {
			d: 'M10.268 21a2 2 0 0 0 3.464 0M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05',
			d2: 'm2 2 20 20',
		},
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

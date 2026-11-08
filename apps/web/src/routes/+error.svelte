<script lang="ts">
	import { page } from '$app/state';
	import PageHead from '$lib/ui/PageHead.svelte';
	import Panel from '$lib/ui/Panel.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';

	/**
	 * App-wide error page, rendered inside the shell. A 404 cites the
	 * requested address segment by segment, links the deepest part that
	 * exists, and offers the nearest real destinations.
	 */
	type Dest = { href: string; label: string; icon: IconName; hint: string };

	/** Sections a broken link most often sits under — longest prefix wins. */
	const sections: Dest[] = [
		{ href: '/clients', label: 'Clients', icon: 'users', hint: 'Every client, their program and log' },
		{ href: '/exercises', label: 'Exercise library', icon: 'dumbbell', hint: 'Catalog and custom exercises' },
		{ href: '/session-types', label: 'Session types', icon: 'layers', hint: 'Session templates by type' },
		{ href: '/vocabulary', label: 'Vocabulary', icon: 'pencil', hint: 'Your shorthand and terms' },
		{ href: '/chains', label: 'Kinetic chains', icon: 'link', hint: 'Chain map and balance' },
		{ href: '/templates', label: 'Templates', icon: 'file', hint: 'Instruction templates' },
		{ href: '/examples', label: 'Examples', icon: 'star', hint: 'Programs the AI learns from' },
		{ href: '/rules', label: 'Coaching rules', icon: 'list-check', hint: 'Learned preferences' },
		{ href: '/admin/clients', label: 'All clients', icon: 'users', hint: 'Every client on the platform' },
		{ href: '/admin', label: 'Trainers', icon: 'lock', hint: 'Platform trainers' },
		{ href: '/feedback', label: 'Feedback', icon: 'comment', hint: 'Reports and replies' },
		{ href: '/settings', label: 'Settings', icon: 'gear', hint: 'Account, models and preferences' },
	];
	const overview: Dest = { href: '/', label: 'Overview', icon: 'grid', hint: 'This week across all clients' };
	const clients = sections[0];

	const status = $derived(page.status);
	const notFound = $derived(status === 404);
	const path = $derived(page.url.pathname);

	const parent = $derived(
		sections.find((s) => path === s.href || path.startsWith(s.href + '/')) ?? null,
	);

	/** Path segments, each with the href it would resolve to; the matched section is "live". */
	const trail = $derived.by(() => {
		const parts = path.split('/').filter(Boolean);
		return parts.map((part, i) => {
			const href = '/' + parts.slice(0, i + 1).join('/');
			return { part: decodeURIComponent(part), href, live: !!parent && href === parent.href };
		});
	});

	const rest = $derived(parent ? path.slice(parent.href.length + 1) : path.slice(1));

	const destinations = $derived(
		[parent, overview, clients].filter(
			(d, i, all): d is Dest => !!d && all.findIndex((o) => o?.href === d.href) === i,
		),
	);

	const canGoBack = typeof history !== 'undefined' && history.length > 1;
</script>

<svelte:head>
	<title>{notFound ? 'Page not found' : 'Something went wrong'} · Program Tracker</title>
</svelte:head>

<div class="err-page">
<PageHead
	title={notFound ? 'Page not found' : 'Something went wrong'}
	sub={notFound
		? 'Nothing lives at this address. The link may be mistyped or out of date.'
		: (page.error?.message ?? 'The page failed to load.')}
>
	{#snippet actions()}
		{#if !notFound}
			<Button onclick={() => location.reload()}>Try again</Button>
		{:else if canGoBack}
			<Button onclick={() => history.back()}>Go back</Button>
		{/if}
	{/snippet}
</PageHead>

	<Panel title="Requested address" count={status}>
		<div class="panel-body">
			<p class="trail" aria-label="Requested path">
				<span class="sep">/</span>{#each trail as seg, i (seg.href)}{#if i > 0}<span class="sep">/</span>{/if}{#if seg.live}<a
							class="seg live"
							href={seg.href}>{seg.part}</a
						>{:else}<span class="seg" class:dead={notFound && (!parent || seg.href.length > parent.href.length)}
							>{seg.part}</span
						>{/if}{/each}
			</p>

			{#if notFound}
				<p class="why">
					{#if parent && rest}
						<code>{parent.href}</code> exists, but nothing under it matches <code>{rest}</code>.
					{:else if trail.length}
						No section of the app starts with <code>/{trail[0].part}</code>.
					{:else}
						The overview should load here — try reloading.
					{/if}
				</p>
			{:else}
				<p class="why">The server returned status <code>{status}</code>. Your data is unchanged.</p>
			{/if}
		</div>

		<nav aria-label="Where to go instead">
			<ul class="dests">
				{#each destinations as d (d.href)}
					<li>
						<a class="dest" href={d.href}>
							<span class="dest-icon"><Icon name={d.icon} /></span>
							<span class="dest-text">
								<span class="dest-label">{d === parent ? `Back to ${d.label.toLowerCase()}` : d.label}</span>
								<span class="dest-hint">{d.hint}</span>
							</span>
							<code class="dest-path">{d.href}</code>
							<span class="dest-go"><Icon name="chevron" /></span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</Panel>
</div>

<style>
	.err-page {
		max-width: var(--measure-form);
	}

	.trail {
		margin: 0;
		font: 500 15px/1.5 var(--font-mono);
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.sep {
		color: var(--faint);
		padding: 0 2px;
	}
	.seg.live {
		color: var(--blue);
	}
	.seg.dead {
		color: var(--bad);
		text-decoration: line-through;
		text-decoration-thickness: 1px;
		text-decoration-color: var(--bad-line);
	}

	.why {
		margin: 8px 0 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--muted);
		max-width: var(--measure-prose);
	}
	.why code {
		color: var(--ink);
		background: var(--chip-bg);
		border-radius: 6px;
		padding: 1px 5px;
		overflow-wrap: anywhere;
	}

	.dests {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--line);
	}
	.dests li + li {
		border-top: 1px solid var(--line-soft);
	}
	.dest {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		color: var(--ink);
		text-decoration: none;
		transition: background-color 120ms ease-out;
	}
	.dest:hover {
		background: var(--row-hover);
		text-decoration: none;
	}
	.dest:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	.dest-icon {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		flex: none;
		border-radius: var(--radius);
		background: var(--well);
		border: 1px solid var(--line-soft);
		color: var(--muted);
	}
	.dest-icon :global(svg),
	.dest-go :global(svg) {
		width: 16px;
		height: 16px;
		stroke-width: 1.6;
	}
	.dest-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		flex: 1;
	}
	.dest-label {
		font: 600 14px/1.3 var(--font-ui);
	}
	.dest:hover .dest-label {
		color: var(--blue);
	}
	.dest-hint {
		font: 400 13px/1.4 var(--font-ui);
		color: var(--muted);
	}
	.dest-path {
		color: var(--faint);
	}
	.dest-go {
		display: grid;
		color: var(--faint);
		transform: rotate(-90deg);
	}
	.dest:hover .dest-go {
		color: var(--ink);
	}

	@media (max-width: 520px) {
		.dest-path {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.dest {
			transition: none;
		}
	}
</style>

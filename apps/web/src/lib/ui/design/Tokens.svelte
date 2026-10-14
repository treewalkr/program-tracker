<script lang="ts">
	/**
	 * Primer design-token reference. Swatches and specimens read live from the
	 * `:root` custom properties in `src/app.css`, so this page cannot drift
	 * from the shipped system.
	 */
	type Section = 'all' | 'canvas' | 'functional' | 'ramp' | 'rpe' | 'type' | 'radii' | 'rules';

	interface Swatch {
		v: string;
		note: string;
	}

	let { section = 'all' }: { section?: Section } = $props();

	const canvas: Swatch[] = [
		{ v: '--bg', note: 'Canvas White · page background' },
		{ v: '--surface', note: 'Panel surfaces' },
		{ v: '--well', note: 'Well Gray · sidebar, panel heads, inputs, default buttons' },
		{ v: '--well-2', note: 'Well Gray Deep · hover layer' },
		{ v: '--active', note: 'Well Gray Active · selected nav' },
		{ v: '--ink', note: 'Ink · primary text' },
		{ v: '--muted', note: 'Muted Ink · secondary text, placeholders' },
		{ v: '--faint', note: 'Faint Ink · tertiary metadata' },
		{ v: '--line', note: 'Hairline Gray · 1px borders' },
		{ v: '--line-soft', note: 'Hairline Soft · row separators' },
		{ v: '--line-strong', note: 'Hairline Strong · hover borders' },
		{ v: '--hover-ink', note: 'Inverted Ink · toggle chips, brand mark' },
	];

	const functional: Swatch[] = [
		{ v: '--green-btn', note: 'Action Green · primary button, lamp green' },
		{ v: '--green-btn-hov', note: 'Action Green hover' },
		{ v: '--good', note: 'Commit Green · success / delta-up ink, easy RPE' },
		{ v: '--good-bg', note: 'Commit Green tint · good pill' },
		{ v: '--good-line', note: 'Commit Green edge' },
		{ v: '--blue', note: 'Link Blue · links, snooze, changed diff' },
		{ v: '--blue-hov', note: 'Link Blue hover' },
		{ v: '--focus', note: 'Focus Blue · :focus-visible outline' },
		{ v: '--pulse-now-bg', note: 'Pulse Blue tint · today cell, current pulse row' },
		{ v: '--bad', note: 'Danger Red · destructive, failed, delta-down' },
		{ v: '--bad-bg', note: 'Danger Red tint · bad pill, missed cells' },
		{ v: '--bad-line', note: 'Danger Red edge' },
		{ v: '--warn', note: 'Attention Amber · warn ink, hard RPE (7–8)' },
		{ v: '--warn-bg', note: 'Attention Amber tint' },
		{ v: '--warn-line', note: 'Attention Amber edge' },
	];

	const ramp: Swatch[] = [
		{ v: '--done-1', note: 'ramp step 1 · lightest' },
		{ v: '--done-2', note: 'ramp step 2' },
		{ v: '--done-3', note: 'ramp step 3' },
		{ v: '--done-4', note: 'ramp step 4 · logged week cells' },
	];

	const rpe: Swatch[] = [
		{ v: '--rpe-low', note: 'RPE ≤ 6 · easy' },
		{ v: '--rpe-mid', note: 'RPE 7–8 · hard' },
		{ v: '--rpe-high', note: 'RPE 9–10 · maximal' },
	];

	const rules = [
		{
			name: 'The Ink-on-Tint Rule',
			body: 'Status is colored ink on its soft tint, never a saturated fill. The only saturated fills are the green primary button and the logged contributions cell.',
		},
		{
			name: 'The Tabular Figure Rule',
			body: 'Any compared number renders in ui-monospace with tabular-nums, right-aligned in sheet tables. Counts inside pills are labels, not figures.',
		},
		{
			name: 'The System-Stack Rule',
			body: 'System UI sans + ui-monospace are the committed identity. Never load a webfont or add a display typeface.',
		},
		{
			name: 'The Fixed Radii Rule',
			body: 'Three radii exist — 6px containers/controls, 99px pills, 4px data cells — and no others.',
		},
		{
			name: 'The Hairline Rule',
			body: 'Surfaces are separated by 1px hairlines and layered by well tint, never by shadow. The button lip and focus halo are the entire shadow budget.',
		},
	];

	let values = $state<Record<string, string>>({});

	$effect(() => {
		const cs = getComputedStyle(document.documentElement);
		const next: Record<string, string> = {};
		for (const { v } of [...canvas, ...functional, ...ramp, ...rpe]) {
			next[v] = cs.getPropertyValue(v).trim();
		}
		values = next;
	});

	const show = (s: Section) => section === 'all' || section === s;
</script>

<div class="tokens">
	{#if show('canvas')}
		<section class="panel">
			<header class="panel-head"><h2>Canvas &amp; ink</h2></header>
			<div class="panel-body">
				<ul class="swatches">
					{#each canvas as s (s.v)}
						<li>
							<span class="chip" style:background={`var(${s.v})`}></span>
							<span class="meta">
								<code>{s.v}</code>
								<span class="val">{values[s.v]}</span>
								<span class="note">{s.note}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}

	{#if show('functional')}
		<section class="panel">
			<header class="panel-head"><h2>Functional</h2></header>
			<div class="panel-body">
				<ul class="swatches">
					{#each functional as s (s.v)}
						<li>
							<span class="chip" style:background={`var(${s.v})`}></span>
							<span class="meta">
								<code>{s.v}</code>
								<span class="val">{values[s.v]}</span>
								<span class="note">{s.note}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}

	{#if show('ramp')}
		<section class="panel">
			<header class="panel-head"><h2>Contributions ramp</h2></header>
			<div class="panel-body">
				<ul class="swatches">
					{#each ramp as s (s.v)}
						<li>
							<span class="chip" style:background={`var(${s.v})`}></span>
							<span class="meta">
								<code>{s.v}</code>
								<span class="val">{values[s.v]}</span>
								<span class="note">{s.note}</span>
							</span>
						</li>
					{/each}
				</ul>
				<p class="sub">Logged intensity walks the full 4 steps; logged week cells pin to done-4 for 4.5:1 on the white tag.</p>
			</div>
		</section>
	{/if}

	{#if show('rpe')}
		<section class="panel">
			<header class="panel-head"><h2>RPE effort scale</h2></header>
			<div class="panel-body">
				<ul class="swatches">
					{#each rpe as s (s.v)}
						<li>
							<span class="chip" style:background={`var(${s.v})`}></span>
							<span class="meta">
								<code>{s.v}</code>
								<span class="val">{values[s.v]}</span>
								<span class="note">{s.note}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}

	{#if show('type')}
		<section class="panel">
			<header class="panel-head"><h2>Typography</h2></header>
			<div class="panel-body">
				<ul class="type">
					<li><h1>Headline — 600 / 20px / 1.25</h1><span class="note">page titles</span></li>
					<li><h2>Title — 600 / 16px / 1.3</h2><span class="note">section titles</span></li>
					<li><p>Body — 400 / 14px / 1.5. Prose, table cells, buttons, nav.</p><span class="note">base size</span></li>
					<li><span class="lbl">Label — 500 / 12px / 1.2</span><span class="note">pills, counters, chips</span></li>
					<li><span class="mono-fig">3×8 @8 3m</span><span class="note">mono figures — 500 / 12px / tabular-nums</span></li>
				</ul>
			</div>
		</section>
	{/if}

	{#if show('radii')}
		<section class="panel">
			<header class="panel-head"><h2>Radii &amp; breakpoints</h2></header>
			<div class="panel-body">
				<ul class="radii">
					<li><span class="rbox" style:border-radius="4px">4px</span><span class="note">data cells · week grid, heat squares</span></li>
					<li><span class="rbox" style:border-radius="6px">6px</span><span class="note">containers &amp; controls · panels, buttons, inputs</span></li>
					<li><span class="rbox" style:border-radius="99px">99px</span><span class="note">pills · labels, counters, toggle chips, lamps</span></li>
				</ul>
				<p class="sub mono">
					860 sidebar→rail · 1060 overview stacks · 900 detail columns stack · 520 signal actions wrap
				</p>
			</div>
		</section>
	{/if}

	{#if show('rules')}
		<section class="panel">
			<header class="panel-head"><h2>Named rules</h2></header>
			<div class="panel-body">
				<ul class="rules">
					{#each rules as r (r.name)}
						<li>
							<strong>{r.name}</strong>
							<p class="sub">{r.body}</p>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/if}
</div>

<style>
	.tokens {
		display: flex;
		flex-direction: column;
		gap: 16px;
		max-width: 720px;
	}

	.swatches {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
		gap: 10px 16px;
	}
	.swatches li {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		min-width: 0;
	}
	.chip {
		width: 26px;
		height: 26px;
		flex: none;
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.meta code {
		font-size: 12px;
		color: var(--ink);
	}
	.val {
		font: 400 11px/1.2 var(--font-mono);
		color: var(--faint);
	}
	.note {
		font-size: 11px;
		line-height: 1.4;
		color: var(--muted);
	}

	.type {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.type li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	.type p {
		margin: 0;
	}
	.type .lbl {
		font: 500 12px/1.2 var(--font-ui);
	}
	.type .mono-fig {
		font: 500 12px var(--font-mono);
		font-variant-numeric: tabular-nums;
	}

	.radii {
		list-style: none;
		margin: 0 0 10px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.radii li {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.rbox {
		display: grid;
		place-items: center;
		width: 58px;
		height: 34px;
		border: 1px solid var(--line);
		background: var(--well);
		font: 500 12px var(--font-mono);
		color: var(--ink);
	}

	.rules {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.rules strong {
		font-size: 14px;
		font-weight: 600;
	}
	.rules .sub {
		margin: 2px 0 0;
	}

	.panel-body :global(.sub) {
		margin: 12px 0 0;
	}
</style>

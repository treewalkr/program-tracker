<script lang="ts">
	import type { LlmDatasetStats } from '$lib/api/admin';
	import Panel from '$lib/ui/Panel.svelte';

	/**
	 * What the LLM log has collected so far: final calls per purpose by label
	 * (gold = accepted as written, silver = trainer-corrected, negative =
	 * rejected or 👎), plus the raw attempt and feedback volume behind them.
	 * Real calls only — demo/mock calls are counted apart.
	 */
	interface Props {
		stats: LlmDatasetStats;
	}

	let { stats }: Props = $props();

	const PURPOSE: Record<string, string> = {
		block_generate: 'Block draft',
		week_generate: 'Week draft',
		revision: 'Block revision',
		week_revision: 'Week revision',
		proposal_turn: 'Chat proposal',
		chat_qa: 'Chat answer',
		client_message: 'Client message',
		distill: 'Preference distill',
	};

	const n = new Intl.NumberFormat();
	const labeled = $derived(stats.byPurpose.reduce((sum, r) => sum + r.gold + r.silver + r.negative, 0));
	const totals = $derived(
		stats.byPurpose.reduce(
			(t, r) => ({
				gold: t.gold + r.gold,
				silver: t.silver + r.silver,
				negative: t.negative + r.negative,
				unlabeled: t.unlabeled + r.unlabeled,
			}),
			{ gold: 0, silver: 0, negative: 0, unlabeled: 0 }
		)
	);
	const attempts = $derived(stats.attempts.reduce((sum, a) => sum + a.n, 0));
	const failed = $derived(stats.attempts.filter((a) => a.status !== 'ok'));
</script>

<Panel title="AI dataset" count={`${n.format(labeled)} labeled`}>
	{#if stats.byPurpose.length === 0}
		<p class="empty">No live AI calls logged yet. Drafts, chat answers and client messages land here as trainers use them.</p>
	{:else}
		<div class="panel-body tight wrap">
			<table class="sheet">
				<thead>
					<tr>
						<th>Purpose</th>
						<th class="r" title="Accepted as written">Gold</th>
						<th class="r" title="Accepted after the trainer corrected it">Silver</th>
						<th class="r" title="Rejected, regenerated, ignored or 👎">Negative</th>
						<th class="r" title="No verdict yet">Unlabeled</th>
					</tr>
				</thead>
				<tbody>
					{#each stats.byPurpose as r (r.purpose)}
						<tr>
							<td>{PURPOSE[r.purpose] ?? r.purpose}</td>
							<td class="r">{n.format(r.gold)}</td>
							<td class="r">{n.format(r.silver)}</td>
							<td class="r">{n.format(r.negative)}</td>
							<td class="r muted">{n.format(r.unlabeled)}</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr>
						<td>All purposes</td>
						<td class="r">{n.format(totals.gold)}</td>
						<td class="r">{n.format(totals.silver)}</td>
						<td class="r">{n.format(totals.negative)}</td>
						<td class="r muted">{n.format(totals.unlabeled)}</td>
					</tr>
				</tfoot>
			</table>
		</div>
	{/if}
	<p class="foot">
		<span><span class="num">{n.format(attempts)}</span> attempts{#if failed.length}
				({failed.map((f) => `${n.format(f.n)} ${f.status.replace('_', ' ')}`).join(', ')}){/if}</span>
		<span><span class="num">{n.format(stats.feedback.explicit)}</span> thumbs · <span class="num">{n.format(stats.feedback.implicit)}</span> implicit verdicts</span>
		<span><span class="num">{n.format(stats.pairs)}</span> preference {stats.pairs === 1 ? 'pair' : 'pairs'}</span>
		<span><span class="num">{n.format(stats.tokens.in)}</span> in / <span class="num">{n.format(stats.tokens.out)}</span> out tokens</span>
		{#if stats.mockCalls}<span class="muted">{n.format(stats.mockCalls)} demo calls not counted</span>{/if}
	</p>
</Panel>

<style>
	.wrap {
		overflow-x: auto;
	}
	tfoot td {
		font-weight: 600;
		border-top: 1px solid var(--line);
	}
	.muted {
		color: var(--muted);
	}
	.empty {
		margin: 0;
		padding: 28px 18px;
		text-align: center;
		color: var(--muted);
	}
	.foot {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin: 0;
		padding: 10px 16px;
		border-top: 1px solid var(--line-soft);
		font-size: 12px;
		color: var(--muted);
	}
	.foot .num {
		color: var(--ink);
	}
</style>

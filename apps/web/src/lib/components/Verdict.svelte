<script lang="ts">
	import { untrack } from 'svelte';
	import { LLM_REASON_LABELS, LLM_REASON_TAGS, NOTE_SCOPES, NOTE_SCOPE_LABELS, type LlmReasonTag } from '@pt/shared';
	import { api } from '$lib/api';
	import type { CoachingRuleDto, LlmSubjectKindDto, LlmVerdictDto, NoteScopeDto } from '$lib/api/types';
	import LearnedRule from './LearnedRule.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import ToggleChip from '$lib/ui/ToggleChip.svelte';

	/**
	 * The trainer's 👍/👎 on one AI output. Thumbs up records at once; thumbs
	 * down opens a small inline tray for optional reasons and a note. Insert-only
	 * on the API — the latest verdict wins. Quiet by design: two muted icon
	 * buttons until used, then ink-on-tint for the chosen one.
	 */
	interface Props {
		subjectKind: LlmSubjectKindDto;
		subjectId: string;
		/** Known verdict (null = none). Omit to let the component load its own. */
		initial?: LlmVerdictDto | null;
		/** What is being rated, for the accessible names ("reply", "draft"…). */
		noun?: string;
		/** The client the output is about — enables "This client" as a scope. */
		clientId?: string | null;
		clientName?: string | null;
	}

	let { subjectKind, subjectId, initial, noun = 'reply', clientId = null, clientName = null }: Props = $props();

	let verdict = $state<LlmVerdictDto | null>(untrack(() => initial ?? null));
	let open = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let tags = $state<LlmReasonTag[]>([]);
	let comment = $state('');
	let correction = $state('');
	let scope = $state<NoteScopeDto>('once');
	/** A rule proposed from the last 👎 (waits for Keep / Dismiss). */
	let learned = $state<CoachingRuleDto | null>(null);
	const worded = $derived(comment.trim().length > 0 || correction.trim().length > 0);

	$effect(() => {
		if (initial !== undefined) {
			verdict = initial;
			return;
		}
		const id = subjectId;
		verdict = null;
		open = false;
		let live = true;
		api
			.llmVerdicts([id])
			.then((found) => {
				if (live) verdict = found[0] ?? null;
			})
			.catch(() => {});
		return () => {
			live = false;
		};
	});

	async function save(signal: 'thumbs_up' | 'thumbs_down') {
		saving = true;
		error = null;
		try {
			const res = await api.rateLlmOutput({
				subjectKind,
				subjectId,
				signal,
				...(signal === 'thumbs_down'
					? {
							reasonTags: [...tags],
							comment: comment.trim() || undefined,
							correction: correction.trim() || undefined,
							...(worded ? { scope } : {}),
						}
					: {}),
			});
			const { rule, ruleError: _, ...rest } = res;
			verdict = rest;
			learned = rule ?? null;
			open = false;
		} catch (err) {
			error = (err as Error).message || 'Not saved';
		} finally {
			saving = false;
		}
	}

	function up() {
		if (verdict?.signal === 'thumbs_up' || saving) return;
		open = false;
		void save('thumbs_up');
	}

	function down() {
		if (open) {
			open = false;
			return;
		}
		tags = verdict?.signal === 'thumbs_down' ? [...verdict.reasonTags] : [];
		comment = verdict?.signal === 'thumbs_down' ? (verdict.comment ?? '') : '';
		correction = verdict?.signal === 'thumbs_down' ? (verdict.correction ?? '') : '';
		scope = 'once';
		error = null;
		open = true;
	}

	function toggle(tag: LlmReasonTag) {
		tags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
	}

	const isUp = $derived(verdict?.signal === 'thumbs_up');
	const isDown = $derived(verdict?.signal === 'thumbs_down');
	const summary = $derived(
		isDown && !open
			? [
					...(verdict?.reasonTags ?? []).map((t) => LLM_REASON_LABELS[t]),
					verdict?.comment ? `“${verdict.comment}”` : null,
					verdict?.correction ? `→ ${verdict.correction}` : null,
				]
					.filter(Boolean)
					.join(' · ')
			: ''
	);
</script>

<div class="verdict">
	<div class="row">
		<button
			type="button"
			class="thumb"
			class:up={isUp}
			aria-pressed={isUp}
			aria-label="Good {noun}"
			title="Good {noun}"
			disabled={saving}
			onclick={up}
		>
			<Icon name="thumbs-up" />
		</button>
		<button
			type="button"
			class="thumb"
			class:down={isDown}
			class:open
			aria-pressed={isDown}
			aria-expanded={open}
			aria-label="Bad {noun}"
			title="Bad {noun}"
			disabled={saving}
			onclick={down}
		>
			<Icon name="thumbs-down" />
		</button>
		{#if summary}<span class="summary">{summary}</span>{/if}
		{#if error && !open}<span class="err" role="alert">{error}</span>{/if}
	</div>

	{#if open}
		<div class="tray">
			<span class="ask">What was off? Optional.</span>
			<div class="chips">
				{#each LLM_REASON_TAGS as tag (tag)}
					<ToggleChip on={tags.includes(tag)} onclick={() => toggle(tag)}>{LLM_REASON_LABELS[tag]}</ToggleChip>
				{/each}
			</div>
			<input
				class="input note"
				placeholder="What was wrong (optional)"
				aria-label="What was wrong"
				maxlength={2000}
				bind:value={comment}
				onkeydown={(e) => {
					if (e.key === 'Enter') void save('thumbs_down');
					if (e.key === 'Escape') open = false;
				}}
			/>
			<input
				class="input note"
				placeholder="What instead (optional)"
				aria-label="What instead"
				maxlength={2000}
				bind:value={correction}
				onkeydown={(e) => {
					if (e.key === 'Enter') void save('thumbs_down');
					if (e.key === 'Escape') open = false;
				}}
			/>
			{#if worded}
				<div class="scope" role="group" aria-label="Should it apply again?">
					<span class="ask">Apply again?</span>
					{#each NOTE_SCOPES as s (s)}
						{#if s !== 'client' || clientId}
							<ToggleChip on={scope === s} onclick={() => (scope = s)}>
								{s === 'client' && clientName ? clientName : NOTE_SCOPE_LABELS[s]}
							</ToggleChip>
						{/if}
					{/each}
				</div>
			{/if}
			<div class="actions">
				<Button small disabled={saving} onclick={() => save('thumbs_down')}>{saving ? (worded && scope !== 'once' ? 'Saving · learning…' : 'Saving…') : 'Save'}</Button>
				<Button small variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				{#if error}<span class="err" role="alert">{error}</span>{/if}
			</div>
		</div>
	{/if}
	{#if learned && !open}
		{#key learned.id}<LearnedRule rule={learned} {clientId} {clientName} />{/key}
	{/if}
</div>

<style>
	.verdict {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 2px;
		min-width: 0;
	}
	.thumb {
		display: inline-grid;
		place-items: center;
		width: 26px;
		height: 26px;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		color: var(--faint);
		cursor: pointer;
		transition: background-color 120ms, color 120ms;
	}
	.thumb :global(svg) {
		width: 14px;
		height: 14px;
	}
	.thumb:hover:not(:disabled) {
		background: var(--well-2);
		color: var(--ink);
	}
	.thumb:disabled {
		cursor: progress;
	}
	.thumb.open {
		background: var(--well-2);
		color: var(--ink);
	}
	.thumb.up {
		color: var(--good);
		background: var(--good-bg);
		border-color: var(--good-line);
	}
	.thumb.down {
		color: var(--bad);
		background: var(--bad-bg);
		border-color: var(--bad-line);
	}
	.summary {
		margin-left: 6px;
		font-size: 12px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.tray {
		display: grid;
		gap: 8px;
		max-width: 560px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
	}
	.ask {
		font-size: 12px;
		font-weight: 500;
		color: var(--muted);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.note {
		width: 100%;
		font-size: 13px;
	}
	.scope {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
	}
	.scope .ask {
		margin-right: 4px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.err {
		font-size: 12px;
		font-weight: 500;
		color: var(--bad);
	}
	@media (prefers-reduced-motion: reduce) {
		.thumb {
			transition: none;
		}
	}
</style>

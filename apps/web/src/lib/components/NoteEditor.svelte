<script lang="ts">
	import { onMount } from 'svelte';
	import { NOTE_SCOPES, NOTE_SCOPE_LABELS, anchorText } from '@pt/shared';
	import { api } from '$lib/api';
	import type {
		CoachingRuleDto,
		LlmNoteDto,
		LlmSubjectKindDto,
		NoteAnchorDto,
		NoteScopeDto
	} from '$lib/api/types';
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import ToggleChip from '$lib/ui/ToggleChip.svelte';
	import LearnedRule from './LearnedRule.svelte';

	/**
	 * A note pinned to one part of an AI output: what's off, what to do
	 * instead, and whether it should apply again. Scope other than "Just this
	 * once" asks the AI for a rule, which waits for the trainer's OK below.
	 * On a draft, "Apply to this draft" turns the note into the next version.
	 */
	interface Props {
		subjectKind: LlmSubjectKindDto;
		subjectId: string;
		anchor: NoteAnchorDto;
		clientId?: string | null;
		clientName?: string | null;
		/** Offer "Apply to this draft" after saving (drafts that can still be revised). */
		onapply?: (note: LlmNoteDto) => Promise<void>;
		onsaved?: (note: LlmNoteDto) => void;
		onclose: () => void;
	}

	let { subjectKind, subjectId, anchor, clientId = null, clientName = null, onapply, onsaved, onclose }: Props = $props();

	let comment = $state('');
	let correction = $state('');
	let scope = $state<NoteScopeDto>('once');
	let brokeRuleId = $state('');
	let rules = $state<CoachingRuleDto[]>([]);
	let saving = $state(false);
	let applying = $state(false);
	let error = $state<string | null>(null);
	let saved = $state<LlmNoteDto | null>(null);
	let learned = $state<CoachingRuleDto | null>(null);
	let ruleError = $state<string | null>(null);
	let applied = $state(false);

	const where = $derived(anchorText(anchor));
	const canSave = $derived(!saving && (comment.trim().length > 0 || correction.trim().length > 0));
	const uid = $props.id();

	onMount(() => {
		api
			.coachingRules()
			.then((all) => {
				rules = all.filter((r) => r.status === 'active' && (r.clientId === null || r.clientId === clientId));
			})
			.catch(() => {});
	});

	async function save() {
		if (!canSave) return;
		saving = true;
		error = null;
		try {
			const res = await api.addNote({
				subjectKind,
				subjectId,
				anchor,
				comment: comment.trim(),
				...(correction.trim() ? { correction: correction.trim() } : {}),
				scope,
				...(brokeRuleId ? { violatedRuleId: brokeRuleId } : {})
			});
			saved = res.note;
			learned = res.rule;
			ruleError = res.ruleError;
			onsaved?.(res.note);
		} catch (err) {
			error = (err as Error).message || 'Not saved';
		} finally {
			saving = false;
		}
	}

	function escape(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	async function apply() {
		if (!saved || !onapply) return;
		applying = true;
		error = null;
		try {
			await onapply(saved);
			applied = true;
		} catch (err) {
			error = (err as Error).message || 'Could not apply';
		} finally {
			applying = false;
		}
	}
</script>

<div class="note-ed" role="group" aria-labelledby="{uid}-where">
	<div class="top">
		<Icon name="comment" />
		<span id="{uid}-where" class="where">Note on <strong>{where}</strong></span>
		<button type="button" class="x" aria-label="Close note" onclick={onclose}><Icon name="x" /></button>
	</div>

	{#if !saved}
		<form
			class="body"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<label class="field">
				<span class="lbl">What's off?</span>
				<!-- svelte-ignore a11y_autofocus -->
				<textarea class="textarea" rows="2" maxlength={2000} placeholder="Too heavy right after a deload week" bind:value={comment} onkeydown={escape} autofocus></textarea>
			</label>
			<label class="field">
				<span class="lbl">What instead <span class="opt">optional</span></span>
				<input class="input" maxlength={2000} placeholder="Belt squat 3×8 @ RPE 7" bind:value={correction} onkeydown={escape} />
			</label>
			<div class="field">
				<span class="lbl" id="{uid}-scope">Should it apply again?</span>
				<div class="chips" role="group" aria-labelledby="{uid}-scope">
					{#each NOTE_SCOPES as s (s)}
						{#if s !== 'client' || clientId}
							<ToggleChip on={scope === s} onclick={() => (scope = s)}>
								{s === 'client' && clientName ? clientName : NOTE_SCOPE_LABELS[s]}
							</ToggleChip>
						{/if}
					{/each}
				</div>
				{#if scope !== 'once'}<span class="hint">The AI suggests a rule from this note. You confirm it before any draft uses it.</span>{/if}
			</div>
			{#if rules.length > 0}
				<label class="field">
					<span class="lbl">Broke a rule? <span class="opt">optional</span></span>
					<select class="select" bind:value={brokeRuleId}>
						<option value="">No</option>
						{#each rules as r (r.id)}
							<option value={r.id}>{r.text.length > 80 ? `${r.text.slice(0, 77)}…` : r.text}</option>
						{/each}
					</select>
				</label>
			{/if}
			<div class="actions">
				<Button small type="submit" disabled={!canSave}>{saving ? (scope === 'once' ? 'Saving…' : 'Saving · learning…') : 'Save note'}</Button>
				<Button small variant="ghost" type="button" onclick={onclose}>Cancel</Button>
				{#if error}<span class="err" role="alert">{error}</span>{/if}
			</div>
		</form>
	{:else}
		<div class="body">
			<p class="saved">
				<span class="said">{saved.comment ?? ''}</span>{#if saved.correction}<span class="instead">→ {saved.correction}</span>{/if}
			</p>
			{#if onapply}
				<div class="actions">
					{#if applied}
						<span class="done"><Icon name="check" />Applied — the new version is open.</span>
					{:else}
						<Button small disabled={applying} onclick={apply}>{applying ? 'Revising…' : 'Apply to this draft'}</Button>
						<span class="hint">Makes the next version with just this change.</span>
					{/if}
				</div>
			{/if}
			{#if learned}
				<LearnedRule rule={learned} {clientId} {clientName} />
			{:else if ruleError}
				<span class="hint">Saved. No rule this time: {ruleError}</span>
			{/if}
			{#if error}<span class="err" role="alert">{error}</span>{/if}
		</div>
	{/if}
</div>

<style>
	.note-ed {
		display: grid;
		gap: 10px;
		max-width: 560px;
		padding: 10px 12px 12px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--muted);
		min-width: 0;
	}
	.top :global(svg) {
		width: 13px;
		height: 13px;
		flex: none;
	}
	.where {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.where strong {
		font-weight: 500;
		color: var(--ink);
	}
	.x {
		margin-left: auto;
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: 6px;
		background: none;
		color: var(--faint);
		cursor: pointer;
	}
	.x:hover {
		background: var(--well-2);
		color: var(--ink);
	}
	.body {
		display: grid;
		gap: 10px;
	}
	.field {
		display: grid;
		gap: 4px;
	}
	.lbl {
		font-size: 12px;
		font-weight: 500;
		color: var(--muted);
	}
	.opt {
		font-weight: 400;
		color: var(--faint);
	}
	.textarea,
	.input,
	.select {
		font-size: 13px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.hint {
		font-size: 12px;
		color: var(--muted);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.saved {
		margin: 0;
		font-size: 13px;
	}
	.instead {
		margin-left: 6px;
		color: var(--good);
		font-weight: 500;
	}
	.done {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--good);
	}
	.done :global(svg) {
		width: 13px;
		height: 13px;
	}
	.err {
		font-size: 12px;
		font-weight: 500;
		color: var(--bad);
	}
</style>

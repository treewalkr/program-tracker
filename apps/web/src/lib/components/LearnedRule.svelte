<script lang="ts">
	import { untrack } from 'svelte';
	import { api } from '$lib/api';
	import type { CoachingRuleDto } from '$lib/api/types';
	import Button from '$lib/ui/Button.svelte';
	import Icon from '$lib/ui/Icon.svelte';

	/**
	 * "Learned: … Keep for: this client / all clients · Edit · Dismiss" — the
	 * one gate between a note and every future prompt. A proposed rule does
	 * nothing until the trainer keeps it here (or on the Coaching rules page).
	 */
	interface Props {
		rule: CoachingRuleDto;
		/** The client the note was about; enables "This client". */
		clientId?: string | null;
		clientName?: string | null;
		onchange?: (rule: CoachingRuleDto) => void;
	}

	let { rule: initial, clientId = null, clientName = null, onchange }: Props = $props();

	let rule = $state(untrack(() => initial));
	let editing = $state(false);
	let text = $state(untrack(() => initial.text));
	let busy = $state(false);
	let error = $state<string | null>(null);

	const forClient = $derived(clientId ?? rule.clientId);
	const who = $derived(clientName ?? rule.clientName ?? 'this client');

	async function run(fn: () => Promise<CoachingRuleDto>) {
		busy = true;
		error = null;
		try {
			rule = await fn();
			editing = false;
			onchange?.(rule);
		} catch (err) {
			error = (err as Error).message || 'Not saved';
		} finally {
			busy = false;
		}
	}

	const keep = (scope: 'client' | 'always') =>
		run(() =>
			api.confirmCoachingRule(rule.id, {
				scope,
				...(scope === 'client' && forClient ? { clientId: forClient } : {}),
				...(text.trim() && text.trim() !== rule.text ? { text: text.trim() } : {})
			})
		);
</script>

<div class="learned" class:settled={rule.status !== 'proposed'} role="status">
	{#if rule.status === 'proposed'}
		<div class="head">
			<Icon name="sparkle" />
			<span class="label">Learned</span>
			{#if editing}
				<input
					class="input rule-input"
					aria-label="Rule text"
					maxlength={400}
					bind:value={text}
					onkeydown={(e) => {
						if (e.key === 'Escape') editing = false;
					}}
				/>
			{:else}
				<q class="rule">{text}</q>
			{/if}
		</div>
		<div class="actions">
			<span class="ask">Keep for:</span>
			{#if forClient}
				<Button small disabled={busy || text.trim().length < 3} onclick={() => keep('client')}>{who}</Button>
			{/if}
			<Button small disabled={busy || text.trim().length < 3} onclick={() => keep('always')}>All clients</Button>
			<span class="sep" aria-hidden="true">·</span>
			<button type="button" class="linkish" disabled={busy} onclick={() => (editing = !editing)}>{editing ? 'Done' : 'Edit'}</button>
			<button type="button" class="linkish" disabled={busy} onclick={() => run(() => api.dismissCoachingRule(rule.id))}>Dismiss</button>
			{#if error}<span class="err" role="alert">{error}</span>{/if}
		</div>
		<p class="fine">Nothing changes in future drafts until you keep it.</p>
	{:else if rule.status === 'active'}
		<div class="head">
			<Icon name="check" />
			<span>Kept for {rule.clientId ? (rule.clientName ?? who) : 'all clients'}: <q class="rule">{rule.text}</q></span>
			<a class="manage" href="/rules">Coaching rules →</a>
		</div>
	{:else}
		<div class="head muted"><span>Dismissed. Future drafts won't use it.</span></div>
	{/if}
</div>

<style>
	.learned {
		display: grid;
		gap: 8px;
		max-width: 560px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--well);
		font-size: 13px;
	}
	.learned.settled {
		background: transparent;
		padding: 6px 10px;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
		flex-wrap: wrap;
	}
	.head :global(svg) {
		width: 13px;
		height: 13px;
		flex: none;
		color: var(--blue);
		align-self: center;
	}
	.label {
		font-weight: 600;
	}
	.rule {
		color: var(--ink);
		quotes: '“' '”';
	}
	.rule-input {
		flex: 1;
		min-width: 220px;
		font-size: 13px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.ask,
	.sep,
	.fine,
	.muted {
		color: var(--muted);
	}
	.fine {
		margin: 0;
		font-size: 12px;
	}
	.linkish {
		border: 0;
		padding: 0 2px;
		background: none;
		font: inherit;
		font-size: 12px;
		color: var(--blue);
		cursor: pointer;
	}
	.linkish:hover:not(:disabled) {
		text-decoration: underline;
	}
	.manage {
		margin-left: auto;
		font-size: 12px;
	}
	.err {
		font-size: 12px;
		font-weight: 500;
		color: var(--bad);
	}
</style>

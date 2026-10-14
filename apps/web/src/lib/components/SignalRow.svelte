<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The needs-review unit: lamp dot + title + evidence line + actions.
	 * The lamp always travels with a label and evidence — color never
	 * signals alone.
	 */
	type Severity = 'urgent' | 'attention' | 'info';

	interface Props {
		severity: Severity;
		/** Plain string, or a snippet when the title embeds a client link. */
		title: string | Snippet;
		evidence: string;
		/** Failure line under the evidence (e.g. snooze error). */
		error?: string;
		actions?: Snippet;
	}

	let { severity, title, evidence, error, actions }: Props = $props();

	const LAMP: Record<Severity, string> = { urgent: 'red', attention: 'amber', info: 'green' };
</script>

<div class="signal">
	<span class="lamp {LAMP[severity]}" aria-hidden="true"></span>
	<div class="body">
		<strong>
			{#if typeof title === 'string'}
				{title}
			{:else}
				{@render title()}
			{/if}
		</strong>
		<p class="evi">{evidence}</p>
		{#if error}<p class="evi err" role="alert">{error}</p>{/if}
	</div>
	{#if actions}
		<div class="act">{@render actions()}</div>
	{/if}
</div>

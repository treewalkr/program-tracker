<script lang="ts">
	import Pill from '$lib/ui/Pill.svelte';

	type Tone = 'good' | 'warn' | 'bad' | 'neutral';

	/** Maps every domain status onto the four Primer Label tones. */
	let { status }: { status: string } = $props();

	const map: Record<string, { tone: Tone; label: string }> = {
		active: { tone: 'good', label: 'active' },
		paused: { tone: 'warn', label: 'paused' },
		archived: { tone: 'neutral', label: 'archived' },
		draft: { tone: 'neutral', label: 'draft' },
		validated: { tone: 'good', label: 'validated' },
		approved: { tone: 'good', label: 'approved' },
		rejected: { tone: 'bad', label: 'rejected' },
		failed_validation: { tone: 'bad', label: 'failed validation' },
		failed_provider: { tone: 'bad', label: 'provider error' },
	};
	const view = $derived(map[status] ?? { tone: 'neutral' as Tone, label: status });
</script>

<Pill tone={view.tone}>{view.label}</Pill>

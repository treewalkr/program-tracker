<script lang="ts">
	/** Initials avatar — first letters of the first two name parts, uppercased. */
	let { name }: { name: string } = $props();

	const initials = $derived(
		name
			.split(' ')
			.map((p) => p[0])
			.slice(0, 2)
			.join('')
			.toUpperCase(),
	);
</script>

<div class="avatar" aria-hidden="true">{initials}</div>

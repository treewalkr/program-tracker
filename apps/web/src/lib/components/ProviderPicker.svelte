<script lang="ts">
  import type { ProviderDto } from "$lib/api/types";
  import Field from "$lib/ui/Field.svelte";

  /**
   * Provider / model / thinking-effort selection (card 27tc8). Provider name
   * only in the first dropdown — the model belongs to the model dropdown.
   * Selectors hide when they'd have nothing to choose: single-model providers
   * skip the model select, providers without effortLevels (and glm-4.x, whose
   * thinking is disabled) skip the effort select. "" effort = provider default.
   */
  let {
    providers,
    providerId = $bindable(""),
    model = $bindable(""),
    effort = $bindable(""),
    idPrefix = "pp",
  }: {
    providers: ProviderDto[];
    providerId: string;
    model: string;
    effort: string;
    idPrefix?: string;
  } = $props();

  const provider = $derived(providers.find((p) => p.id === providerId) ?? null);
  const showModel = $derived((provider?.models.length ?? 0) > 1);
  // glm-4.x keeps thinking disabled — no effort selector for those models
  const effortLevels = $derived(
    provider?.effortLevels?.length && !/^glm-4/.test(model || provider.model)
      ? provider.effortLevels
      : null
  );

  function onProviderChange() {
    // switching provider invalidates the model and effort selections
    model = "";
    effort = "";
  }
</script>

<div class="picker">
  <Field label="Provider" htmlFor="{idPrefix}-provider">
    <select
      class="select"
      id="{idPrefix}-provider"
      bind:value={providerId}
      onchange={onProviderChange}
    >
      {#each providers as p (p.id)}
        <option value={p.id}>{p.label}</option>
      {/each}
    </select>
  </Field>

  {#if showModel}
    <Field label="Model" htmlFor="{idPrefix}-model">
      <select class="select" id="{idPrefix}-model" bind:value={model}>
        <option value="">{provider?.model} · default</option>
        {#each provider!.models as m (m)}
          {#if m !== provider!.model}
            <option value={m}>{m}</option>
          {/if}
        {/each}
      </select>
    </Field>
  {/if}

  {#if effortLevels}
    <Field label="Thinking" htmlFor="{idPrefix}-effort">
      <select class="select" id="{idPrefix}-effort" bind:value={effort}>
        <option value="">{provider?.defaultEffort ?? effortLevels[0]} · default</option>
        {#each effortLevels as lvl (lvl)}
          <option value={lvl}>{lvl}</option>
        {/each}
      </select>
    </Field>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
  }
  .picker > :global(.field) {
    flex: 1 1 160px;
    min-width: 0;
  }
</style>

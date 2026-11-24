<script lang="ts">
  import type { ProviderDto } from "$lib/api/types";
  import SelectField from "$lib/ui/SelectField.svelte";
  import type { SelectOption } from "$lib/ui/select/options";
  import { effortName } from "$lib/effort";

  /**
   * Provider / model / thinking-effort selection (card 27tc8). Provider name
   * only in the first dropdown — the model belongs to the model dropdown.
   * Selectors hide when they'd have nothing to choose: single-model providers
   * skip the model select, providers without effortLevels skip the
   * effort select. "" effort = provider default.
   * The default option is labelled "(provider default)" / "(default)" and the
   * matching entry is not listed twice.
   */
  let {
    providers,
    providerId = $bindable(""),
    model = $bindable(""),
    effort = $bindable(""),
  }: {
    providers: ProviderDto[];
    providerId: string;
    model: string;
    effort: string;
  } = $props();

  const provider = $derived(providers.find((p) => p.id === providerId) ?? null);
  const showModel = $derived((provider?.models.length ?? 0) > 1);
  const effortLevels = $derived(provider?.effortLevels?.length ? provider.effortLevels : null);

  const providerOptions = $derived<SelectOption[]>(providers.map((p) => ({ value: p.id, label: p.label })));
  const modelOptions = $derived<SelectOption[]>([
    { value: "", label: `${provider?.model} (provider default)` },
    ...(provider?.models ?? []).filter((m) => m !== provider?.model).map((m) => ({ value: m, label: m })),
  ]);
  const defaultEffort = $derived(provider?.defaultEffort ?? effortLevels?.[0]);
  const effortOptions = $derived<SelectOption[]>(
    effortLevels
      ? [
          { value: "", label: `${effortName(defaultEffort!)} (default)` },
          ...effortLevels.filter((l) => l !== defaultEffort).map((l) => ({ value: l, label: effortName(l) })),
        ]
      : [],
  );

  function onProviderChange() {
    // switching provider invalidates the model and effort selections
    model = "";
    effort = "";
  }
</script>

<div class="picker">
  <SelectField label="Provider" maxWidth="none" options={providerOptions} bind:value={providerId} onchange={onProviderChange} />

  {#if showModel}
    <SelectField label="Model" maxWidth="none" options={modelOptions} bind:value={model} />
  {/if}

  {#if effortLevels}
    <SelectField label="Thinking" maxWidth="none" options={effortOptions} bind:value={effort} />
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-end;
  }
  /* SelectField renders a bare div; stretch each so the selects share one width. */
  .picker > :global(div) {
    flex: 1 1 160px;
    min-width: 0;
  }
</style>

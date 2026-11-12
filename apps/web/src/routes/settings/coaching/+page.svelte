<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import Panel from "$lib/ui/Panel.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Button from "$lib/ui/Button.svelte";
  import { DEFAULT_DELOAD, type DeloadSettings } from "@pt/shared";
  import DeloadRuleFields from "$lib/components/DeloadRuleFields.svelte";

  /** Deload rule: undefined while loading, null if the API didn't answer. `saved` is what the server holds. */
  let deloadSaved = $state<DeloadSettings | null | undefined>(undefined);
  let deloadDraft = $state<DeloadSettings>({ ...DEFAULT_DELOAD });
  let deloadBusy = $state(false);
  let deloadError = $state<string | null>(null);
  let deloadJustSaved = $state(false);
  const same = (a: DeloadSettings, b: DeloadSettings) =>
    a.setsKeptPercent === b.setsKeptPercent &&
    a.loadPercent === b.loadPercent &&
    a.loadBasis === b.loadBasis &&
    a.rpeCap === b.rpeCap &&
    a.amrap === b.amrap;
  const deloadDirty = $derived(deloadSaved != null && !same(deloadDraft, deloadSaved));
  const deloadIsDefault = $derived(same(deloadDraft, DEFAULT_DELOAD));

  async function deloadCall(run: () => Promise<DeloadSettings>) {
    deloadBusy = true;
    deloadError = null;
    try {
      const next = await run();
      deloadSaved = next;
      deloadDraft = { ...next };
      deloadJustSaved = true;
    } catch (err) {
      deloadError = (err as Error).message || "Could not save";
    } finally {
      deloadBusy = false;
    }
  }
  const saveDeload = () => deloadCall(() => api.setDeloadSettings($state.snapshot(deloadDraft)));
  const resetDeload = () => deloadCall(() => api.resetDeloadSettings());

  onMount(() => {
    api.deloadSettings().then(
      (d) => {
        deloadSaved = d;
        deloadDraft = { ...d };
      },
      () => (deloadSaved = null),
    );
  });
</script>

<Panel title="Deload">
  {#snippet act()}<span class="head-note">every client, unless you give one their own</span>{/snippet}
  <div class="deload">
    {#if deloadSaved === undefined}
      <Skeleton shape="line" w="min(320px, 100%)" h="12px" />
    {:else if deloadSaved === null}
      <p class="muted">The deload rule isn't available right now.</p>
    {:else}
      <p class="muted help">
        What a deload week does — the Deload button on a program, the block plan's deload target and every AI draft use it.
        It replaces any deload numbers written in your instruction templates.
      </p>
      <DeloadRuleFields bind:value={deloadDraft} idPrefix="my-deload" disabled={deloadBusy} />
      <div class="deload-actions">
        {#if deloadError}<p class="err" role="alert">{deloadError}</p>{/if}
        {#if deloadJustSaved && !deloadDirty}<span class="muted" role="status">Saved</span>{/if}
        <Button small variant="ghost" onclick={resetDeload} disabled={deloadBusy || deloadIsDefault}>Reset to default</Button>
        <Button small onclick={saveDeload} disabled={deloadBusy || !deloadDirty}>{deloadBusy ? "Saving…" : "Save"}</Button>
      </div>
    {/if}
  </div>
</Panel>

<style>
  .head-note { margin-left: auto; font-size: 12px; color: var(--muted); }
  .deload { display: flex; flex-direction: column; gap: 14px; padding: 14px 16px; font-size: 13px; }
  .deload .muted { color: var(--muted); margin: 0; }
  .deload .help { max-width: 64ch; line-height: 1.5; }
  .deload-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
  .deload-actions .err { margin-right: auto; color: var(--bad); font-size: 12px; }
</style>

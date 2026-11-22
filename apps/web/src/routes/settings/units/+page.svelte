<script lang="ts">
  import { api } from "$lib/api";
  import { applyUnits, fmtDistance, fmtPace, fmtWeight, units } from "$lib/units.svelte";
  import type { DistanceUnit, WeightUnit } from "@pt/shared";
  import Panel from "$lib/ui/Panel.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";

  /**
   * Display units for the whole trainer app. Values are stored in kg and km;
   * this only changes what's shown and typed. Saves on change.
   */
  let busy = $state(false);
  let error = $state<string | null>(null);
  let saved = $state(false);

  async function set(next: { weight?: WeightUnit; distance?: DistanceUnit }) {
    const before = { ...units };
    applyUnits({ ...units, ...next });
    busy = true;
    error = null;
    saved = false;
    try {
      applyUnits(await api.setDisplayUnits({ ...units }));
      saved = true;
    } catch (e) {
      applyUnits(before);
      error = (e as Error).message || "Could not save";
    } finally {
      busy = false;
    }
  }
</script>

<Panel title="Units">
  {#snippet act()}<span class="head-note">for you, across the app</span>{/snippet}
  <div class="panel-body body">
    <div class="row">
      <Segmented
        label="Weight"
        lead="Weight"
        disabled={busy}
        items={[
          { value: "kg", label: "kg" },
          { value: "lb", label: "lb" },
        ]}
        value={units.weight}
        onchange={(weight) => set({ weight })}
      />
      <p class="eg">{fmtWeight(100, "kg")} shows as <b>{fmtWeight(100)}</b>; loads step by <b>{units.weight === "lb" ? "5 lb" : "2.5 kg"}</b>.</p>
    </div>
    <div class="row">
      <Segmented
        label="Distance"
        lead="Distance"
        disabled={busy}
        items={[
          { value: "km", label: "km" },
          { value: "mi", label: "mi" },
        ]}
        value={units.distance}
        onchange={(distance) => set({ distance })}
      />
      <p class="eg">A {fmtDistance(5, "km")} run shows as <b>{fmtDistance(5)}</b> at <b>{fmtPace(330)}</b>.</p>
    </div>
    <p class="note" role="status">
      {#if error}<span class="err">{error}</span>{:else if saved}Saved.{/if}
      Everything is stored in kg and km, so switching never changes a number, only how it reads. Guide illustrations stay metric.
    </p>
  </div>
</Panel>

<style>
  .body { display: grid; gap: 18px; }
  .row { display: grid; gap: 6px; }
  .eg { margin: 0; font-size: 13px; color: var(--muted); }
  .eg b { color: var(--ink); font-weight: 600; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .note { margin: 0; font-size: 12px; color: var(--muted); }
  .err { color: var(--bad); margin-right: 6px; }
  .head-note { font-size: 13px; color: var(--muted); }
</style>

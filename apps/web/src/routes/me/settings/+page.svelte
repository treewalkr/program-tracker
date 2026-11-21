<script lang="ts">
  import type { DistanceUnit, WeightUnit } from "@pt/shared";
  import { portalApi } from "$lib/api/portal";
  import { t } from "$lib/portal/i18n.svelte";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import { distanceText, weightText } from "$lib/portal/rx";
  import { applyUnits, PORTAL_UNITS_KEY, units } from "$lib/units.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";

  /**
   * The member's own settings: language and display units. Everything is
   * stored in kg and km, so a switch changes how numbers read, never the
   * numbers. Saves on change; a failed save puts the old choice back.
   */
  let { data } = $props();
  const me = $derived(data.portal.kind === "signedIn" ? data.portal.me : null);

  let busy = $state(false);
  let status = $state<"saved" | "failed" | null>(null);

  async function set(next: { weight?: WeightUnit; distance?: DistanceUnit }) {
    const before = { ...units };
    applyUnits({ ...units, ...next }, PORTAL_UNITS_KEY);
    busy = true;
    status = null;
    try {
      const saved = await portalApi.saveSettings({ ...units });
      applyUnits(saved.units, PORTAL_UNITS_KEY);
      status = "saved";
    } catch {
      applyUnits(before, PORTAL_UNITS_KEY);
      status = "failed";
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t("settings.title")} · Program Tracker</title></svelte:head>

<PortalBar coach={me?.trainer.name ?? null} />

<a class="back" href="/me"><Icon name="chevron" />{t("log.back")}</a>

<h1>{t("settings.title")}</h1>

<section class="group" aria-labelledby="s-lang">
  <h2 id="s-lang">{t("settings.language")}</h2>
  <div class="row"><LangToggle /></div>
</section>

<section class="group" aria-labelledby="s-units">
  <h2 id="s-units">{t("settings.units")}</h2>
  <div class="field">
    <Segmented
      label={t("settings.distance")}
      lead={t("settings.distance")}
      disabled={busy}
      items={[
        { value: "km", label: t("cardio.km") },
        { value: "mi", label: t("cardio.mi") },
      ]}
      value={units.distance}
      onchange={(distance) => set({ distance })}
    />
  </div>
  <div class="field">
    <Segmented
      label={t("settings.weight")}
      lead={t("settings.weight")}
      disabled={busy}
      items={[
        { value: "kg", label: t("log.kg") },
        { value: "lb", label: t("log.lb") },
      ]}
      value={units.weight}
      onchange={(weight) => set({ weight })}
    />
  </div>
  <p class="eg">{t("settings.example", { run: distanceText(5.2, t), bar: weightText(60, t) })}</p>
  <p class="unit-note" role="status" aria-live="polite">
    {#if status === "failed"}<span class="err">{t("settings.failed")}</span>{:else if status === "saved"}<span class="ok">{t("settings.saved")}</span>{/if}
    {t("settings.unitsNote")}
  </p>
</section>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    margin: 4px 0 0 -6px;
    padding: 0 6px;
    font: 500 16px/1 var(--font-ui);
    color: var(--blue);
  }
  .back :global(svg) { width: 16px; height: 16px; transform: rotate(90deg); }
  h1 { margin: 8px 0 20px; font: 600 26px/1.2 var(--font-ui); letter-spacing: -0.015em; }
  .group { display: grid; gap: 12px; padding: 16px 0; border-top: 1px solid var(--line-soft); }
  h2 { margin: 0; font: 600 14px/1.3 var(--font-ui); color: var(--muted); }
  .row { display: flex; }
  /* the portal's 44px touch targets on the unit switches */
  .field :global([role="radio"]) { min-height: 40px; min-width: 64px; font-size: 16px; }
  .field :global(.lead) { min-width: 84px; font-size: 15px; }
  .eg { margin: 0; font-size: 14px; color: var(--ink); }
  .unit-note { margin: 0; font-size: 13px; color: var(--muted); text-wrap: pretty; }
  .ok { color: var(--good); font-weight: 600; margin-right: 4px; }
  .err { color: var(--bad); font-weight: 600; margin-right: 4px; }
</style>

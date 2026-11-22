<script lang="ts">
  import Icon from "$lib/ui/Icon.svelte";
  import { t } from "$lib/portal/i18n.svelte";
  import PhoneFrame from "./PhoneFrame.svelte";

  /** The client's log screen at one exercise: prefilled sets, one changed, one sticky save. */
  const rows = [
    { n: 1, kg: 80, reps: 6, changed: false },
    { n: 2, kg: 80, reps: 6, changed: false },
    { n: 3, kg: 82.5, reps: 5, changed: true },
    { n: 4, kg: 80, reps: 6, changed: false },
  ];
</script>

<PhoneFrame height={576}>
  <div class="col">
    <p class="crumb"><Icon name="chevron" size={14} />Upper A</p>
    <p class="count">{t("log.exercise", { n: 1, total: 5 })}</p>
    <h4 lang="en">Bench press</h4>
    <ul class="chips">
      <li>4 × 6</li>
      <li>80 {t("log.kg")}</li>
      <li>RPE 8</li>
    </ul>
    <div class="head"><span></span><span>{t("log.kg")}</span><span>{t("log.reps")}</span><span></span></div>
    {#each rows as r (r.n)}
      <div class="row">
        <span class="n">{t("log.set", { n: r.n })}</span>
        <span class="cell" class:changed={r.changed}>{r.kg}</span>
        <span class="cell" class:changed={r.changed}>{r.reps}</span>
        <span class="tick">{#if r.changed}<Icon name="check" size={14} />{/if}</span>
      </div>
    {/each}
    <p class="more">{t("log.rpeShow")}</p>
    <!-- skip and pain sit behind one quiet link under the sets -->
    <p class="more issues">{t("log.issues")}<Icon name="chevron" size={12} /></p>
  </div>
  <div class="save"><span class="btn primary">{t("log.save")}</span></div>
</PhoneFrame>

<style>
  .col { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .crumb { display: flex; align-items: center; gap: 4px; margin: 0; min-height: 32px; font-size: 14px; color: var(--muted); }
  .crumb :global(svg) { transform: rotate(90deg); }
  .count { margin: 0; font-size: 13px; color: var(--muted); }
  h4 { margin: 0; font: 600 20px/1.3 var(--font-ui); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 6px; padding: 0; list-style: none; }
  .chips li { padding: 1px 8px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--well); font: 500 13px/1.6 var(--font-mono); }
  .head, .row { display: grid; grid-template-columns: 52px 1fr 1fr 24px; align-items: center; gap: 8px; }
  .head { font-size: 13px; color: var(--muted); text-align: center; }
  .n { font-size: 14px; }
  .cell { display: grid; place-items: center; min-height: 44px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--surface); font: 500 16px/1 var(--font-mono); font-variant-numeric: tabular-nums; }
  .cell.changed { border-color: var(--blue); box-shadow: inset 0 0 0 1px var(--blue); }
  .tick { color: var(--blue); }
  .more { margin: 6px 0 0; font-size: 14px; color: var(--blue); }
  .more.issues { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
  .save { position: absolute; inset: auto 12px 12px; z-index: 1; }
  .save .btn { display: grid; place-items: center; width: 100%; min-height: 44px; font-size: 16px; }
</style>

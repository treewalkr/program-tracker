<script lang="ts" module>
  import type { Cell } from "$lib/logSheet";

  /** The cardio actuals as typed — cells stay strings until the save parses them. */
  export interface CardioForm {
    modality: string;
    durationMin: Cell;
    hrZone: string;
    intensity: string;
    distanceKm: Cell;
    rpe: Cell;
  }

  /** Words the form shows — English by default; the client portal passes its own locale. */
  export interface CardioFormText {
    modality: string;
    modalityHint?: string;
    modalityPlaceholder: string;
    minutes: string;
    hrZone: string;
    intensity: string;
    intensityPlaceholder: string;
    km: string;
    rpe: string;
  }
</script>

<script lang="ts">
  import Field from "$lib/ui/Field.svelte";

  const ENGLISH: CardioFormText = {
    modality: "Modality",
    modalityHint: "what did they do?",
    modalityPlaceholder: "Run, Bike, Rower…",
    minutes: "Min",
    hrZone: "HR zone",
    intensity: "Intensity",
    intensityPlaceholder: "easy, threshold…",
    km: "km",
    rpe: "RPE",
  };

  interface Props {
    value: CardioForm;
    text?: CardioFormText;
    /** `touch`: one column, 44px fields (the client portal). */
    variant?: "sheet" | "touch";
  }

  let { value = $bindable(), text = ENGLISH, variant = "sheet" }: Props = $props();
</script>

<div class="panel-body cardio-form" class:touch={variant === "touch"}>
  <Field label={text.modality} htmlFor="c-modality" hint={text.modalityHint}>
    <input class="input" id="c-modality" placeholder={text.modalityPlaceholder} bind:value={value.modality} maxlength="80" />
  </Field>
  <Field label={text.minutes} htmlFor="c-min">
    <input class="input tnum" id="c-min" type="number" inputmode="numeric" min="1" max="300" bind:value={value.durationMin} />
  </Field>
  <Field label={text.hrZone} htmlFor="c-zone">
    <select class="select" id="c-zone" bind:value={value.hrZone}>
      <option value="">—</option>
      {#each [1, 2, 3, 4, 5] as z}<option value={String(z)}>Z{z}</option>{/each}
    </select>
  </Field>
  <Field label={text.intensity} htmlFor="c-intensity">
    <input class="input" id="c-intensity" placeholder={text.intensityPlaceholder} bind:value={value.intensity} maxlength="60" />
  </Field>
  <Field label={text.km} htmlFor="c-km">
    <input class="input tnum" id="c-km" type="number" inputmode="decimal" min="0" max="300" step="0.1" bind:value={value.distanceKm} />
  </Field>
  <Field label={text.rpe} htmlFor="c-rpe">
    <input class="input tnum" id="c-rpe" type="number" inputmode="decimal" min="1" max="10" step="0.5" bind:value={value.rpe} />
  </Field>
</div>

<style>
  .cardio-form {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  @media (max-width: 860px) {
    .cardio-form { grid-template-columns: 1fr; }
  }
  .cardio-form.touch { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0; }
  .touch :global(.input), .touch :global(.select) { min-height: 44px; font-size: 16px; }
  .touch :global(div:first-child) { grid-column: 1 / -1; }
</style>

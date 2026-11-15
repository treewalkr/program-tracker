<script lang="ts">
  import Icon from "$lib/ui/Icon.svelte";
  import { READINESS_SCALES, tapScale, type ReadinessForm } from "$lib/logFlags";

  /** Words the strip shows — English by default; the client portal passes its own locale. */
  export interface ReadinessText {
    title: string;
    optional: string;
    hint: string;
    scale: Record<keyof ReadinessForm, { label: string; low: string; high: string }>;
    /** Accessible name of one button: "Energy 3 of 10". */
    valueLabel: (label: string, v: number, max: number) => string;
  }

  const ENGLISH: ReadinessText = {
    title: "Readiness",
    optional: "optional",
    hint: "Optional · tap again to clear",
    scale: Object.fromEntries(READINESS_SCALES.map((s) => [s.field, { label: s.label, low: s.low, high: s.high }])) as ReadinessText["scale"],
    valueLabel: (label, v, max) => `${label} ${v} of ${max}`,
  };

  interface Props {
    /** Energy, sleep and soreness before the session — all optional. */
    value: ReadinessForm;
    /** Narrow sheet only: folded to one summary line until opened. */
    open?: boolean;
    /** `sheet`: the trainer's log sheet (folds when narrow); `touch`: always open, 44px taps. */
    variant?: "sheet" | "touch";
    text?: ReadinessText;
  }

  let { value = $bindable(), open = $bindable(false), variant = "sheet", text = ENGLISH }: Props = $props();

  const summary = $derived(
    READINESS_SCALES.filter((sc) => value[sc.field] != null)
      .map((sc) => `${text.scale[sc.field].label} ${value[sc.field]}`)
      .join(" · ")
  );
</script>

<!-- Before the session: three optional taps. "Did it as prescribed" needs none of them. -->
<div
  class="panel-body readiness"
  class:collapsed={variant === "sheet" && !open}
  class:touch={variant === "touch"}
  role="group"
  aria-label={`${text.title}, ${text.optional}`}
>
  {#if variant === "sheet"}
    <button type="button" class="rd-toggle" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="rd-toggle-label">{text.title}</span>
      <span class="faint rd-toggle-sum">{summary || text.optional}</span>
      <Icon name="chevron" />
    </button>
  {/if}
  {#each READINESS_SCALES as sc (sc.field)}
    {@const words = text.scale[sc.field]}
    <div class="rd">
      <span class="rd-label" id={`rd-${sc.field}`}>{words.label} <span class="faint">1 {words.low} · {sc.max} {words.high}</span></span>
      <div class="seg rd-scale" role="group" aria-labelledby={`rd-${sc.field}`}>
        {#each Array.from({ length: sc.max }, (_, i) => i + 1) as v (v)}
          <button
            type="button"
            class="tnum"
            aria-pressed={value[sc.field] === v}
            aria-label={text.valueLabel(words.label, v, sc.max)}
            onclick={() => (value[sc.field] = tapScale(value[sc.field], v))}
          >{v}</button>
        {/each}
      </div>
    </div>
  {/each}
  <span class="faint rd-hint">{text.hint}</span>
</div>

<style>
  /* Folded summary exists only in the narrow sheet. */
  .rd-toggle { display: none; }
  @media (prefers-reduced-motion: reduce) {
    .rd-toggle :global(svg) { transition: none; }
  }

  /* ---- Readiness: three segmented scales, top of the sheet ---- */
  .readiness {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px 24px;
    padding-top: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }
  .rd { display: grid; gap: 6px; }
  .rd-label { font: 500 12px/1.2 var(--font-ui); color: var(--muted); }
  .rd-label .faint { font-weight: 400; margin-left: 4px; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .seg button {
    min-width: 30px;
    height: 30px;
    padding: 0 6px;
    font: 500 13px/1 var(--font-mono);
    color: var(--muted);
    background: var(--well);
    border: 0;
    cursor: pointer;
    touch-action: manipulation;
  }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button:hover { color: var(--ink); background: var(--well-2); }
  .seg button[aria-pressed="true"] { color: var(--ink); background: var(--surface); font-weight: 600; box-shadow: inset 0 -2px 0 var(--tab-on); }
  .rd-hint { font-size: 12px; margin-left: auto; align-self: center; }

  /* ---- Touch: the client portal — always open, full-width scales, 44px taps ---- */
  .readiness.touch { display: grid; gap: 16px; padding: 4px 0 0; border-bottom: 0; }
  .touch .rd-label { font-size: 14px; color: var(--ink); }
  .touch .rd-scale { display: flex; }
  .touch .seg button { flex: 1; min-width: 0; height: 44px; font-size: 15px; }
  .touch .rd-hint { margin-left: 0; }

  /* ---- Narrow sheet: fold to one line ---- */
  @container logform (max-width: 679px) {
    .readiness { display: grid; gap: 12px; }
    .readiness.collapsed { padding-top: 0; padding-bottom: 0; }
    .readiness.collapsed .rd, .readiness.collapsed .rd-hint { display: none; }
    .rd-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 44px;
      padding: 0;
      font: 500 14px/1.3 var(--font-ui);
      color: var(--ink);
      background: none;
      border: 0;
      cursor: pointer;
      text-align: left;
    }
    .rd-toggle-sum { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
    .rd-toggle :global(svg) { flex: 0 0 auto; width: 16px; height: 16px; transition: transform 150ms ease-out; }
    .rd-toggle[aria-expanded="true"] :global(svg) { transform: rotate(180deg); }
    .rd-scale { display: flex; }
    .seg button { flex: 1; min-width: 0; height: 40px; font-size: 14px; }
    .rd-hint { margin-left: 0; }
  }
</style>

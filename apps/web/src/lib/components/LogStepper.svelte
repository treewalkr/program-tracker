<script lang="ts">
  import Icon from "$lib/ui/Icon.svelte";
  import { stepCell, type Cell } from "$lib/logSheet";

  /**
   * One log-sheet number cell. On a desk it is a plain right-aligned mono
   * field; at phone width it grows into a 44px − field + stepper for
   * one-handed gym-floor entry. Stepping from blank starts at `from` (the
   * target shown as placeholder), so one tap logs "target + a plate".
   */
  let {
    value = $bindable(),
    label,
    unit,
    step,
    min,
    max,
    from = null,
    placeholder = "—",
    inputmode = "decimal",
    disabled = false,
    error,
    errorId,
    onedit,
  }: {
    value: Cell;
    /** Unique accessible name of the input, e.g. "Bench back-off set 2, kg". */
    label: string;
    /** Visible field label at phone width: "kg", "reps", "RPE". */
    unit: string;
    step: number;
    min: number;
    max: number;
    from?: number | null;
    placeholder?: string;
    inputmode?: "decimal" | "numeric";
    disabled?: boolean;
    error?: string;
    errorId?: string;
    /** Any edit (typed or stepped) — clears the cell's error flag. */
    onedit?: () => void;
  } = $props();

  function nudge(dir: 1 | -1) {
    value = stepCell(value, dir * step, { min, max, from });
    onedit?.();
  }
</script>

<div class="lstep" class:invalid={!!error}>
  <span class="lstep-unit" aria-hidden="true">{unit}</span>
  <div class="lstep-row">
    <button type="button" class="lstep-btn" tabindex="-1" aria-label={`${label} −${step}`} {disabled} onclick={() => nudge(-1)}>
      <Icon name="minus" />
    </button>
    <input
      class="input lstep-input"
      type="number"
      {inputmode}
      step={step}
      {min}
      {max}
      aria-label={label}
      {placeholder}
      {disabled}
      bind:value
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      oninput={() => onedit?.()}
    />
    <button type="button" class="lstep-btn" tabindex="-1" aria-label={`${label} +${step}`} {disabled} onclick={() => nudge(1)}>
      <Icon name="plus" />
    </button>
  </div>
  {#if error}<span class="lstep-err" id={errorId}>{error}</span>{/if}
</div>

<style>
  .lstep { min-width: 0; }
  .lstep-unit { display: none; }
  .lstep-row { display: flex; }
  .lstep-btn { display: none; }

  .lstep-input {
    width: 100%;
    min-width: 0;
    text-align: right;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    padding: 5px 8px;
    /* Typed or stepped values read as entered: full ink, bold. */
    color: var(--ink);
    font-weight: 600;
    /* Spin arrows ate the room for "107.5" (F32); the steppers replace them. */
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .lstep-input::-webkit-outer-spin-button,
  .lstep-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  /* The plan shows as a ghost — faint, italic, regular weight — never mistaken for an entry. */
  .lstep-input::placeholder { color: var(--faint); font-style: italic; font-weight: 400; }
  .invalid .lstep-input { border-color: var(--bad); }

  .lstep-err {
    display: block;
    margin-top: 3px;
    font-size: 11px;
    line-height: 1.2;
    color: var(--bad);
    text-align: right;
  }

  @media (max-width: 640px) {
    .lstep-unit {
      display: block;
      margin-bottom: 4px;
      font: 500 12px/1.2 var(--font-ui);
      color: var(--muted);
    }
    .lstep-btn {
      display: grid;
      place-items: center;
      flex: 0 0 44px;
      height: 44px;
      padding: 0;
      color: var(--ink);
      background: var(--well);
      border: 1px solid var(--line);
      cursor: pointer;
      touch-action: manipulation; /* no double-tap zoom while hammering + */
      transition: background-color 120ms;
    }
    .lstep-btn:first-child { border-radius: 6px 0 0 6px; border-right: 0; }
    .lstep-btn:last-child { border-radius: 0 6px 6px 0; border-left: 0; }
    .lstep-btn:active { background: var(--active); }
    .lstep-btn:disabled { color: var(--faint); cursor: default; }
    .lstep-btn :global(svg) { width: 16px; height: 16px; }
    .lstep-input {
      height: 44px;
      border-radius: 0;
      text-align: center;
      font-size: 16px; /* ≥16px: iOS won't zoom the page on focus */
      padding: 0 4px;
    }
    .lstep-input::placeholder { opacity: 0.8; }
    .lstep-err { text-align: left; font-size: 12px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .lstep-btn { transition: none; }
  }
</style>

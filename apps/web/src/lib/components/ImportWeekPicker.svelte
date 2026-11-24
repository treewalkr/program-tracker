<script lang="ts">
  import type { ImportAb, ImportResult } from "@pt/shared";
  import { abWeekOptions, blockLabel, weekName } from "$lib/pasteImport";
  import SelectField from "$lib/ui/SelectField.svelte";
  import type { SelectOption } from "$lib/ui/select/options";

  /**
   * Paste notes review: which week(s) "Use this" drafts — one block, or two
   * weeks the trainer picks as Week A and Week B (FB-015). Nothing is guessed:
   * the latest block stays the default. A/B weeks found in the notes have
   * their own box, so the A/B option only shows when none were found.
   */
  let {
    result,
    block,
    pickAb,
    pick,
    error = null,
    onblock,
    onab,
  }: {
    result: ImportResult;
    /** The block drafted when A/B weeks aren't picked. */
    block: number;
    /** "A/B weeks" is the chosen option. */
    pickAb: boolean;
    /** The weeks picked as A and B (indexes into `result.weeks`). */
    pick: ImportAb | null;
    /** Why the pick can't be drafted (abPickError). */
    error?: string | null;
    onblock: (block: number) => void;
    /** A/B weeks chosen, or the pick changed. */
    onab: (pick: ImportAb) => void;
  } = $props();

  const options = $derived(abWeekOptions(result));
  const weekOptions = $derived<SelectOption[]>(options.map((wi) => ({ value: String(wi), label: weekName(result, wi) })));
  const abOffered = $derived(!result.ab && options.length >= 2);
  const shown = $derived(result.blocks.length > 1 || abOffered);
  const current = $derived<ImportAb>(pick ?? { a: options[0] ?? 0, b: options[1] ?? 0, source: "picked" });

  const setWeek = (side: "a" | "b", value: string) => onab({ ...current, [side]: Number(value), source: "picked" });
</script>

{#if shown}
  <fieldset class="blocks">
    <legend>
      {#if result.blocks.length > 1}
        Found <span class="num">{result.blocks.length}</span> blocks. Draft which one?
      {:else}
        Draft one week or A/B weeks?
      {/if}
    </legend>
    {#each result.blocks as _, bi (bi)}
      <label class="block-opt" class:on={!pickAb && block === bi}>
        <input type="radio" name="pi-block" value={String(bi)} checked={!pickAb && block === bi} onchange={() => onblock(bi)} />
        <span>{blockLabel(result, bi)}</span>
        {#if result.blocks.length > 1 && bi === result.blocks.length - 1}<span class="subtle">latest</span>{/if}
      </label>
    {/each}
    {#if abOffered}
      <div class="block-opt ab-opt" class:on={pickAb}>
        <label class="ab-radio">
          <input type="radio" name="pi-block" value="ab" checked={pickAb} onchange={() => onab(current)} />
          <span class="opt-title">A/B weeks</span>
        </label>
        {#if pickAb}
          <div class="ab-pick">
            {#each ["a", "b"] as const as side (side)}
              <div class="ab-field">
                <SelectField
                  label="Week {side.toUpperCase()}"
                  maxWidth="none"
                  options={weekOptions}
                  value={String(current[side])}
                  invalid={!!error}
                  describedby={error ? "pi-ab-error" : "pi-ab-hint"}
                  onchange={(v) => setWeek(side, v)}
                />
              </div>
            {/each}
            <p class="subtle fine" id="pi-ab-hint">Odd weeks run A, even weeks B.</p>
            {#if error}<p class="blocker" id="pi-ab-error" role="alert">{error}</p>{/if}
          </div>
        {/if}
      </div>
    {/if}
    {#if result.alternating && abOffered}
      <p class="subtle fine">Looks like A/B weeks. Pick A/B weeks to draft both.</p>
    {/if}
  </fieldset>
{/if}

<style>
  .blocks { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 16px 12px; margin: 0 0 16px; display: flex; flex-direction: column; gap: 6px; }
  .blocks legend { font: 600 14px var(--font-ui); padding: 0 4px; }
  .block-opt { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; padding: 4px 8px; border-radius: var(--radius); }
  .block-opt.on { background: var(--well); }
  .ab-opt { flex-direction: column; align-items: stretch; gap: 8px; cursor: default; }
  .ab-radio { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .opt-title { font-weight: 600; }
  .ab-pick { display: flex; flex-wrap: wrap; align-items: end; gap: 8px 16px; padding-left: 24px; }
  .ab-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 220px; }
  .ab-pick .fine { flex-basis: 100%; }
  .fine { font-size: 12px; margin: 0; }
  .blocker { flex-basis: 100%; margin: 0; font-size: 13px; color: var(--warn-ink); background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: var(--radius); padding: 6px 10px; }
</style>

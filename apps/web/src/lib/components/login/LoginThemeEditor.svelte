<script lang="ts">
  import { untrack } from "svelte";
  import {
    LOGIN_ACCENT_SWATCHES,
    LOGIN_ACCENTS,
    LOGIN_VARIANT_INFO,
    LOGIN_VARIANTS,
    type LoginTheme,
  } from "@pt/shared";
  import { PREVIEW_DEVICES, type PreviewDevice } from "$lib/loginTheme";
  import Panel from "$lib/ui/Panel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";
  import LoginPreview from "./LoginPreview.svelte";

  /** Pick the login page's layout and accent against a live preview; Save makes it live. */
  interface Props {
    /** What the login page shows now. */
    saved: LoginTheme;
    /** false = demo mode: preview only. */
    canSave: boolean;
    onsave: (theme: LoginTheme) => Promise<LoginTheme>;
  }

  let { saved, canSave, onsave }: Props = $props();

  // seeded once from the loaded theme; afterwards these are the editor's own
  let live = $state<LoginTheme>(untrack(() => ({ ...saved })));
  let draft = $state<LoginTheme>(untrack(() => ({ ...saved })));
  let device = $state<PreviewDevice>("desktop");
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  const dirty = $derived(draft.variant !== live.variant || draft.accent !== live.accent);

  async function save() {
    saving = true;
    saveError = null;
    try {
      live = await onsave({ ...draft });
      draft = { ...live };
    } catch (err) {
      saveError = (err as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="editor">
  <div class="controls">
    <Panel title="Layout">
      <div class="panel-body opts" role="radiogroup" aria-label="Layout">
        {#each LOGIN_VARIANTS as v (v)}
          <label class="opt" class:on={draft.variant === v}>
            <input type="radio" name="login-variant" value={v} bind:group={draft.variant} />
            <span class="thumb" data-variant={v} style:--sw={LOGIN_ACCENT_SWATCHES[draft.accent].ramp[2]} aria-hidden="true">
              <i></i><i></i><i></i>
            </span>
            <span class="text">
              <span class="name">
                {LOGIN_VARIANT_INFO[v].label}
                {#if v === live.variant}<span class="live">Live</span>{/if}
              </span>
              <span class="blurb">{LOGIN_VARIANT_INFO[v].blurb}</span>
            </span>
          </label>
        {/each}
      </div>
    </Panel>

    <Panel title="Accent">
      <div class="panel-body accents" role="radiogroup" aria-label="Accent">
        {#each LOGIN_ACCENTS as a (a)}
          <label class="accent" class:on={draft.accent === a}>
            <input type="radio" name="login-accent" value={a} bind:group={draft.accent} />
            <span class="ramp" aria-hidden="true">
              {#each LOGIN_ACCENT_SWATCHES[a].ramp as c, i (i)}<i style:background={c}></i>{/each}
            </span>
            {LOGIN_ACCENT_SWATCHES[a].label}
          </label>
        {/each}
        <p class="hint">Colours the training heatmap. Fixed swatches from the app's colour scales, each with a dark-mode ramp.</p>
      </div>
    </Panel>

    <div class="save">
      {#if saveError}<Note tone="bad" role="alert" class="save-err">Couldn't save — {saveError}.</Note>{/if}
      <div class="save-row">
        <span class="state" role="status" aria-live="polite">
          {#if !canSave}Preview only in demo mode{:else if saving}Saving…{:else if dirty}Unsaved changes{:else}Live on the login page{/if}
        </span>
        {#if dirty}<Button variant="ghost" onclick={() => (draft = { ...live })} disabled={saving}>Discard</Button>{/if}
        <Button variant="primary" onclick={save} disabled={!canSave || !dirty || saving}>Save</Button>
      </div>
    </div>
  </div>

  <Panel title="Preview" class="preview">
    {#snippet act()}
      <div class="devices" role="group" aria-label="Preview size">
        {#each Object.entries(PREVIEW_DEVICES) as [id, d] (id)}
          <button type="button" class:on={device === id} aria-pressed={device === id} onclick={() => (device = id as PreviewDevice)}>
            {d.label}
          </button>
        {/each}
      </div>
    {/snippet}
    <div class="panel-body stagebox">
      <LoginPreview theme={draft} {device} />
    </div>
  </Panel>
</div>

<style>
  .editor {
    display: grid;
    grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
    gap: 18px;
    align-items: start;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  /* Layout options: a schematic of each layout, name, one line of what it is. */
  .opts {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
  }
  .opt {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    cursor: pointer;
    transition: background-color 120ms ease-out, border-color 120ms ease-out;
  }
  .opt:hover { background: var(--row-hover); }
  .opt.on { border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue); background: var(--surface); }
  .opt:has(input:focus-visible), .accent:has(input:focus-visible) { outline: 2px solid var(--blue); outline-offset: 2px; }
  input[type="radio"] { position: absolute; opacity: 0; pointer-events: none; }

  .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .name { display: flex; align-items: center; gap: 6px; font: 600 13px/1.3 var(--font-ui); color: var(--ink); }
  .blurb { font: 400 12px/1.4 var(--font-ui); color: var(--muted); }
  .live {
    padding: 0 6px;
    border: 1px solid var(--good-line);
    border-radius: 99px;
    background: var(--good-bg);
    color: var(--good);
    font: 500 11px/18px var(--font-ui);
  }

  .thumb {
    position: relative;
    flex: none;
    width: 64px;
    height: 42px;
    border-radius: 4px;
    background: var(--well);
    box-shadow: inset 0 0 0 1px var(--line);
    overflow: hidden;
  }
  .thumb i { position: absolute; display: block; border-radius: 2px; }
  /* classic: card in the middle, heatmap at its head */
  .thumb[data-variant="classic"] i:nth-child(1) { left: 21px; top: 8px; width: 22px; height: 26px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); border-radius: 2px; }
  .thumb[data-variant="classic"] i:nth-child(2) { left: 24px; top: 11px; width: 8px; height: 5px; background: var(--sw); }
  .thumb[data-variant="classic"] i:nth-child(3) { left: 24px; top: 26px; width: 16px; height: 4px; background: var(--line-strong); }
  /* split: season pane left, form right */
  .thumb[data-variant="split"] { background: var(--surface); }
  .thumb[data-variant="split"] i:nth-child(1) { left: 0; top: 0; width: 34px; height: 42px; background: var(--well); box-shadow: 1px 0 0 var(--line); border-radius: 0; }
  .thumb[data-variant="split"] i:nth-child(2) { left: 6px; top: 15px; width: 22px; height: 11px; background: var(--sw); }
  .thumb[data-variant="split"] i:nth-child(3) { left: 40px; top: 17px; width: 18px; height: 4px; background: var(--line-strong); }
  /* bold: dark canvas, heavy headline, season fading right */
  .thumb[data-variant="bold"] { background: #0d1117; box-shadow: none; }
  .thumb[data-variant="bold"] i:nth-child(1) { left: 7px; top: 13px; width: 26px; height: 6px; background: #f0f6fc; }
  .thumb[data-variant="bold"] i:nth-child(2) { left: 7px; top: 24px; width: 14px; height: 5px; background: #f0f6fc; border-radius: 2px; }
  .thumb[data-variant="bold"] i:nth-child(3) { left: 40px; top: 10px; width: 24px; height: 22px; background: linear-gradient(to right, var(--sw), transparent); }
  /* minimal: one strip, one line */
  .thumb[data-variant="minimal"] { background: var(--surface); }
  .thumb[data-variant="minimal"] i:nth-child(1) { left: 22px; top: 14px; width: 20px; height: 3px; background: var(--sw); }
  .thumb[data-variant="minimal"] i:nth-child(2) { left: 22px; top: 21px; width: 20px; height: 4px; background: var(--ink); }
  .thumb[data-variant="minimal"] i:nth-child(3) { left: 22px; top: 29px; width: 20px; height: 5px; background: var(--surface); box-shadow: 0 0 0 1px var(--line); }

  .accents {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 12px;
  }
  .accent {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font: 400 13px/1.3 var(--font-ui);
    color: var(--muted);
    cursor: pointer;
    transition: border-color 120ms ease-out;
  }
  .accent:hover { border-color: var(--line-strong); color: var(--ink); }
  .accent.on { border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue); color: var(--ink); font-weight: 600; }
  .ramp { display: inline-flex; gap: 2px; }
  .ramp i { width: 8px; height: 8px; border-radius: 2px; box-shadow: inset 0 0 0 1px var(--cell-edge); }
  .hint { grid-column: 1 / -1; margin: 4px 0 0; font: 400 12px/1.4 var(--font-ui); color: var(--muted); }

  .save { display: flex; flex-direction: column; gap: 10px; }
  .save :global(.save-err) { padding: 8px 12px; font-size: 13px; }
  .save-row { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
  .state { margin-right: auto; font: 400 12px/1.4 var(--font-ui); color: var(--muted); }

  .devices {
    display: inline-flex;
    margin-left: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .devices button {
    padding: 2px 10px;
    border: 0;
    background: var(--surface);
    color: var(--muted);
    font: 500 12px/20px var(--font-ui);
    cursor: pointer;
  }
  .devices button + button { border-left: 1px solid var(--line); }
  .devices button:hover { color: var(--ink); background: var(--well); }
  .devices button.on { background: var(--well-2); color: var(--ink); font-weight: 600; }
  .devices button:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }

  .stagebox { padding: 16px; background: var(--well); }

  @media (max-width: 1100px) {
    .editor { grid-template-columns: minmax(0, 1fr); }
  }

  @media (prefers-reduced-motion: reduce) {
    .opt, .accent { transition: none; }
  }
</style>

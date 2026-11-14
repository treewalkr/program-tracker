<script lang="ts">
  import type { RoleRank } from "@pt/shared";
  import type { AiDraftDto } from "$lib/api/types";
  import type { DraftEditor } from "$lib/draftEditor.svelte";
  import { selectionActions } from "$lib/draftEditMenu";
  import OverflowMenu from "$lib/ui/OverflowMenu.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * The hand-edit strip under a draft: in select mode, a bar acting on the
   * ticked rows (↑ ↓ · Superset · Move to… · Clear); after an edit, a toast
   * naming it with Undo; a failed save says why. `pane` sits in the draft
   * pane's flow above its foot; `page` floats at the bottom of the review page.
   */
  interface Props {
    editor: DraftEditor;
    /** The latest version's draft (what the ticked refs point into). */
    draft: AiDraftDto;
    /** The draft week the ticked rows are in (absent = the first week). */
    week?: number | null;
    labels?: readonly RoleRank[];
    /** The version's trainerOrder: rows are shown as stored, not role-sorted. */
    keepOrder?: boolean;
    variant?: "pane" | "page";
    /** `page`: height of a fixed bar under the page (the phone approve bar) to float above. */
    lift?: number;
  }

  let { editor, draft, week = null, labels, keepOrder = false, variant = "pane", lift = 0 }: Props = $props();

  const refs = $derived(editor.refs);
  const acts = $derived(selectionActions(draft, refs, labels, { keepOrder, week }));
  const showBar = $derived(editor.selecting && refs.length > 0);
  const shown = $derived(showBar || !!editor.toast || !!editor.error);

  // Floating on the page: lift the Feedback pill above the dock, as the log sheet's Save does.
  let height = $state(0);
  $effect(() => {
    if (variant !== "page" || !shown || !height) return;
    const root = document.documentElement;
    root.style.setProperty("--feedback-lift", `${lift + height + 12}px`);
    return () => root.style.removeProperty("--feedback-lift");
  });
  const moveItems = $derived(
    acts.moveTo.map((t) => ({
      label: t.label,
      icon: "arrow-right" as const,
      section: "Move to the end of",
      disabled: t.disabled,
      onselect: () => editor.run([t.op]),
    }))
  );
</script>

{#if shown}
  <div class="dock {variant}" bind:clientHeight={height} style:bottom={variant === "page" && lift ? `${lift + 12}px` : null}>
    {#if editor.error}
      <div class="line err" role="alert">
        <span>{editor.error}</span>
        <button type="button" class="btn ghost small" onclick={() => (editor.error = null)}>Dismiss</button>
      </div>
    {/if}
    {#if editor.toast}
      <div class="line toast" role="status">
        <Icon name="pencil" />
        <span class="msg"><strong>v{editor.toast.version}</strong> · {editor.toast.text}</span>
        {#if editor.toast.undo}
          <button type="button" class="btn small" disabled={editor.busy} onclick={() => editor.undo()}>
            <Icon name="undo" />Undo
          </button>
        {/if}
        <button type="button" class="btn ghost small icon" aria-label="Dismiss" onclick={() => editor.dismiss()}><Icon name="x" /></button>
      </div>
    {/if}
    {#if showBar}
      <div class="line bar" role="toolbar" aria-label="Selected exercises">
        <strong class="count">{refs.length} selected</strong>
        <span class="group">
          <button
            type="button"
            class="btn small icon"
            aria-label="Move selected up"
            title="Move up"
            disabled={editor.busy || !acts.up}
            onclick={() => acts.up && editor.run([acts.up], { keep: true })}><Icon name="arrow-up" /></button
          >
          <button
            type="button"
            class="btn small icon"
            aria-label="Move selected down"
            title="Move down"
            disabled={editor.busy || !acts.down}
            onclick={() => acts.down && editor.run([acts.down], { keep: true })}><Icon name="arrow-down" /></button
          >
        </span>
        <button
          type="button"
          class="btn small"
          disabled={editor.busy || !acts.superset}
          title={acts.superset ? undefined : "Tick 2 or more exercises in one session"}
          onclick={() => acts.superset && editor.run([acts.superset])}><Icon name="link" />Superset</button
        >
        <OverflowMenu
          items={moveItems}
          label="Move selected to a session"
          text="Move to…"
          icon="arrow-right"
          triggerClass="btn small"
          disabled={editor.busy}
        />
        <button type="button" class="btn ghost small clear" onclick={() => editor.clear()}>Clear</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .dock {
    display: flex;
    flex-direction: column;
    flex: none;
  }
  .dock.pane {
    border-top: 1px solid var(--line);
  }
  /* The review page: floats over the sessions like the sticky save bar. */
  .dock.page {
    position: sticky;
    bottom: 12px;
    z-index: 5;
    margin-top: 12px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: var(--shadow-overlay);
    overflow: hidden;
  }
  .line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 16px;
    font-size: 13px;
  }
  .line + .line {
    border-top: 1px solid var(--line);
  }
  .toast {
    background: var(--well);
  }
  .toast > :global(svg) {
    width: 14px;
    height: 14px;
    color: var(--muted);
    flex: none;
  }
  .msg {
    flex: 1 1 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .msg strong {
    font: 600 12px/1 var(--font-mono);
  }
  .err {
    color: var(--bad);
    background: var(--bad-bg);
  }
  .err span {
    flex: 1 1 200px;
  }
  .count {
    font-size: 13px;
    margin-right: 4px;
    white-space: nowrap;
  }
  .group {
    display: inline-flex;
    gap: 4px;
  }
  .btn.icon {
    padding-inline: 6px;
  }
  .btn :global(svg) {
    width: 14px;
    height: 14px;
  }
  .clear {
    margin-left: auto;
  }
  @media (pointer: coarse) {
    .bar .btn {
      min-height: 36px;
    }
  }
</style>

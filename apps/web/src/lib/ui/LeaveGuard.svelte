<script lang="ts">
  import type { LeaveGuard } from "$lib/leaveGuard.svelte";

  /**
   * "Unsaved changes" dialog on a native modal `<dialog>`. "Keep editing" is
   * the safe default (initial focus, Esc, backdrop click); leaving without
   * saving is a quiet danger action; "Save and leave" shows only when the
   * guard can save.
   */
  let {
    guard,
    title = "Leave without saving?",
    body,
    leaveLabel = "Leave without saving",
  }: {
    guard: LeaveGuard;
    title?: string;
    body: string;
    leaveLabel?: string;
  } = $props();

  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) return;
    if (guard.open && !dialog.open) dialog.showModal();
    else if (!guard.open && dialog.open) dialog.close();
  });
</script>

<dialog
  bind:this={dialog}
  class="leave"
  aria-labelledby="leave-title"
  aria-describedby="leave-body"
  oncancel={(e) => {
    e.preventDefault();
    guard.stay();
  }}
  onclick={(e) => {
    if (e.target === dialog) guard.stay();
  }}
>
  <h2 id="leave-title">{title}</h2>
  <p id="leave-body">{body}</p>
  <div class="actions">
    <button type="button" class="btn danger ghost-danger" disabled={guard.busy} onclick={() => guard.leave()}>{leaveLabel}</button>
    <span class="grow"></span>
    {#if guard.canSave}
      <button type="button" class="btn" disabled={guard.busy} onclick={() => guard.saveAndLeave()}>
        {guard.busy ? "Saving…" : "Save and leave"}
      </button>
    {/if}
    <!-- svelte-ignore a11y_autofocus -->
    <button type="button" class="btn primary" autofocus disabled={guard.busy} onclick={() => guard.stay()}>Keep editing</button>
  </div>
</dialog>

<style>
  .leave {
    width: min(440px, calc(100vw - 32px));
    padding: 20px 22px 18px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-overlay);
  }
  .leave::backdrop {
    background: rgba(13, 17, 23, 0.5);
  }
  h2 {
    margin: 0 0 6px;
    font: 600 16px/1.3 var(--font-ui);
  }
  p {
    margin: 0 0 18px;
    font: 400 13.5px/1.5 var(--font-ui);
    color: var(--muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
  .ghost-danger {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
  }
  @media (max-width: 480px) {
    .grow {
      display: none;
    }
    .actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }
  }
</style>

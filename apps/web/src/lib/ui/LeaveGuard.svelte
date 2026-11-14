<script lang="ts">
  import type { Asker } from "$lib/leaveGuard.svelte";

  /**
   * The page's one confirm dialog, on a native modal `<dialog>`: the
   * "unsaved changes" prompt from `createLeaveGuard` and any `guard.ask()`.
   * The safe choice sits on the right as the primary button and takes initial
   * focus, Esc and backdrop clicks; the asked-about action is a quiet button
   * on the left (red when it drops work); an optional third choice sits
   * between. With `choices`, the ways forward stack as full-width buttons
   * above Cancel instead. Focus goes back to whatever opened it.
   */
  let { guard }: { guard: Asker } = $props();

  let dialog = $state<HTMLDialogElement>();
  let opener: HTMLElement | null = null;
  const uid = $props.id();
  const req = $derived(guard.request);

  $effect(() => {
    if (!dialog) return;
    if (req && !dialog.open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!req && dialog.open) {
      dialog.close();
      // The dialog hands focus back itself; this covers an opener it couldn't reach.
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body))
        opener.focus({ preventScroll: true });
      opener = null;
    }
  });
</script>

<dialog
  bind:this={dialog}
  class="leave"
  aria-labelledby="{uid}-title"
  aria-describedby="{uid}-body"
  oncancel={(e) => {
    e.preventDefault();
    guard.answer("cancel");
  }}
  onclick={(e) => {
    if (e.target === dialog) guard.answer("cancel");
  }}
>
  {#if req}
    <h2 id="{uid}-title">{req.title}</h2>
    <p id="{uid}-body">{req.body}</p>
    {#if req.choices?.length}
      <div class="choices">
        {#each req.choices as c (c.id)}
          <button type="button" class="choice" disabled={guard.busy} onclick={() => guard.answer(`choice:${c.id}`)}>
            <span class="choice-label">{c.label}</span>
            {#if c.hint}<span class="choice-hint">{c.hint}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
    <div class="actions">
      {#if req.confirmLabel}
        <button
          type="button"
          class="btn"
          class:danger={req.danger !== false}
          class:ghost={req.danger !== false}
          disabled={guard.busy}
          onclick={() => guard.answer("confirm")}>{req.confirmLabel}</button
        >
      {/if}
      <span class="grow"></span>
      {#if req.alt}
        <button type="button" class="btn" disabled={guard.busy} onclick={() => guard.answer("alt")}>
          {guard.busy ? (req.alt.busyLabel ?? req.alt.label) : req.alt.label}
        </button>
      {/if}
      <!-- svelte-ignore a11y_autofocus -->
      <button type="button" class="btn" class:primary={!req.choices?.length} autofocus disabled={guard.busy} onclick={() => guard.answer("cancel")}
        >{req.cancelLabel ?? "Cancel"}</button
      >
    </div>
  {/if}
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
  .leave[open] {
    animation: leave-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .leave::backdrop {
    background: var(--scrim);
  }
  @keyframes leave-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
  }
  h2 {
    margin: 0 0 6px;
    font: 600 16px/1.3 var(--font-ui);
    text-wrap: balance;
  }
  p {
    margin: 0 0 18px;
    font: 400 13.5px/1.5 var(--font-ui);
    color: var(--muted);
    text-wrap: pretty;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 0 18px;
  }
  .choice {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: border-color 120ms, background-color 120ms;
  }
  .choice:hover:not(:disabled) {
    border-color: var(--line-strong);
    background: var(--well);
  }
  .choice-label {
    font: 600 13.5px/1.35 var(--font-ui);
  }
  .choice-hint {
    font: 400 12.5px/1.4 var(--font-ui);
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
  @media (max-width: 480px) {
    .grow {
      display: none;
    }
    .actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .btn {
      justify-content: center;
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .leave[open] {
      animation: none;
    }
  }
</style>

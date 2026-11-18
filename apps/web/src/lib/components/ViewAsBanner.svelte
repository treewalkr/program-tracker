<script lang="ts">
  import type { Impersonator } from "$lib/api/auth";
  import type { Locale } from "$lib/portal/messages";
  import Icon from "$lib/ui/Icon.svelte";
  import { VIEW_TEXT, confirmMatches, endedReason, firstName, minutesLeft, viewState } from "$lib/viewAs";

  /**
   * The bar across the top of the app while the admin views it as a trainer.
   * It can't be dismissed: read-only is Inverted Ink (it reads as the app's own
   * chrome, not the page), Edits on turns it Attention Amber, and an ended
   * view drops to a quiet well with the way back. Allow edits asks for the
   * trainer's first name in a modal before anything can be written.
   */
  interface Props {
    view: Impersonator;
    /** ms since epoch — the caller's ticking clock. */
    now: number;
    locale: Locale;
    busy?: boolean;
    error?: string | null;
    onstop: () => void;
    /** Rejects with the reason when the name doesn't match server-side. */
    onallow: (confirm: string) => Promise<void>;
    onlock: () => void;
  }

  let { view, now, locale, busy = false, error = null, onstop, onallow, onlock }: Props = $props();

  const text = $derived(VIEW_TEXT[locale]);
  const mode = $derived(viewState(view, now));
  const first = $derived(firstName(view.trainer.name));
  const minutes = $derived(minutesLeft(mode === "edits" && view.writesUntil ? view.writesUntil : view.until, now));
  const uid = $props.id();

  let dialog = $state<HTMLDialogElement>();
  let typed = $state("");
  let allowing = $state(false);
  let allowError = $state<string | null>(null);
  const canAllow = $derived(confirmMatches(typed, view.trainer.name) && !allowing);

  function openAllow() {
    typed = "";
    allowError = null;
    dialog?.showModal();
  }
  function closeAllow() {
    dialog?.close();
  }
  async function submitAllow(e: SubmitEvent) {
    e.preventDefault();
    if (!canAllow) return;
    allowing = true;
    allowError = null;
    try {
      await onallow(typed.trim());
      closeAllow();
    } catch (err) {
      allowError = err instanceof Error ? err.message : "That didn't work";
    } finally {
      allowing = false;
    }
  }
</script>

<div class="view-as {mode}" role="region" aria-label={text.region}>
  {#if mode === "ended"}
    <p class="who">
      <span class="lead" aria-hidden="true"><Icon name="eye" /></span>
      <span><strong>{text.ended(view.trainer.name)}</strong> <span class="why">{text.why[endedReason(view)]}</span></span>
    </p>
    <div class="actions">
      <button type="button" class="bar-btn solid" disabled={busy} onclick={onstop}>{text.backTo(view.ticket?.handle ?? null)}</button>
    </div>
  {:else}
    <p class="who">
      <span class="lead" aria-hidden="true"><Icon name={mode === "edits" ? "pencil" : "eye"} /></span>
      <span class="prefix">{text.viewingAs}</span>
      <strong class="name">{view.trainer.name}</strong>
      {#if view.ticket}<code class="ticket">{view.ticket.handle}</code>{/if}
    </p>
    <p class="meta" aria-live="polite">
      <span class="mode">{mode === "edits" ? text.editsOn : text.readOnly}</span>
      <span class="sep" aria-hidden="true">·</span>
      <span class="clock">{text.minLeft(minutes)}</span>
    </p>
    <div class="actions">
      {#if error}<span class="error" role="alert">{error}</span>{/if}
      {#if mode === "edits"}
        <button type="button" class="bar-btn" disabled={busy} onclick={onlock}><Icon name="lock" />{text.lock}</button>
      {:else}
        <button type="button" class="bar-btn" disabled={busy} onclick={openAllow} aria-haspopup="dialog">{text.allowEdits}</button>
      {/if}
      <button type="button" class="bar-btn solid" disabled={busy} onclick={onstop}>{busy ? text.stopping : text.stop}</button>
    </div>
  {/if}
</div>

<dialog
  bind:this={dialog}
  class="allow"
  aria-labelledby="{uid}-title"
  aria-describedby="{uid}-body"
  onclick={(e) => {
    if (e.target === dialog) closeAllow();
  }}
>
  <form onsubmit={submitAllow}>
    <h2 id="{uid}-title">{text.dialogTitle(first)}</h2>
    <p id="{uid}-body">{text.dialogBody(first)}</p>
    <label class="label" for="{uid}-name">{text.typeToConfirm(first)}</label>
    <!-- svelte-ignore a11y_autofocus -->
    <input
      id="{uid}-name"
      class="input"
      bind:value={typed}
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      autofocus
      placeholder={first}
      aria-invalid={allowError ? true : undefined}
    />
    {#if allowError}<p class="err" role="alert">{allowError}</p>{/if}
    <div class="dialog-actions">
      <button type="button" class="btn" onclick={closeAllow}>{text.cancel}</button>
      <span class="grow"></span>
      <button type="submit" class="btn warn" disabled={!canAllow}>{text.confirm}</button>
    </div>
  </form>
</dialog>

<style>
  /* One line of chrome above the whole app (the layout pins it). Read-only = Inverted Ink: the
     loudest fill the system allows, so it can't be mistaken for page content. */
  .view-as {
    display: flex;
    align-items: center;
    gap: 6px 16px;
    min-height: 40px;
    padding: 4px 8px 4px 16px;
    background: var(--hover-ink);
    color: var(--on-ink);
    font: 400 13px/1.4 var(--font-ui);
    --bar-fg: var(--on-ink);
    --bar-line: color-mix(in srgb, var(--on-ink) 28%, transparent);
    --bar-hover: color-mix(in srgb, var(--on-ink) 12%, transparent);
  }
  .view-as.edits {
    background: var(--warn-bg);
    color: var(--warn-ink);
    box-shadow: inset 0 -1px 0 var(--warn-line);
    --bar-fg: var(--warn-ink);
    --bar-line: var(--warn-line);
    --bar-hover: color-mix(in srgb, var(--warn) 14%, transparent);
  }
  .view-as.ended {
    background: var(--well);
    color: var(--ink);
    box-shadow: inset 0 -1px 0 var(--line);
    --bar-fg: var(--ink);
    --bar-line: var(--line);
    --bar-hover: var(--well-2);
  }
  p {
    margin: 0;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .lead {
    display: grid;
    place-items: center;
    flex: none;
  }
  .lead :global(svg) {
    width: 16px;
    height: 16px;
    stroke-width: 1.75;
  }
  .prefix {
    color: inherit;
    opacity: 0.78;
    white-space: nowrap;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ticket {
    flex: none;
    padding: 1px 6px;
    border-radius: var(--radius);
    background: var(--bar-hover);
    box-shadow: inset 0 0 0 1px var(--bar-line);
    font: 500 12px/1.4 var(--font-mono);
    color: inherit;
  }
  .why {
    opacity: 0.8;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .mode {
    font-weight: 600;
  }
  .sep {
    opacity: 0.6;
  }
  .clock {
    font: 500 12px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    flex: none;
  }
  .error {
    font-size: 12px;
    max-width: 28ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Buttons drawn in the bar's own ink, so they hold up on every fill and theme. */
  .bar-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border: 1px solid var(--bar-line);
    border-radius: var(--radius);
    background: transparent;
    color: var(--bar-fg);
    font: 500 12px/1 var(--font-ui);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease-out;
  }
  .bar-btn :global(svg) {
    width: 14px;
    height: 14px;
    stroke-width: 1.75;
  }
  .bar-btn:hover:not(:disabled) {
    background: var(--bar-hover);
  }
  .bar-btn:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .bar-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  /* Stop: the bar's one filled control, the way out. */
  .bar-btn.solid {
    border-color: transparent;
    background: var(--bar-fg);
    color: var(--hover-ink);
  }
  .view-as.edits .bar-btn.solid {
    color: var(--bg);
    background: var(--warn-ink);
  }
  .view-as.ended .bar-btn.solid {
    color: var(--on-ink);
    background: var(--hover-ink);
  }
  .bar-btn.solid:hover:not(:disabled) {
    background: var(--bar-fg);
    opacity: 0.9;
  }

  /* Under 720px: who on the first line, the clock and buttons on the second. */
  @media (max-width: 720px) {
    .view-as {
      flex-wrap: wrap;
      padding: 8px 12px;
    }
    .who {
      flex: 1 0 100%;
    }
    .view-as.ended .who {
      align-items: flex-start;
    }
    .actions {
      gap: 6px;
    }
    .bar-btn {
      height: 36px;
      padding: 0 14px;
      font-size: 13px;
    }
    .error {
      display: none;
    }
  }

  .allow {
    width: min(440px, calc(100vw - 32px));
    padding: 20px 22px 18px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-overlay);
  }
  .allow[open] {
    animation: allow-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .allow::backdrop {
    background: var(--scrim);
  }
  @keyframes allow-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
  }
  .allow h2 {
    margin: 0 0 6px;
    font: 600 16px/1.3 var(--font-ui);
    text-wrap: balance;
  }
  .allow p {
    margin: 0 0 16px;
    font: 400 13.5px/1.5 var(--font-ui);
    color: var(--muted);
    text-wrap: pretty;
  }
  .allow .label {
    display: block;
    margin-bottom: 6px;
  }
  .allow .input {
    width: 100%;
  }
  .allow .err {
    margin: 6px 0 0;
    color: var(--bad);
    font-size: 12.5px;
  }
  .dialog-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 18px;
  }
  .grow {
    flex: 1;
  }
  /* Allowing writes is an attention verb, not the review flow's green. */
  .btn.warn {
    background: var(--warn-bg);
    border-color: var(--warn-line);
    color: var(--warn-ink);
  }
  .btn.warn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--warn) 18%, var(--warn-bg));
  }
  @media (max-width: 480px) {
    .grow {
      display: none;
    }
    .dialog-actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .dialog-actions .btn {
      justify-content: center;
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .allow[open] {
      animation: none;
    }
    .bar-btn {
      transition: none;
    }
  }
</style>

<script lang="ts">
  import { feedbackHandle, type FeedbackItem } from "@pt/shared";
  import { feedbackApi } from "./client";

  /**
   * Stop (or resume) emails about one ticket, for the signed-in trainer.
   * Optimistic: `onchange` fires at once and again with the old value on error.
   * Unread dots are unaffected — muting is about email only.
   */
  interface Props {
    item: Pick<FeedbackItem, "id" | "number" | "muted">;
    onchange: (muted: boolean) => void;
  }
  let { item, onchange }: Props = $props();

  let saving = $state(false);
  let error = $state<string | null>(null);
  const handle = $derived(feedbackHandle(item.number));

  async function toggle() {
    const next = !item.muted;
    onchange(next);
    saving = true;
    error = null;
    try {
      await feedbackApi.setMuted(item.id, next);
    } catch (err) {
      onchange(!next);
      error = (err as Error).message || "Could not save";
    } finally {
      saving = false;
    }
  }
</script>

<button
  type="button"
  class="mute"
  class:on={item.muted}
  title={error ?? (item.muted ? `Emails about ${handle} are off — click to turn them back on` : `Stop emails about ${handle}`)}
  aria-pressed={item.muted}
  disabled={saving}
  onclick={toggle}
>
  {#if item.muted}Muted · <span class="u">Unmute</span>{:else}Mute{/if}
</button>

<style>
  .mute {
    font: inherit;
    font-size: 12px;
    line-height: 1;
    padding: 3px 6px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .mute:hover:not(:disabled) { background: var(--well-2); color: var(--ink); }
  .mute:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  .mute:disabled { opacity: 0.6; cursor: default; }
  .mute.on .u { color: var(--blue); }
</style>

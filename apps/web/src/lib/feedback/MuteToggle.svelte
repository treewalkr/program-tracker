<script lang="ts">
  import { feedbackHandle, type FeedbackItem } from "@pt/shared";
  import { feedbackApi } from "./client";
  import Icon from "$lib/ui/Icon.svelte";

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
  /** Fixed name, state in aria-pressed (pressed = emails on); the tooltip spells the state out. */
  const label = $derived(`Emails about ${handle}`);
  const tip = $derived(
    item.muted ? `Emails about ${handle} are off — click to turn them back on` : `Emails about ${handle} are on — click to stop them`,
  );

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
  title={error ?? tip}
  aria-label={label}
  aria-pressed={!item.muted}
  disabled={saving}
  onclick={toggle}
>
  <Icon name={item.muted ? "bell-off" : "bell"} size={14} />
</button>

<style>
  .mute {
    display: inline-grid;
    place-items: center;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }
  .mute:hover:not(:disabled) { background: var(--well-2); color: var(--ink); }
  .mute:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  .mute:disabled { opacity: 0.6; cursor: default; }
  .mute.on { color: var(--blue); }
</style>

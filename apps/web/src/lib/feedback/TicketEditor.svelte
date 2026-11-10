<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { feedbackHandle, type FeedbackItem } from "@pt/shared";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";
  import AttachmentInput from "./AttachmentInput.svelte";
  import { attachmentUrl, EditConflict, feedbackApi, ticketImageCaption } from "./client";
  import { ImageTray } from "./tray.svelte";

  /**
   * Inline editor for a ticket's comment and its own images (captured
   * screenshots included): remove, add, reorder. Starts from the ticket as it
   * is now; if someone else saves first, the save is refused and the editor
   * offers to reload the latest version. Esc cancels, ⌘/Ctrl+Return saves.
   */
  interface Props {
    item: FeedbackItem;
    /** The signed-in trainer's id, to say whose ticket is being edited. */
    viewerId: string | null;
    onsaved: (next: FeedbackItem) => void;
    /** The latest ticket after a conflict (the page shows it; the editor restarts from it). */
    onreload: (next: FeedbackItem) => void;
    oncancel: () => void;
  }
  let { item, viewerId, onsaved, onreload, oncancel }: Props = $props();

  const tray = new ImageTray();
  let text = $state("");
  /** `editedAt ?? createdAt` of the version this edit started from. */
  let version = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);
  let conflict = $state<string | null>(null);
  let reloading = $state(false);

  function start(from: FeedbackItem) {
    text = from.comment;
    version = from.editedAt ?? from.createdAt;
    const caption = ticketImageCaption(from);
    tray.seed(from.attachments, (a) => attachmentUrl(from.id, a.id), (a, n) => caption(a, n).split(" · ")[1] ?? "");
    error = null;
    conflict = null;
  }
  start(untrack(() => item));
  onDestroy(() => tray.clear());

  const handle = $derived(feedbackHandle(item.number));
  /** The admin editing a trainer's ticket: the reporter will see it marked. */
  const othersTicket = $derived(item.author !== null && viewerId !== null && item.author.id !== viewerId);
  const canSave = $derived(!saving && !reloading && !tray.busy && conflict === null && text.trim() !== "");

  async function save() {
    if (!canSave) return;
    saving = true;
    error = null;
    try {
      const { layout, images } = tray.layout;
      onsaved(await feedbackApi.editContent(item.id, { comment: text.trim(), version, layout, images }));
    } catch (err) {
      if (err instanceof EditConflict) conflict = err.message;
      else error = err instanceof Error ? err.message : "Couldn't save the edit";
    } finally {
      saving = false;
    }
  }

  async function reload() {
    reloading = true;
    try {
      const next = await feedbackApi.get(item.id);
      onreload(next);
      start(next);
    } catch (err) {
      error = err instanceof Error ? err.message : "Couldn't reload the ticket";
    } finally {
      reloading = false;
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && !e.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      oncancel();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) {
      e.preventDefault();
      save();
    }
  }

  /** Keys anywhere in the editor — the text or an image thumbnail. */
  function keys(node: HTMLElement) {
    node.addEventListener("keydown", onkeydown);
    return () => node.removeEventListener("keydown", onkeydown);
  }

  /** Focus the text, caret at the end, when the editor opens. */
  function autofocus(node: HTMLTextAreaElement) {
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }
</script>

<form
  class="editor"
  class:dropping={tray.dragging}
  aria-label="Edit {handle}"
  aria-busy={saving}
  onsubmit={(e) => (e.preventDefault(), save())}
  {@attach tray.zone}
  {@attach keys}
>
  <textarea
    aria-label="Comment on {handle}"
    rows="3"
    maxlength="5000"
    bind:value={text}
    disabled={saving}
    {@attach autofocus}
  ></textarea>
  <AttachmentInput {tray} disabled={saving} label={handle} />

  {#if conflict}
    <Note tone="warn" role="alert">
      <span class="conflict">
        <span>{conflict} Reload to see the latest version — your changes here will be discarded.</span>
        <Button small type="button" disabled={reloading} onclick={reload}>{reloading ? "Reloading…" : "Reload"}</Button>
      </span>
    </Note>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="actions">
    <Button small variant="primary" type="submit" disabled={!canSave}>{saving ? "Saving…" : "Save"}</Button>
    <Button small variant="ghost" type="button" onclick={oncancel}>Cancel</Button>
    <span class="hint">
      {#if othersTicket}{item.author?.name} will see it marked as edited by you.{:else}Saving marks the ticket as edited.{/if}
    </span>
  </div>
</form>

<style>
  /* An open edit takes the focus halo, as panels in edit mode do. */
  .editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: var(--measure-prose);
    padding: 10px;
    margin: -4px 0 0 -10px;
    border: 1px solid var(--blue);
    border-radius: var(--radius);
    box-shadow: 0 0 0 3px var(--focus);
    background: var(--bg);
  }
  .editor.dropping {
    outline: 2px dashed var(--blue);
    outline-offset: 3px;
  }
  textarea {
    display: block;
    width: 100%;
    box-sizing: border-box;
    field-sizing: content;
    min-height: 72px;
    max-height: 360px;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    resize: vertical;
    /* Same face as the comment it replaces, so the edit reads in place. */
    font: 500 15px/1.5 var(--font-ui);
    color: var(--ink);
    background: var(--bg);
  }
  textarea:focus {
    outline: none;
    border-color: var(--blue);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .hint {
    margin-left: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .conflict {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: var(--bad);
  }
</style>

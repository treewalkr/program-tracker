import type { DraftEditOp, DraftRef } from "@pt/shared";
import type { DraftEditResultDto, TrainerApi } from "$lib/api/types";
import { followSelection, keyRef, refKey } from "$lib/draftEditMenu";

export interface DraftEditToast {
  version: number;
  text: string;
  /** Ops that put the previous version back; null once undone. */
  undo: DraftEditOp[] | null;
}

const TOAST_MS = 8000;

/**
 * Hand edits on the latest draft version, shared by the chat draft pane and
 * the review page: select mode and its ticked rows, the save in flight, and
 * the "edited · Undo" toast. Each action saves one new version (server
 * replays the ops); Undo saves another that restores the previous one.
 */
export class DraftEditor {
  selecting = $state(false);
  /** Ticked rows as "day:slot" keys into the latest version. */
  selected = $state<string[]>([]);
  busy = $state(false);
  error = $state<string | null>(null);
  toast = $state<DraftEditToast | null>(null);
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly opts: {
      api: Pick<TrainerApi, "editDraft">;
      /** The version edits apply to (the latest), or null when editing is off. */
      target: () => { id: string } | null;
      /** A new version was saved: show it (and its chat note). */
      onsaved: (res: DraftEditResultDto) => void;
    }
  ) {}

  get refs(): DraftRef[] {
    return this.selected.map(keyRef);
  }

  isSelected(r: DraftRef): boolean {
    return this.selected.includes(refKey(r));
  }

  toggle(r: DraftRef) {
    const k = refKey(r);
    this.selected = this.selected.includes(k) ? this.selected.filter((x) => x !== k) : [...this.selected, k];
  }

  setSelecting(on: boolean) {
    this.selecting = on;
    if (!on) this.selected = [];
  }

  clear() {
    this.selected = [];
  }

  dismiss() {
    clearTimeout(this.#timer);
    this.toast = null;
  }

  /** Save one action as the next version. `keep` follows the ticked rows to their new places. */
  async run(ops: DraftEditOp[], opts: { keep?: boolean; undoing?: boolean } = {}) {
    const target = this.opts.target();
    if (!target || this.busy) return;
    this.busy = true;
    this.error = null;
    try {
      const res = await this.opts.api.editDraft(target.id, ops);
      this.selected = opts.keep ? followSelection(this.selected, res.undo) : [];
      this.opts.onsaved(res);
      this.#show({
        version: Number(res.message.content.match(/\(v(\d+)\)/)?.[1] ?? 0),
        text: res.generation.revisionMessage?.replace(/^Edited by you: /, "") ?? "Edited",
        undo: opts.undoing ? null : res.undo,
      });
    } catch (err) {
      this.error = (err as Error).message || "Could not save the edit";
    } finally {
      this.busy = false;
    }
  }

  async undo() {
    const ops = this.toast?.undo;
    if (!ops) return;
    await this.run(ops, { undoing: true });
  }

  #show(t: DraftEditToast) {
    clearTimeout(this.#timer);
    this.toast = t;
    this.#timer = setTimeout(() => (this.toast = null), TOAST_MS);
  }
}

import { BUILTIN_ROLE_LABELS, type RoleLabel } from "@pt/shared";
import { api } from "$lib/api";
import type { RoleLabelInput, RoleLabelPatch } from "$lib/api/types";

/**
 * The trainer's role labels (built-ins + their own), loaded once per page
 * load by the root layout and shared by every picker and chip. Starts as the
 * built-ins so chips render before the fetch lands. ssr is off, so module
 * state is per browser tab.
 */
let list = $state<RoleLabel[]>(BUILTIN_ROLE_LABELS.map((l) => ({ ...l })));
let pending: Promise<void> | null = null;

function replace(label: RoleLabel) {
  const next = list.some((l) => l.key === label.key) ? list.map((l) => (l.key === label.key ? label : l)) : [...list, label];
  list = next.sort((a, b) => a.rank - b.rank);
}

export const roleLabels = {
  /** Every label, archived included (programs still render those). */
  get all(): RoleLabel[] {
    return list;
  },
  /** Fetch once; a failed fetch is retried on the next call. */
  load(): Promise<void> {
    pending ??= api
      .roleLabels()
      .then((labels) => {
        list = labels;
      })
      .catch(() => {
        pending = null;
      });
    return pending;
  },
  async create(input: RoleLabelInput): Promise<RoleLabel> {
    const created = await api.createRoleLabel(input);
    replace(created);
    return created;
  },
  async update(idOrKey: string, patch: RoleLabelPatch): Promise<RoleLabel> {
    const updated = await api.patchRoleLabel(idOrKey, patch);
    replace(updated);
    return updated;
  },
  async archive(id: string): Promise<RoleLabel> {
    const archived = await api.archiveRoleLabel(id);
    replace(archived);
    return archived;
  },
};

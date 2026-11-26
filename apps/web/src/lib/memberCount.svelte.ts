/**
 * The sidebar's Members badge: members that aren't archived. One shared count,
 * so a page that changes who is on the list (archiving a member, restoring one,
 * adding one) refreshes it instead of leaving the badge stale until a reload.
 */
export const activeMembers = (clients: readonly { status: string }[]): number =>
  clients.filter((c) => c.status !== "archived").length;

class MemberCount {
  /** null until first loaded, or when the list couldn't be read: the badge hides. */
  value = $state<number | null>(null);

  #seq = 0;

  /** Re-reads the member list; a failure clears the badge rather than showing an old number.
   *  The latest call wins: an older read that answers late never overwrites a newer one. */
  async refresh(load: () => Promise<readonly { status: string }[]>) {
    const seq = ++this.#seq;
    try {
      const n = activeMembers(await load());
      if (seq === this.#seq) this.value = n;
    } catch {
      if (seq === this.#seq) this.value = null;
    }
  }
}

export const memberCount = new MemberCount();
export type { MemberCount };

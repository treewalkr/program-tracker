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

  /** Re-reads the member list; a failure clears the badge rather than showing an old number. */
  async refresh(load: () => Promise<readonly { status: string }[]>) {
    try {
      this.value = activeMembers(await load());
    } catch {
      this.value = null;
    }
  }
}

export const memberCount = new MemberCount();
export type { MemberCount };

import { feedbackApi } from "./client";

/**
 * Unread feedback count for the sidebar badge. Refreshed on navigation; the
 * feedback page marks items seen as they scroll into view and drops the count
 * at once so the badge never lags behind what the trainer just read.
 */
class FeedbackUnread {
  count = $state(0);

  async refresh() {
    try {
      this.count = await feedbackApi.unread();
    } catch {
      // Signed out or API down: keep the last count; the badge is a hint, not data.
    }
  }

  async markSeen(id: string) {
    this.count = Math.max(0, this.count - 1);
    try {
      await feedbackApi.seen(id);
    } finally {
      await this.refresh();
    }
  }
}

export const feedbackUnread = new FeedbackUnread();

import { renderInlineMarkdown } from "$lib/markdown";

/** Inline markdown plus ⟦tone|label⟧ pills — the guides' own copy, never user input. */
export const rich = (text: string) =>
  renderInlineMarkdown(text).replace(/⟦(\w+)\|([^⟧]+)⟧/g, '<span class="pill $1">$2</span>');

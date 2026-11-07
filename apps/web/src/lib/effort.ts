/** Reasoning-effort levels as the trainer reads them; "none" switches thinking off. */
export const effortName = (level: string) => (level === "none" ? "off — no thinking" : level);

/** Short form for the composer's model summary: "max effort", "thinking off". */
export const effortSummary = (level: string) => (level === "none" ? "thinking off" : `${level} effort`);

/** The `aria-describedby` for a field: the error line replaces the hint, so only one is named. */
export function describedBy(id: string, { hint, error }: { hint?: string | null; error?: string | null }): string | undefined {
	if (error) return `${id}-err`;
	if (hint) return `${id}-hint`;
	return undefined;
}

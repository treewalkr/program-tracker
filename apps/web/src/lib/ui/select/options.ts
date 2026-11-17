export type SelectTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface SelectOption<T extends string = string> {
	value: T;
	label: string;
	/** Second line under the label (Described options). */
	description?: string;
	/** Group heading (Grouped list). */
	group?: string;
	/** Quiet right-hand fact: "done", "block ending". */
	hint?: string;
	/** Source tag pill on the right: "Library", "Custom". */
	tag?: string;
	/** Avatar initials shown before the label. */
	avatar?: string;
	/** Colour of the Status pill rows. */
	tone?: SelectTone;
	/** An action row ("Add as custom exercise"), not a value. */
	action?: boolean;
}

/** Cluster options by `group`, keeping first-seen group order and in-group order. */
export function groupInOrder<T extends string>(options: SelectOption<T>[]): SelectOption<T>[] {
	const order: (string | undefined)[] = [];
	for (const o of options) if (!order.includes(o.group)) order.push(o.group);
	return order.flatMap((g) => options.filter((o) => o.group === g));
}

/** Split a label into plain and matched runs for `<mark>` highlighting. */
export function matchParts(label: string, query: string): { text: string; hit: boolean }[] {
	const q = query.trim().toLowerCase();
	if (!q) return [{ text: label, hit: false }];
	const parts: { text: string; hit: boolean }[] = [];
	const lower = label.toLowerCase();
	let at = 0;
	for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, at)) {
		if (i > at) parts.push({ text: label.slice(at, i), hit: false });
		parts.push({ text: label.slice(i, i + q.length), hit: true });
		at = i + q.length;
	}
	if (at < label.length) parts.push({ text: label.slice(at), hit: false });
	return parts;
}

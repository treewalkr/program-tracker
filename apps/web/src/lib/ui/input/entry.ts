/**
 * Touch-first number entry: the keyboard's Next/Enter key moves to the next
 * field instead of submitting the form around it.
 */

/** Fields Enter can land on: typed inputs, not toggles or buttons. */
const SKIP_TYPES = new Set(['checkbox', 'radio', 'hidden', 'button', 'submit', 'reset', 'image', 'file', 'range', 'color']);

/** The minimal shape `fieldAfter` reads, so it runs without a DOM in tests. */
export interface FieldLike {
	tagName: string;
	type?: string;
	disabled?: boolean;
	readOnly?: boolean;
	tabIndex: number;
	getClientRects(): { length: number };
}

/** Can Enter move focus here? Enabled, editable, in the tab order and on screen. */
export function isEntryField(el: FieldLike): boolean {
	const tag = el.tagName.toLowerCase();
	if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return false;
	if (tag === 'input' && SKIP_TYPES.has((el.type ?? 'text').toLowerCase())) return false;
	return !el.disabled && !el.readOnly && el.tabIndex >= 0 && el.getClientRects().length > 0;
}

/** The entry field after (or before, `dir` -1) `current` in document order; null at the end. */
export function fieldAfter<T extends FieldLike>(fields: readonly T[], current: T, dir: 1 | -1 = 1): T | null {
	const at = fields.indexOf(current);
	if (at < 0) return null;
	for (let i = at + dir; i >= 0 && i < fields.length; i += dir) {
		if (isEntryField(fields[i])) return fields[i];
	}
	return null;
}

function focusField(el: HTMLElement) {
	el.focus();
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
		try {
			el.select();
		} catch {
			/* types without a selection */
		}
	}
}

/**
 * `onkeydown` for a field that advertises `enterkeyhint="next"`: plain Enter
 * moves to the next field in its form (Shift+Enter goes back); on the last one
 * it, or on a field marked `enterkeyhint="done"`, it closes the keyboard. Never submits. A page that walks its own cells (the
 * trainer log sheet) handles Enter on the form and calls `preventDefault()`;
 * this waits until the event has bubbled past it and stands down if so.
 */
export function enterToNext(e: KeyboardEvent): void {
	if (e.key !== 'Enter' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
	const el = e.currentTarget as HTMLInputElement;
	const view = el.ownerDocument.defaultView;
	if (!view) return;
	const late = (ev: Event) => {
		view.removeEventListener('keydown', late);
		if (ev !== e || ev.defaultPrevented) return;
		ev.preventDefault();
		if (el.getAttribute('enterkeyhint') === 'done') return el.blur();
		const scope: ParentNode = el.form ?? el.ownerDocument;
		const fields = Array.from(scope.querySelectorAll<HTMLElement>('input, textarea, select'));
		const next = fieldAfter(fields, el as HTMLElement, e.shiftKey ? -1 : 1);
		if (next) focusField(next);
		else el.blur();
	};
	view.addEventListener('keydown', late);
}

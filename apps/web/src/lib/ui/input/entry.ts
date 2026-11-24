import type { Attachment } from 'svelte/attachments';

/**
 * Touch-first number entry: a tap on a prefilled field selects it, so typing
 * replaces the value rather than appending to it ("35" + "35" ≠ 3535), and the
 * keyboard's Next/Enter key moves to the next field instead of submitting the
 * form around it.
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

/**
 * `{@attach selectOnTap}`: focusing the field selects its whole value, and so
 * does a tap on it while it is still untouched (focused by Enter, say). A tap
 * places the caret on mouseup (and WebKit again just after), so that mouseup is
 * cancelled and the select repeated a frame later. Once the user types, the
 * field stands back: a value being typed keeps its caret.
 */
export const selectOnTap: Attachment<HTMLInputElement> = (node) => {
	/** Focused and not edited since: the value is still the prefill or the copy. */
	let pristine = false;
	/** A tap's mouseup is still to come and would drop the selection. */
	let armed = false;
	let raf = 0;
	const select = () => {
		try {
			node.select();
		} catch {
			/* types without a selection */
		}
	};
	const isFocused = () => node.ownerDocument.activeElement === node;
	const onpointerdown = () => {
		armed = !!node.value && (!isFocused() || pristine);
	};
	const onfocus = () => {
		pristine = true;
		if (node.value) select();
	};
	const onmouseup = (e: MouseEvent) => {
		if (!armed) return;
		armed = false;
		e.preventDefault();
		select();
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			if (pristine && isFocused()) select();
		});
	};
	const edited = () => {
		pristine = false;
		armed = false;
		cancelAnimationFrame(raf);
	};
	node.addEventListener('pointerdown', onpointerdown);
	node.addEventListener('focus', onfocus);
	node.addEventListener('mouseup', onmouseup);
	node.addEventListener('keydown', edited);
	node.addEventListener('input', edited);
	node.addEventListener('blur', edited);
	return () => {
		edited();
		node.removeEventListener('pointerdown', onpointerdown);
		node.removeEventListener('focus', onfocus);
		node.removeEventListener('mouseup', onmouseup);
		node.removeEventListener('keydown', edited);
		node.removeEventListener('input', edited);
		node.removeEventListener('blur', edited);
	};
};

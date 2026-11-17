import type { SelectOption } from './options';

interface Config<T extends string> {
	items: () => SelectOption<T>[];
	pick: (option: SelectOption<T>) => void;
	/** Index to land on when opening (the chosen option). */
	selectedIndex?: () => number;
	isOpen: () => boolean;
	setOpen: (open: boolean) => void;
	/** Space picks (buttons). Off for text inputs where Space is a character. */
	space?: boolean;
}

/**
 * Keyboard + active-row state shared by every select. Focus stays on the
 * trigger (aria-activedescendant), so the list never steals it.
 */
export class Listbox<T extends string = string> {
	active = $state(0);
	#cfg: Config<T>;

	constructor(cfg: Config<T>) {
		this.#cfg = cfg;
		// A list that starts open (stories, restored state) lands on the chosen row.
		this.active = Math.max(0, cfg.selectedIndex?.() ?? 0);
	}

	get open() {
		return this.#cfg.isOpen();
	}

	show = () => {
		this.active = Math.max(0, this.#cfg.selectedIndex?.() ?? 0);
		this.#cfg.setOpen(true);
	};

	hide = () => this.#cfg.setOpen(false);

	toggle = () => (this.open ? this.hide() : this.show());

	onkeydown = (e: KeyboardEvent) => {
		const items = this.#cfg.items();
		const last = items.length - 1;
		const space = this.#cfg.space ?? true;
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				if (!this.open) this.show();
				else this.active = Math.min(last, this.active + 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				if (!this.open) this.show();
				else this.active = Math.max(0, this.active - 1);
				break;
			case 'Home':
				if (this.open && space) (e.preventDefault(), (this.active = 0));
				break;
			case 'End':
				if (this.open && space) (e.preventDefault(), (this.active = Math.max(0, last)));
				break;
			case 'Enter':
				if (this.open && items[this.active]) (e.preventDefault(), this.#cfg.pick(items[this.active]));
				else if (!this.open && space) (e.preventDefault(), this.show());
				break;
			case ' ':
				if (!space) break;
				e.preventDefault();
				if (this.open && items[this.active]) this.#cfg.pick(items[this.active]);
				else this.show();
				break;
			case 'Tab':
				this.hide();
				break;
		}
	};
}

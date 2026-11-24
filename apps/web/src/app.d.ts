// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** Short git SHA of the build (vite `define`). */
	const __APP_VERSION__: string;
	/** Newest released version in CHANGELOG.md, or null (vite `define`). */
	const __LATEST_RELEASE__: string | null;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Templates page, narrow widths: the reader is open over the list. */
			tplOpen?: boolean;
			/** Templates page: the new-template composer is open (/templates/new). */
			tplNew?: boolean;
		}
		// interface Platform {}
	}
}

export {};

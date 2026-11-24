// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** Short git SHA of the build (vite `define`). */
	const __APP_VERSION__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState {
			/** Templates page, narrow widths: the reader is open over the list. */
			tplOpen?: boolean;
		}
		// interface Platform {}
	}
}

export {};

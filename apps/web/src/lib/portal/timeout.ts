/** A portal write that neither answered nor failed in time: the draft stays, the member can try again. */
export class PortalTimeoutError extends Error {
  constructor() {
    super("timed out");
    this.name = "PortalTimeoutError";
  }
}

/** How long a save may hang on gym Wi-Fi before the member gets the button back. */
export const SAVE_TIMEOUT_MS = 20_000;

/**
 * Run `call` with an abort signal; after `ms` it is aborted and the promise
 * rejects with PortalTimeoutError, whether or not `call` honours the signal.
 */
export function withTimeout<T>(call: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctl = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new PortalTimeoutError());
      ctl.abort();
    }, ms);
    call(ctl.signal).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

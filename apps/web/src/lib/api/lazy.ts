/** An API whose every member is an async method — so a call can wait for the module first. */
type AsyncApi<T> = { [K in keyof T]: T[K] extends (...args: never[]) => Promise<unknown> ? T[K] : never };

/**
 * A stand-in for an API object that lives in a module loaded on the first
 * call. The mock API sits behind one so a live build never preloads (or
 * even ships) the demo backend and its data on the startup path.
 */
export function lazyApi<T extends AsyncApi<T>>(load: () => Promise<T>): T {
  let loading: Promise<T> | null = null;
  const get = () =>
    (loading ??= load().catch((e: unknown) => {
      loading = null; // a dropped chunk fetch: let the next call try again
      throw e;
    }));
  const methods = new Map<PropertyKey, (...args: unknown[]) => Promise<unknown>>();
  return new Proxy({} as T, {
    get(_, key) {
      // never look like a promise (`await api`), a symbol-keyed protocol, or JSON
      if (typeof key === "symbol" || key === "then" || key === "toJSON") return undefined;
      let method = methods.get(key);
      if (!method) {
        method = (...args) =>
          get().then((api) => (api[key as keyof T] as (...a: unknown[]) => Promise<unknown>).apply(api, args));
        methods.set(key, method);
      }
      return method;
    },
  });
}

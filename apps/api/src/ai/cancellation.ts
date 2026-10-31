const controllers = new Map<string, AbortController>();

/** In-process registry of running generations (single-instance local app). */
export function registerGeneration(id: string): AbortController {
  const controller = new AbortController();
  controllers.set(id, controller);
  return controller;
}

export function deregisterGeneration(id: string): void {
  controllers.delete(id);
}

export function abortGeneration(id: string): boolean {
  const controller = controllers.get(id);
  if (!controller) return false;
  controller.abort();
  return true;
}

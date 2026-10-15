// Platzhalter für React im Engine-Bundle (vite.engine.config.ts): MAS ruft keine Hooks auf.
export const useSyncExternalStore = <T>(_abo: unknown, lesen: () => T): T => lesen()

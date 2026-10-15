// Ersatz für React im Engine-Bundle (MAS): befund01.ts braucht React nur für die Live-Anzeige im Browser.
export const useSyncExternalStore = <T>(_abo: unknown, lesen: () => T): T => lesen()

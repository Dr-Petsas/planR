// Ersatz für React im Engine-Bundle (MAS): die Browser-Anzeige braucht Hooks, die Rechnung nicht.
export const useSyncExternalStore = <T>(_abo: unknown, lesen: () => T): T => lesen()
export const useState = <T>(wert: T) => [wert, () => {}] as [T, (n: T) => void]
export const useEffect = (_fn: unknown, _deps?: unknown) => {}
export const useCallback = <T>(fn: T, _deps?: unknown) => fn

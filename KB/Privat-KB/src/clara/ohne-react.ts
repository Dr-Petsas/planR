// Ersatz für React im Engine-Bundle (MAS): store.ts und ablage.ts brauchen React nur im Browser.
export const useSyncExternalStore = <T>(_abo: unknown, lesen: () => T): T => lesen()
export const useState = <T>(start: T | (() => T)): [T, (w: T) => void] => [typeof start === 'function' ? (start as () => T)() : start, () => {}]
export const useEffect = (): void => {}
export const useCallback = <T>(f: T): T => f
export const useRef = <T>(current: T): { current: T } => ({ current })
export const useMemo = <T>(f: () => T): T => f()

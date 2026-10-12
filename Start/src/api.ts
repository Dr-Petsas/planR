/** JSON-Aufruf an PlanR; Fehler kommen als { ok: false, meldung } zurück. */
export type ApiAntwort<T> = T & { ok: boolean; meldung?: string }

export async function apiJson<T>(url: string, init?: RequestInit): Promise<ApiAntwort<T>> {
  try {
    return await (await fetch(url, { cache: 'no-store', ...init })).json()
  } catch {
    return { ok: false, meldung: 'Keine Verbindung.' } as ApiAntwort<T>
  }
}

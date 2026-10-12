/** Über den Tunnel gibt jeder PC sich einmal mit dem Praxis-Code frei, bevor PlanR das Praxisprogramm anspricht. */

type PvsAntwort<T> = T & { ok: boolean; meldung?: string; geraet?: boolean }

let offen: Promise<boolean> | null = null

/** Fragt den Praxis-Code ab (nur einmal gleichzeitig) und meldet, ob der PC jetzt freigegeben ist. */
export function geraetFreigeben(mandant: string): Promise<boolean> {
  offen ??= (async () => {
    const code = prompt('Dieser PC ist für das Praxisprogramm noch nicht freigegeben.\n\nPraxis-Code eingeben (steht im Einrichtungsblatt des PlanR-Agenten):')
    if (!code?.trim()) return false
    const r = await fetch('/api/pvs-geraet', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mandant, code: code.trim(), name: navigator.userAgent.slice(0, 80) }),
    }).then((x) => x.json() as Promise<{ ok: boolean; meldung?: string }>).catch(() => ({ ok: false, meldung: 'Keine Verbindung.' }))
    if (!r.ok) alert(r.meldung || 'Der Praxis-Code passt nicht.')
    return r.ok
  })().finally(() => { offen = null })
  return offen
}

/** JSON-Aufruf an PlanR; verlangt PlanR die Gerätefreigabe, wird nach erfolgreicher Freigabe einmal wiederholt. */
export async function pvsJson<T>(mandant: string, url: string, init?: RequestInit): Promise<PvsAntwort<T>> {
  const los = async (): Promise<PvsAntwort<T>> => {
    try {
      return await (await fetch(url, { cache: 'no-store', ...init })).json()
    } catch {
      return { ok: false, meldung: 'Keine Verbindung.' } as PvsAntwort<T>
    }
  }
  const r = await los()
  return r.geraet && await geraetFreigeben(mandant) ? los() : r
}

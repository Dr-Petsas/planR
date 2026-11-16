import type { ImplantatDetail, Plan, Position } from './types'
import { runden } from './engine/listen'

/** Implantatteile, die der Planer je Zahn aus der Preisliste des gewählten Systems rechnet. */
const TEILE = ['mat:koerper', 'mat:deck', 'mat:gf']

const zaehneVon = (p: Position): string[] => p.zahn.split(',').map((t) => t.trim()).filter(Boolean)

/** Nimmt einen Zahn aus einer Materialzeile des eingelesenen Blatts. Der Betrag sinkt um den Anteil dieses Zahns. */
function ohneZahn(p: Position, zahn: string): Position | null {
  const zaehne = zaehneVon(p)
  const rest = zaehne.filter((z) => z !== zahn)
  if (!rest.length) return null
  const basis = { ...p, zahn: rest.join(',') }
  if (p.anzahl === zaehne.length) return { ...basis, anzahl: rest.length }
  return { ...basis, preis: runden(((p.preis ?? 0) * rest.length) / zaehne.length) }
}

const vomBlatt = (p: Position) => p.ebene === 'MAT' && p.id.startsWith('blatt-')

/**
 * Das Implantatmaterial dieses Zahns steht als feste Zeile vom Blatt im Plan, ohne dass eine Zeile den Zahn nennt.
 * Dann lässt sich nicht sagen, welche Zeile das Implantat ist: die Systemwahl ändert den Preis nicht.
 */
export function festVomBlatt(plan: Plan, zahn: string): boolean {
  if (!plan.entfernt.includes(`mat:koerper:${zahn}`)) return false
  const zeilen = plan.manuell.filter(vomBlatt)
  return zeilen.length > 0 && !zeilen.some((p) => zaehneVon(p).includes(zahn))
}

/**
 * Übernimmt geänderte Implantat-Angaben in den Plan.
 * In einem eingelesenen Kostenvoranschlag steht das Implantatmaterial als feste Zeile vom Blatt, die eigenen Teile des
 * Planers sind abgewählt. Wählt der Zahnarzt dort für einen Zahn ein anderes System, gilt ab dann die Preisliste dieses
 * Systems: die Teile des Planers kommen zurück, der Zahn verlässt die Materialzeilen vom Blatt, ein von Hand gesetzter
 * Preis für diese Teile entfällt.
 */
export function implantateSetzen(plan: Plan, implantate: Record<string, ImplantatDetail>): Plan {
  let neu: Plan = { ...plan, implantate }
  for (const [zahn, d] of Object.entries(implantate)) {
    if (plan.implantate[zahn]?.system === d.system) continue
    const ids = TEILE.map((t) => `${t}:${zahn}`)
    const anpassungen = { ...neu.anpassungen }
    for (const id of ids) {
      if (anpassungen[id]?.preis === undefined) continue
      const { preis: _preis, ...rest } = anpassungen[id]
      if (Object.keys(rest).length) anpassungen[id] = rest
      else delete anpassungen[id]
    }
    neu = { ...neu, anpassungen }
    if (!ids.some((id) => neu.entfernt.includes(id))) continue
    if (festVomBlatt(neu, zahn)) continue
    neu = {
      ...neu,
      entfernt: neu.entfernt.filter((id) => !ids.includes(id)),
      manuell: neu.manuell.flatMap((p) => {
        if (!vomBlatt(p) || !zaehneVon(p).includes(zahn)) return [p]
        const rest = ohneZahn(p, zahn)
        return rest ? [rest] : []
      }),
    }
  }
  return neu
}

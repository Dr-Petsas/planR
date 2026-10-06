import type { ZahnZeilen } from '../types'
import { implantatZaehne } from './implantat'
import { FEHLEND, KRONE_NOETIG, OBERKIEFER, TEILKRONE_NOETIG, UNTERKIEFER, VERSORGUNG_NOETIG, istWeisheitszahn } from './zahnschema'

type Kiefer = 'OK' | 'UK'

/** Welche klinischen Angaben zur aktuellen Planung passen und abgefragt werden müssen */
export interface Relevanz {
  /** TP oder R ist eingetragen; sonst wird aus Zeile B abgeschätzt */
  geplant: boolean
  /** natürliche Zähne mit Krone, Teilkrone, Teleskop oder Wurzelstiftkappe (Stiftaufbau möglich) */
  kronen: string[]
  /** Pfeiler von Brücken und Teleskopen (disparallel möglich) */
  pfeiler: string[]
  /** Kiefer mit herausnehmbarem Teil */
  prothese: Kiefer[]
  /** davon mit höchstens 3 Restzähnen – Total-/Deckprothese (Metallbasis) */
  deckprothese: Kiefer[]
  /** Kiefer ohne eigene Zähne */
  zahnlos: Kiefer[]
  implantate: string[]
}

const KRONE = /^(K|PK|T|R$)/
const GLIED = /^(B|AB)[VM]?$/
const PROTHESE = /^(E|EO|H|T|K[VM]?[HO])/

export function relevanzErmitteln(zaehne: Record<string, ZahnZeilen>): Relevanz {
  const B = (z: string) => (zaehne[z]?.B ?? '').trim().toLowerCase()
  const P = (z: string) => (zaehne[z]?.TP.trim() || zaehne[z]?.R || '').toUpperCase()
  const alle = [...OBERKIEFER, ...UNTERKIEFER]
  const geplant = alle.some((z) => P(z))
  const natuerlich = (z: string) => !!B(z) ? !FEHLEND.has(B(z)) : true
  const r: Relevanz = { geplant, kronen: [], pfeiler: [], prothese: [], deckprothese: [], zahnlos: [], implantate: implantatZaehne(zaehne) }

  for (const [kiefer, reihe] of [['OK', OBERKIEFER], ['UK', UNTERKIEFER]] as const) {
    const ohne8 = reihe.filter((z) => !istWeisheitszahn(z))
    const rest = ohne8.filter((z) => natuerlich(z) && !/^S/.test(P(z)) && B(z) !== 'x')
    const luecke = (z: string | undefined) => !!z && (geplant ? GLIED.test(P(z)) : VERSORGUNG_NOETIG.has(B(z)))

    for (const z of reihe) {
      if (!natuerlich(z)) continue
      if (geplant ? KRONE.test(P(z)) : KRONE_NOETIG.has(B(z)) || TEILKRONE_NOETIG.has(B(z))) r.kronen.push(z)
      const i = reihe.indexOf(z)
      if (luecke(reihe[i - 1]) || luecke(reihe[i + 1]) || (geplant && /^T/.test(P(z)))) r.pfeiler.push(z)
    }

    const herausnehmbar = geplant
      ? reihe.some((z) => PROTHESE.test(P(z)) || /^SE/.test(P(z)))
      : ohne8.some((z) => VERSORGUNG_NOETIG.has(B(z))) && (rest.length <= 3 || ohne8.filter((z) => VERSORGUNG_NOETIG.has(B(z))).length >= 4 || [reihe[1], reihe[14]].some((z) => VERSORGUNG_NOETIG.has(B(z))))
    if (herausnehmbar) r.prothese.push(kiefer)
    if (herausnehmbar && rest.length <= 3) r.deckprothese.push(kiefer)
    if (!rest.length && ohne8.some((z) => B(z) || P(z))) r.zahnlos.push(kiefer)
  }
  return r
}

/**
 * Öffentliche Probe: Befund, Regelversorgung, Therapieplanung und die Gebührenzeilen
 * in einen leeren HKP. Nichts davon geht ins Register.
 */
import type { Ebene, HkpPlan, Position } from './types'
import { BEFUND_KUERZEL, THERAPIE_KUERZEL, ALLE_ZAEHNE } from './engine/zahnschema'
import { befundOhneStrich, markeLesen } from './engine/bruecken'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './engine/regeln'
import { regelUebernehmen, regelversorgungPlanen } from './engine/aufwertung'
import { leererPlan } from './store/plan'

export interface ProbeSchema {
  B?: Record<string, string>
  R?: Record<string, string>
  TP?: Record<string, string>
}

export interface ProbeGebuehr {
  ebene: Ebene | 'GOÄ'
  nr: string
  zahn?: string
  anzahl?: number
  faktor?: number
  betrag?: number
}

const BEMA_AM_ZAHN = new Set(['20a', '20b', '20c', '91a', '91b', '91d', '90'])

function wert(map: Record<string, string> | undefined, zahn: string) {
  return (map?.[zahn] ?? '').trim()
}

function regelVomBlatt(plan: HkpPlan, schema: ProbeSchema): HkpPlan {
  if (!schema.R) return plan
  const zaehne = { ...plan.zaehne }
  for (const z of ALLE_ZAEHNE) {
    const roh = wert(schema.R, z)
    if (!roh) continue
    const kuerzel = markeLesen(roh).kuerzel.toUpperCase()
    if (!(kuerzel in THERAPIE_KUERZEL)) continue
    zaehne[z] = { ...zaehne[z], R: kuerzel }
  }
  return { ...plan, zaehne }
}

function gebuehrenDazu(plan: HkpPlan, liste: ProbeGebuehr[]): HkpPlan {
  const gueltig = liste.filter((p) => (p.ebene === 'GOZ' || p.ebene === 'BEL' || p.ebene === 'BEB' || p.ebene === 'BEMA') && p.nr.trim())
  const gozZaehne = new Set(gueltig.filter((p) => p.ebene === 'GOZ' && p.zahn).map((p) => p.zahn as string))
  const hatBema = plan.positionen.some((p) => p.ebene === 'BEMA')
  let positionen = plan.positionen.filter((p) => !(p.auto && p.ebene === 'BEMA' && gozZaehne.has(p.zahn) && BEMA_AM_ZAHN.has(p.nr)))
  const index = new Map(positionen.map((p, i) => [`${p.ebene}|${p.nr.toLowerCase()}|${p.zahn}`, i]))
  for (const p of gueltig) {
    if (p.ebene === 'BEMA' && hatBema) continue
    const ebene = p.ebene as Ebene
    const zahn = (p.zahn ?? '').trim()
    const nr = p.nr.trim().toLowerCase()
    const key = `${ebene}|${nr}|${zahn}`
    const vorhanden = index.get(key)
    if (vorhanden !== undefined) {
      if (ebene === 'GOZ' && p.faktor) positionen[vorhanden] = { ...positionen[vorhanden], faktor: p.faktor }
      continue
    }
    const labor = ebene === 'BEL' || ebene === 'BEB' ? (plan.einstellungen.labor === 'praxis' ? 'eigen' : 'fremd') : undefined
    const neu: Position = {
      id: `blatt-${ebene}-${nr}-${zahn}-${positionen.length}`,
      ebene, nr, zahn, anzahl: p.anzahl && p.anzahl > 0 ? p.anzahl : 1, auto: false,
      ...(ebene === 'GOZ' ? { faktor: p.faktor ?? plan.einstellungen.gozFaktor } : {}),
      ...(labor ? { labor } : {}),
      ...(p.betrag && p.betrag > 0 && (ebene === 'BEL' || ebene === 'BEB') ? { preis: p.betrag } : {}),
    }
    index.set(key, positionen.length)
    positionen = [...positionen, neu]
  }
  return { ...plan, positionen }
}

/** Zahnschema übernehmen, rechnen lassen und die Gebührenzeilen des Blatts dazulegen. Patientenfelder bleiben leer. */
export function planAusSchema(einstellungen: HkpPlan['einstellungen'], schema: ProbeSchema, gebuehren: ProbeGebuehr[] = []): { plan: HkpPlan; hinweise: string[] } {
  const zaehne = Object.fromEntries(ALLE_ZAEHNE.map((z) => {
    const befund = befundOhneStrich(wert(schema.B, z))
    const tp = markeLesen(wert(schema.TP, z))
    const kuerzel = tp.kuerzel.toUpperCase()
    const bekannt = kuerzel in THERAPIE_KUERZEL
    return [z, {
      B: befund in BEFUND_KUERZEL ? befund : '',
      R: '',
      TP: bekannt ? kuerzel : '',
      ...(bekannt && tp.bAnfang ? { bAnfang: true } : {}),
      ...(bekannt && tp.bEnde ? { bEnde: true } : {}),
    }]
  }))
  const basis: HkpPlan = { ...leererPlan(), einstellungen, zaehne, patient: leererPlan().patient }
  const hatPlanung = Object.values(zaehne).some((z) => z.TP)
  const gerechnet = hatPlanung
    ? (() => {
      const therapie = therapieAnwenden(regelversorgungErmitteln(zaehne, regelOptionen(basis)), zaehne, basis)
      return { plan: regelUebernehmen(basis, therapie, zaehne), hinweise: therapie.hinweise }
    })()
    : regelversorgungPlanen(basis)
  const plan = gebuehrenDazu(regelVomBlatt(gerechnet.plan, schema), gebuehren)
  return { plan, hinweise: gerechnet.hinweise }
}

/** Der eingebettete Planer nimmt Schema und Gebührenzeilen von der Probeseite an. */
export function probeHoren(uebernehmen: (schema: ProbeSchema, gebuehren: ProbeGebuehr[]) => void) {
  if (window.parent === window) return () => {}
  const auf = (ev: MessageEvent) => {
    if (ev.origin !== location.origin) return
    const daten = ev.data as { type?: string; schema?: ProbeSchema; positionen?: ProbeGebuehr[] } | null
    if (!daten || daten.type !== 'planr-probe' || !daten.schema) return
    uebernehmen(daten.schema, Array.isArray(daten.positionen) ? daten.positionen : [])
  }
  window.addEventListener('message', auf)
  const bereit = () => window.parent.postMessage({ type: 'planr-probe-bereit' }, location.origin)
  bereit()
  const nochmal = window.setTimeout(bereit, 600)
  return () => {
    window.clearTimeout(nochmal)
    window.removeEventListener('message', auf)
  }
}

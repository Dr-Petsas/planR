import type { Einstellungen, Plan, Position, Region, RegionOptionen } from '../types'
import { REGIONEN } from '../types'
import { implantatkoerper } from '../data/implantatkoerper'
import { materialFuerKlasse, type MaterialRolle } from '../data/material'
import {
  ENTFERNUNG_KUERZEL, IMPLANTAT_KUERZEL, SOFORT_KUERZEL,
  kieferVon, regionVon,
} from './zahnschema'

/** Sitzungs-Reihenfolge (sitzung-Feld der Positionen). */
export const SITZUNG_NAME = ['', 'Planung', 'Knochenaufbau', 'Implantation', 'Freilegung', 'Nachsorge']
export const S_PLANUNG = 1
export const S_AUFBAU = 2
export const S_IMPLANTATION = 3
export const S_FREILEGUNG = 4

export interface PlanungsErgebnis {
  positionen: Position[]
  hinweise: string[]
}

const tpVon = (plan: Plan, z: string) => (plan.zaehne[z]?.TP ?? '').trim().toUpperCase()
const bVon = (plan: Plan, z: string) => (plan.zaehne[z]?.B ?? '').trim().toLowerCase()

/** Alle Zähne mit geplantem Implantat. */
export const implantatZaehne = (plan: Plan) => Object.keys(plan.zaehne).filter((z) => IMPLANTAT_KUERZEL.has(tpVon(plan, z)))
/** Alle Zähne mit Entfernung. */
export const entfernungZaehne = (plan: Plan) => Object.keys(plan.zaehne).filter((z) => ENTFERNUNG_KUERZEL.has(tpVon(plan, z)))

/** Regionen, in denen irgendetwas geplant ist (Implantat, Entfernung, Augmentation …). */
export function geplanteRegionen(plan: Plan): Region[] {
  const aktiv = new Set<Region>()
  for (const z of Object.keys(plan.zaehne)) if (tpVon(plan, z)) aktiv.add(regionVon(z))
  for (const r of REGIONEN) {
    const o = plan.regionen[r]
    if (o && (o.augmentation || o.boneSplitting || o.sinusIntern || o.sinusExtern || o.blockEntnahme || o.ringEntnahme || o.kollektor || o.fixierung || o.eigenblut || !!o.material || (o.membran && o.membran !== 'keine') || (o.weichgewebe && o.weichgewebe !== 'keine'))) aktiv.add(r)
  }
  return REGIONEN.filter((r) => aktiv.has(r))
}

export function planen(plan: Plan, _einst: Einstellungen): PlanungsErgebnis {
  const positionen: Position[] = []
  const hinweise: string[] = []
  const klasse = plan.regler.materialKlasse

  const goz = (nr: string, zahn: string, sitzung: number, grund: string, anzahl = 1): Position =>
    ({ id: `auto:${nr}:${zahn}:${sitzung}`, ebene: 'GOZ', nr, zahn, anzahl, sitzung, grund, auto: true })
  const mat = (rolle: MaterialRolle, zahn: string, sitzung: number, anzahl = 1): Position | null => {
    const posten = materialFuerKlasse(rolle, klasse)
    if (!posten) return null
    return { id: `mat:${rolle}:${zahn}:${sitzung}`, ebene: 'MAT', nr: posten.id, zahn, anzahl, sitzung, text: `${posten.titel} – ${posten.produkt}`, material: true, auto: true, grund: posten.titel }
  }
  const push = (p: Position | null) => { if (p) positionen.push(p) }

  // ── Implantate ─────────────────────────────────────────────────────────
  const impl = implantatZaehne(plan)
  const kieferMitImplantat = new Set(impl.map(kieferVon))
  for (const k of kieferMitImplantat) {
    // Implantatbezogene Analyse/Vermessung je Kiefer
    push(goz('9000', k === 'OK' ? 'OK' : 'UK', S_PLANUNG, 'Implantatbezogene Analyse und Vermessung'))
  }
  for (const z of impl) {
    const tp = tpVon(plan, z)
    const d = plan.implantate[z] ?? { system: 'durchschnitt', deckung: 'gedeckt' as const }
    push(goz('9010', z, S_IMPLANTATION, 'Implantatinsertion'))
    // Implantatkörper + Deck-/Einheilteil als Material
    const sys = implantatkoerper(d.system ?? 'durchschnitt')
    push({ id: `mat:koerper:${z}`, ebene: 'MAT', nr: `impl:${sys.id}:koerper`, zahn: z, anzahl: 1, sitzung: S_IMPLANTATION, text: `Implantatkörper ${sys.hersteller} ${sys.system}`, material: true, auto: true, grund: 'Implantatkörper' })
    if ((d.deckung ?? 'gedeckt') === 'gedeckt') {
      push({ id: `mat:deck:${z}`, ebene: 'MAT', nr: `impl:${sys.id}:deckschraube`, zahn: z, anzahl: 1, sitzung: S_IMPLANTATION, text: `Deckschraube ${sys.hersteller}`, material: true, auto: true, grund: 'Deckschraube' })
      push(goz('9040', z, S_FREILEGUNG, 'Freilegen des Implantats'))
      push({ id: `mat:gf:${z}`, ebene: 'MAT', nr: `impl:${sys.id}:gingivaformer`, zahn: z, anzahl: 1, sitzung: S_FREILEGUNG, text: `Gingivaformer ${sys.hersteller}`, material: true, auto: true, grund: 'Gingivaformer' })
    } else {
      push({ id: `mat:gf:${z}`, ebene: 'MAT', nr: `impl:${sys.id}:gingivaformer`, zahn: z, anzahl: 1, sitzung: S_IMPLANTATION, text: `Gingivaformer ${sys.hersteller}`, material: true, auto: true, grund: 'Gingivaformer (einzeitig)' })
    }
    // Sofortimplantat: Extraktion in derselben Alveole (außer Socket-Shield)
    if (SOFORT_KUERZEL.has(tp) && tp !== 'ISS') {
      push(goz('3000', z, S_IMPLANTATION, 'Entfernung des Zahnes vor der Sofortimplantation'))
    }
    // Einmal-Bohrerset je Implantat
    push(mat('fraese', z, S_IMPLANTATION))
  }

  // ── Entfernungen (ohne Sofortimplantat) ─────────────────────────────────
  for (const z of entfernungZaehne(plan)) {
    const tp = tpVon(plan, z)
    if (tp === 'EX') push(goz('3000', z, S_AUFBAU, 'Entfernung eines Zahnes'))
    else if (tp === 'OX') push(goz('3030', z, S_AUFBAU, 'Entfernung durch Osteotomie'))
    else if (tp === 'XS') push(goz('3000', z, S_AUFBAU, 'Extraktion vor Socket Preservation'))
    // Explantation
    if (bVon(plan, z) === 'ix' || tp === 'EXP') push(goz('9170', z, S_AUFBAU, 'Entfernung des Implantats durch Osteotomie'))
  }

  // ── Regionen: Augmentation, Sinuslift, Entnahme, Membran, Weichgewebe ────
  for (const r of geplanteRegionen(plan)) {
    const o: RegionOptionen = plan.regionen[r] ?? {}
    const simultan = Object.keys(plan.zaehne).some((z) => regionVon(z) === r && IMPLANTAT_KUERZEL.has(tpVon(plan, z)))
    const opSitz = simultan ? S_IMPLANTATION : S_AUFBAU

    if (o.augmentation) push(goz('9100', r, opSitz, 'Aufbau des Alveolarfortsatzes (GBR)'))
    if (o.boneSplitting) push(goz('9130', r, opSitz, 'Bone Splitting / Spreading'))
    if (o.sinusIntern) push(goz('9110', r, opSitz, 'Interner Sinuslift (geschlossene Sinusbodenelevation)'))
    if (o.sinusExtern) push(goz('9120', r, opSitz, 'Externer Sinuslift (Knochenfensterung)'))

    // Knochenentnahme
    const block = o.blockEntnahme || o.ringEntnahme
    const fremd = o.material === 'allogen'
    if (block && !fremd) {
      // intraorale Knochenentnahme außerhalb des Aufbaugebietes
      push({ ...goz('9140', r, S_AUFBAU, o.blockEntnahme ? 'Intraorale Knochenblockentnahme' : 'Knochenringentnahme'), anzahl: o.fixierung ? 2 : 1 })
    } else if (block && fremd) {
      hinweise.push(`${r}: Block aus Fremdmaterial – GOZ 9140 (Entnahme) entfällt.`)
    }
    if (o.kollektor) {
      push(goz('9090', r, opSitz, 'Knochengewinnung mit Kollektor/Schaber'))
      push(mat('kollektor', r, opSitz))
    }
    if (o.fixierung) {
      push(goz('9150', r, S_AUFBAU, 'Fixation/Stabilisierung des Augmentates'))
      push(mat(o.blockEntnahme ? 'fixierung-schraube' : 'fixierung-pin', r, S_AUFBAU, 2))
      // bei zweizeitigem, fixiertem Block: Schraubenentfernung bei der Freilegung
      if (block) push(goz('9170', r, S_FREILEGUNG, 'Entfernung der Osteosyntheseschrauben'))
    }

    // Aufbaumaterial (KEM) nach Herkunft
    const kemRolle: Record<string, MaterialRolle | null> = { autolog: null, allogen: 'kem-allogen', xenogen: 'kem-xenogen', synthetisch: 'kem-synthetisch' }
    if (o.material && kemRolle[o.material]) push(mat(kemRolle[o.material]!, r, opSitz))

    // Membran
    if (o.membran && o.membran !== 'keine') {
      const memRolle: Record<string, MaterialRolle> = { resorbierbar: 'membran-resorbierbar', 'nicht-resorbierbar': 'membran-nichtresorbierbar', titan: 'membran-titan', vlies: 'membran-vlies' }
      push(mat(memRolle[o.membran] ?? 'membran-resorbierbar', r, opSitz))
      // GOZ 4138 nur, wenn nicht schon in 9100/9120/9130 enthalten (regelwerk prüft)
      push(goz('4138', r, opSitz, 'Verwendung einer Membran'))
    }

    // Weichgewebe / plastische Deckung
    const wg = o.weichgewebe
    if (wg && wg !== 'keine') {
      const wgSitz = plan.implantate && simultan ? S_FREILEGUNG : opSitz
      if (wg === 'rolllappen') push(goz('3100', r, wgSitz, 'Plastische Deckung (Rolllappen)'))
      else if (wg === 'fst') { push(goz('4130', r, wgSitz, 'Gewinnung/Transplantation von Schleimhaut')); push(mat('naht', r, wgSitz, 2)) }
      else if (wg === 'btt') push(goz('4133', r, wgSitz, 'Gewinnung/Transplantation von Bindegewebe'))
      else if (wg === 'vestibulumplastik') push(goz('3240', r, wgSitz, 'Vestibulumplastik kleineren Umfangs'))
      else if (wg === 'tuberplastik') push({ id: `auto:goae2675:${r}`, ebene: 'GOAE', nr: '2675', zahn: r, anzahl: 1, sitzung: wgSitz, grund: 'Tuberplastik (GOÄ 2675)', auto: true })
    }
  }

  return { positionen, hinweise }
}

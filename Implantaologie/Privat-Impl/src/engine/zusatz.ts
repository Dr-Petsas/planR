import type { Einstellungen, Plan, Position } from '../types'
import { REGIONEN } from '../types'
import { ANALOG_KATALOG, type AnalogLeistung } from '../data/analog-katalog'
import { LASER_ZUSCHLAG, MIKROSKOP_ZUSCHLAG, OP_ZUSCHLAG_STUFE } from '../data/goz-sonderregeln'
import { materialFuerKlasse, materialPreis } from '../data/material'
import { standardProtokoll } from '../data/blutprotokolle'
import { analogPosition, analogWaehlen } from './analog'
import { gozEinzel } from './listen'
import { implantatZaehne } from './planung'
import { regionVon } from './zahnschema'

export const BEGLEIT_STUFEN = [
  { titel: 'keine' },
  { titel: 'Modelle/Planung' },
  { titel: '+ Nachsorge' },
  { titel: '+ Mikroskop' },
  { titel: '+ Laser' },
]
export const BEGLEIT_MAX = 4

export const ANALOG_STUFEN = [
  { titel: 'keine' },
  { titel: 'digitale Planung' },
  { titel: '+ Qualitätssicherung' },
  { titel: '+ Sicherheit/Komfort' },
  { titel: '+ Biologisierung' },
  { titel: '+ regenerative Exoten' },
]
export const ANALOG_MAX = 5

export const ANALOGBEWERTUNG_STUFEN = [
  { titel: 'niedrige Kammer-Ziffer' },
  { titel: 'höchste Kammer-Ziffer' },
  { titel: 'Praxiskalkulation' },
]
export const ANALOGBEWERTUNG_MAX = 2

export const MATERIALKLASSE_STUFEN = [
  { titel: 'Standard' }, { titel: 'Markenprodukt' }, { titel: 'Premium' }, { titel: 'High-End' },
]
export const MATERIALKLASSE_MAX = 3

export const SCHABLONE_STUFEN = [
  { titel: 'keine' }, { titel: 'Orientierungsschablone' }, { titel: '+ Messschablone' }, { titel: '3D-Navigation' },
]
export const SCHABLONE_MAX = 3

export const LABOR_AUFSCHLAG_MIN = -20
export const LABOR_AUFSCHLAG_MAX = 50

export interface ZusatzErgebnis {
  positionen: Position[]
  nichtAngesetzt: string[]
}

/** Echte OP-Sitzungen (mit chirurgischer Leistung, nicht die reine Planung). */
const opSitzungen = (basis: Position[]) => {
  const chirurgisch = new Set(Object.keys(OP_ZUSCHLAG_STUFE))
  return [...new Set(basis.filter((p) => p.ebene === 'GOZ' && p.sitzung && chirurgisch.has(p.nr)).map((p) => p.sitzung!))].sort((a, b) => a - b)
}

export function zusatzleistungen(plan: Plan, basis: Position[], einst: Einstellungen): ZusatzErgebnis {
  const positionen: Position[] = []
  const nichtAngesetzt: string[] = []
  const r = plan.regler
  const klasse = r.materialKlasse
  const effGoz = r.gozFaktor > 0 ? r.gozFaktor : einst.gozFaktor
  const effGoae = r.goaeFaktor > 0 ? r.goaeFaktor : einst.goaeFaktor
  const impl = implantatZaehne(plan)
  const sitzungen = opSitzungen(basis)

  // ── Begleitleistungen (Stufe 0–4) ──────────────────────────────────────
  if (r.begleitStufe >= 1 && impl.length) {
    positionen.push({ id: 'zus:0060', ebene: 'GOZ', nr: '0060', zahn: '', anzahl: 1, sitzung: 1, grund: 'Situationsmodelle/Planung', zusatz: 'begleit', auto: true })
  }
  if (r.begleitStufe >= 2) {
    for (const s of sitzungen) {
      positionen.push({ id: `zus:3290:${s}`, ebene: 'GOZ', nr: '3290', zahn: '', anzahl: 1, sitzung: s, grund: 'Kontrolle nach chirurgischem Eingriff', zusatz: 'begleit', auto: true })
      positionen.push({ id: `zus:3300:${s}`, ebene: 'GOZ', nr: '3300', zahn: '', anzahl: 2, sitzung: s, grund: 'Nachbehandlung nach chirurgischem Eingriff', zusatz: 'begleit', auto: true })
    }
  }
  // Mikroskop (Stufe 3) – je Sitzung einmal, Einfachsatz, nur zu zuschlagsfähigen Leistungen
  if (r.begleitStufe >= 3) zuschlagProSitzung(positionen, basis, sitzungen, '0110', MIKROSKOP_ZUSCHLAG.nummern, Infinity, 'Operationsmikroskop')
  // Laser (Stufe 4) – je Sitzung einmal, Einfachsatz, höchstens 68 €
  if (r.begleitStufe >= 4) zuschlagProSitzung(positionen, basis, sitzungen, '0120', LASER_ZUSCHLAG.nummern, LASER_ZUSCHLAG.hoechstbetrag, 'Laseranwendung')

  // ── Schablone (Stufe 0–3) ──────────────────────────────────────────────
  if (r.schabloneStufe >= 1 && impl.length) {
    const nav = r.schabloneStufe >= 3
    positionen.push({ id: 'zus:schablone-goz', ebene: 'GOZ', nr: nav ? '9005' : '9003', zahn: '', anzahl: 1, sitzung: 1, grund: nav ? '3D-Navigationsschablone' : 'Orientierungsschablone', zusatz: 'begleit', auto: true })
    const laborPreis = nav ? 280 : r.schabloneStufe >= 2 ? 180 : 150
    positionen.push({ id: 'zus:schablone-labor', ebene: 'MAT', nr: 'schablone', zahn: '', anzahl: 1, sitzung: 1, preis: laborPreis, text: nav ? 'Navigationsbohrschablone (CAD/CAM, Labor)' : 'Bohrschablone (Labor)', material: true, zusatz: 'begleit', auto: true, grund: 'Bohrschablone' })
  }

  // ── Analog-/Exotenleistungen (Stufe 0–5) ───────────────────────────────
  const regionenMitAugmentation = REGIONEN.filter((reg) => {
    const o = plan.regionen[reg]
    return o && (o.augmentation || o.boneSplitting || o.sinusIntern || o.sinusExtern)
  })
  const eigenblutRegionen = REGIONEN.filter((reg) => plan.regionen[reg]?.eigenblut)

  const bewOpt = { bewertung: r.analogBewertung, gozFaktor: effGoz, goaeFaktor: effGoae, stundensatz: einst.stundensatz, materialEinkalkulieren: einst.materialAnalog }
  const anbieten = (leistung: AnalogLeistung, zahn: string, idSuffix: string, sitzung: number, materialBetrag = 0) => {
    const wahl = analogWaehlen(leistung, { ...bewOpt, materialBetrag })
    positionen.push(analogPosition(`zus:analog:${leistung.id}:${idSuffix}`, zahn, sitzung, leistung, wahl))
  }

  for (const leistung of ANALOG_KATALOG) {
    if (leistung.stufe > r.analogStufe) continue
    switch (leistung.bedarf) {
      case 'planung':
        if (impl.length) anbieten(leistung, '', 'fall', 1)
        else nichtAngesetzt.push(`${leistung.titel}: keine Implantatplanung vorhanden.`)
        break
      case 'insertion':
        if (impl.length) impl.forEach((z) => anbieten(leistung, z, z, 3))
        else nichtAngesetzt.push(`${leistung.titel}: keine Implantation geplant.`)
        break
      case 'freilegung': {
        const gedeckt = impl.filter((z) => (plan.implantate[z]?.deckung ?? 'gedeckt') === 'gedeckt')
        if (gedeckt.length) gedeckt.forEach((z) => anbieten(leistung, z, z, 4))
        else nichtAngesetzt.push(`${leistung.titel}: keine zweizeitige Freilegung geplant.`)
        break
      }
      case 'augmentation':
        if (regionenMitAugmentation.length) regionenMitAugmentation.forEach((reg) => anbieten(leistung, reg, reg, 3))
        else nichtAngesetzt.push(`${leistung.titel}: keine Augmentation geplant.`)
        break
      case 'extraktion':
        // Socket Preservation nur bei XS-Zahn mit KEM, Socket Shield nur bei ISS
        if (leistung.id === 'socket-shield') {
          const shields = Object.keys(plan.zaehne).filter((z) => (plan.zaehne[z]?.TP ?? '').trim().toUpperCase() === 'ISS')
          if (shields.length) shields.forEach((z) => anbieten(leistung, z, z, 3))
          else nichtAngesetzt.push(`${leistung.titel}: kein Socket-Shield (ISS) geplant.`)
        } else {
          const sp = Object.keys(plan.zaehne).filter((z) => (plan.zaehne[z]?.TP ?? '').trim().toUpperCase() === 'XS')
          if (sp.length) {
            sp.forEach((z) => {
              const o = plan.regionen[regionVon(z)]
              const kem = o?.material && o.material !== 'autolog' ? materialFuerKlasse(o.material === 'allogen' ? 'kem-allogen' : o.material === 'synthetisch' ? 'kem-synthetisch' : 'kem-xenogen', klasse) : undefined
              anbieten(leistung, z, z, 2, kem ? materialPreis(kem, einst.materialPreise) : 0)
            })
          } else nichtAngesetzt.push(`${leistung.titel}: keine Socket Preservation (XS) geplant.`)
        }
        break
      case 'sedierung':
        if ((leistung.id === 'lachgas' && plan.global.sedierung === 'lachgas') || (leistung.id === 'pulsoxymetrie' && (plan.global.sedierung === 'lachgas' || plan.global.sedierung === 'analgosedierung'))) {
          anbieten(leistung, '', 'sed', 3)
        } else nichtAngesetzt.push(`${leistung.titel}: Sedierung nicht gewählt.`)
        break
      case 'antikoagulation':
        if (plan.global.risiko) anbieten(leistung, '', 'risk', 3)
        else nichtAngesetzt.push(`${leistung.titel}: kein Risikopatient markiert.`)
        break
      case 'eigenblut':
        if (plan.global.blut !== 'keine' && (eigenblutRegionen.length || regionenMitAugmentation.length)) {
          const regs = eigenblutRegionen.length ? eigenblutRegionen : regionenMitAugmentation
          regs.forEach((reg) => anbieten(leistung, reg, reg, 3))
        } else nichtAngesetzt.push(`${leistung.titel}: kein Eigenblut gewählt.`)
        break
      case 'immer':
        if (impl.length || regionenMitAugmentation.length) anbieten(leistung, '', 'fall', 3)
        else nichtAngesetzt.push(`${leistung.titel}: keine Grundlage im Plan.`)
        break
    }
  }

  // ── Eigenblut: GOÄ 250 je Sitzung + Röhrchen/Kits + Produkt ─────────────
  if (plan.global.blut !== 'keine') {
    const protokoll = standardProtokoll(plan.global.blut)
    const blutSitzungen = sitzungen.length ? sitzungen : [3]
    for (const s of blutSitzungen) {
      positionen.push({ id: `zus:goae250:${s}`, ebene: 'GOAE', nr: '250', zahn: '', anzahl: 1, sitzung: s, grund: 'Blutentnahme für Eigenblutaufbereitung', zusatz: 'begleit', auto: true })
    }
    const anzahlRoehrchen = plan.global.roehrchen > 0 ? plan.global.roehrchen : protokoll.roehrchenProSitzung * blutSitzungen.length
    positionen.push({ id: 'zus:blut-material', ebene: 'MAT', nr: protokoll.materialId, zahn: '', anzahl: anzahlRoehrchen, sitzung: 3, text: `${protokoll.roehrchen}`, material: true, zusatz: 'begleit', auto: true, grund: 'Blutröhrchen/Kit' })
  }

  return { positionen, nichtAngesetzt }
}

/** Zuschlag (0110/0120) je Sitzung einmal, Einfachsatz, optional gedeckelt. */
function zuschlagProSitzung(ziel: Position[], basis: Position[], sitzungen: number[], nr: string, nummern: readonly string[], cap: number, grund: string) {
  const erlaubt = new Set(nummern)
  for (const s of sitzungen) {
    const inSitzung = basis.filter((p) => p.sitzung === s && p.ebene === 'GOZ' && erlaubt.has(p.nr))
    if (!inSitzung.length) continue
    // Einfachsatz der höchstbewerteten zuschlagsfähigen Leistung
    const hoechsterEinfachsatz = Math.max(...inSitzung.map((p) => gozEinzel(p.nr, 1)))
    const betrag = nr === '0110' ? gozEinzel('0110', 1) : Math.min(cap, hoechsterEinfachsatz)
    ziel.push({ id: `zus:${nr}:${s}`, ebene: 'GOZ', nr, zahn: '', anzahl: 1, sitzung: s, faktor: 1, preis: betrag, grund, zusatz: 'begleit', auto: true })
  }
}

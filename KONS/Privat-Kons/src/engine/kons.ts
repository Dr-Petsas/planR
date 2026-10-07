// Rechnung der privaten Kons nach GOZ – ohne Kassenanteil.
//
// Je Zahn: Grundleistung der Therapie + Zusatzleistungen (Chips). Zusatzleistungen
// je Kieferhälfte, Kiefer, Behandlungstag oder Plan werden über alle Zähne
// zusammengefasst (Kofferdam einmal je Kieferhälfte und Sitzung, Mikroskop-
// Zuschlag einmal je Behandlungstag usw.).

import { KLASSE_FAKTOR, THERAPIE, ZUSATZ, ZUSAETZE, type Zusatz } from '../data/katalog'
import type { Einstellungen, Plan, Rechnung, Region, ZahnErgebnis, ZahnLeistung, Zeile } from '../types'
import {
  GOAE, GOAE_FAKTOR_TECHNIK, GOAE_PUNKTWERT, GOZ_HOECHSTSATZ, GOZ_PUNKTWERT, GOZ_SCHWELLE,
  LASER_HOECHSTBETRAG, gozEinfach, gozPunkte, gozText, runden,
} from './listen'
import { ALLE_ZAEHNE, kieferVon, regionVon } from './zahnschema'

export const euro = (x: number) =>
  x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const faktorText = (f: number) => f.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 })

const flaechenWort = (n: number) => ['', 'einflächig', 'zweiflächig', 'dreiflächig', 'vierflächig', 'fünfflächig'][n] ?? `${n}-flächig`
const fuellungNr = (f: number) => (f <= 1 ? '2060' : f === 2 ? '2080' : f === 3 ? '2100' : '2120')
const einlageNr = (f: number) => (f <= 1 ? '2150' : f === 2 ? '2160' : '2170')

/** Standardwerte, wenn ein Feld (noch) nicht gesetzt ist. */
export const kanaele = (z: ZahnLeistung) => Math.max(1, z.kanaele ?? 1)
export const sitzungen = (z: ZahnLeistung) =>
  Math.max(1, z.sitzungen ?? (z.therapie === 'endo' || z.therapie === 'revision' || z.therapie === 'inlay' || z.therapie === 'bleaching' ? 2 : 1))
const flaechen = (z: ZahnLeistung) => Math.max(1, z.flaechen ?? 2)

function gozZeile(nr: string, faktor: number, anzahl: number, text?: string): Zeile {
  const einzel = runden(gozPunkte(nr) * GOZ_PUNKTWERT * faktor)
  return { ebene: 'GOZ', nr, text: text ?? gozText(nr), anzahl, faktor, einzel, summe: runden(einzel * anzahl) }
}

function analogZeile(bezug: string, faktor: number, anzahl: number, titel: string): Zeile {
  const einzel = runden(gozPunkte(bezug) * GOZ_PUNKTWERT * faktor)
  return {
    ebene: 'ANALOG', nr: `${bezug}a`, text: `${titel}, analog § 6 Abs. 1 GOZ entsprechend GOZ ${bezug}`,
    anzahl, faktor, einzel, summe: runden(einzel * anzahl),
  }
}

function preisZeile(ebene: 'MAT' | 'LABOR', nr: string, text: string, preis: number, anzahl: number): Zeile {
  const einzel = runden(preis)
  return { ebene, nr, text, anzahl, einzel, summe: runden(einzel * anzahl) }
}

/** Zuschlag für den Laser: 100 % des einfachen Satzes der Grundleistung 2410, höchstens 68 €. */
export const laserZuschlag = () => Math.min(LASER_HOECHSTBETRAG, gozEinfach('2410'))

/** Grundleistungen, neben denen der Mikroskop-Zuschlag 0110 stehen darf. */
function mikroskopFaehig(z: ZahnLeistung) {
  if (z.therapie === 'endo' || z.therapie === 'revision') return true
  if (z.therapie === 'vital') return (z.vitalArt ?? 'indirekt') !== 'pulpotomie'
  if (z.therapie === 'aufbau') return !!z.aufbauStift
  return false
}

/** Darf diese Zusatzleistung an diesem Zahn überhaupt erscheinen? */
function verfuegbar(zu: Zusatz, z: ZahnLeistung, plan: Plan): boolean {
  if (!zu.therapien.includes(z.therapie)) return false
  const neben = plan.vereinbarung === 'gkvZusatz' && THERAPIE[z.therapie].kasse === 'bema'
  if (neben ? !zu.neben : zu.nurNeben) return false
  if (zu.id === 'nekrose') return z.therapie === 'endo' && z.vital === false
  if (zu.id === 'mikroskop') return mikroskopFaehig(z)
  if (zu.id === 'mehrschicht') return !z.aufbauStift
  if ((zu.id === 'einlage' || zu.id === 'verschluss') && anzahlFuer(zu, z) === 0) return false
  return true
}

/** Wird sie ab der eingestellten Stufe von selbst vorgeschlagen? */
function vorgeschlagen(zu: Zusatz, z: ZahnLeistung, plan: Plan) {
  if (!zu.auto || plan.regler.stufe < zu.stufe) return false
  if (zu.id === 'anaesthesie' && z.therapie === 'endo') return z.vital !== false
  return true
}

export interface ZusatzStand { zusatz: Zusatz; aktiv: boolean; vorschlag: boolean }

export function zusaetzeFuer(z: ZahnLeistung, plan: Plan): ZusatzStand[] {
  if (plan.vereinbarung === 'gkvZusatz' && THERAPIE[z.therapie].kasse === 'mkv') return []
  return ZUSAETZE.filter((zu) => verfuegbar(zu, z, plan)).map((zu) => {
    const vorschlag = vorgeschlagen(zu, z, plan)
    const aktiv = !!z.zusatz?.includes(zu.id) || (vorschlag && !z.abgewaehlt?.includes(zu.id))
    return { zusatz: zu, aktiv, vorschlag }
  })
}

/** Neuer Zahnzustand nach einem Klick auf einen Zusatz-Chip. */
export function zusatzUmschalten(z: ZahnLeistung, stand: ZusatzStand): ZahnLeistung {
  const id = stand.zusatz.id
  const zusatz = (z.zusatz ?? []).filter((x) => x !== id)
  const abgewaehlt = (z.abgewaehlt ?? []).filter((x) => x !== id)
  if (stand.aktiv) {
    if (stand.vorschlag) abgewaehlt.push(id)
  } else if (!stand.vorschlag) zusatz.push(id)
  return { ...z, zusatz, abgewaehlt }
}

function anzahlFuer(zu: Zusatz, z: ZahnLeistung): number {
  const je = zu.anzahl ?? 1
  switch (zu.menge) {
    case 'kanal': return kanaele(z) * je
    case 'sitzung': return sitzungen(z) * je
    case 'zwischen': return (z.therapie === 'bleaching' ? sitzungen(z) : sitzungen(z) - 1) * je
    default: return je
  }
}

function zusatzZeile(zu: Zusatz, anzahl: number, faktor: number, einst: Einstellungen, klasse: number): Zeile {
  switch (zu.ebene) {
    case 'GOZ': return gozZeile(zu.nr, faktor, anzahl)
    case 'ANALOG': return analogZeile(zu.nr, faktor, anzahl, zu.titel)
    case 'GOAE': {
      const e = GOAE[zu.nr]
      const einzel = runden(e.punkte * GOAE_PUNKTWERT * GOAE_FAKTOR_TECHNIK)
      return { ebene: 'GOAE', nr: `Ä${zu.nr}`, text: `${e.text} (GOÄ)`, anzahl, faktor: GOAE_FAKTOR_TECHNIK, einzel, summe: runden(einzel * anzahl) }
    }
    case 'MAT': {
      const m = einst.materialPreise.find((x) => x.id === zu.nr)
      return preisZeile('MAT', 'Mat.', m?.name ?? zu.titel, (m?.preis ?? 0) * (KLASSE_FAKTOR[klasse] ?? 1), anzahl)
    }
    case 'ZUSCHLAG': {
      const einzel = zu.nr === '0120' ? laserZuschlag() : gozEinfach(zu.nr)
      const text = zu.nr === '0120'
        ? 'Zuschlag für die Anwendung eines Lasers (100 % des einfachen Satzes von GOZ 2410, höchstens 68 €), je Behandlungstag'
        : 'Zuschlag für die Anwendung eines Operationsmikroskops, einfacher Satz, je Behandlungstag'
      return { ebene: 'ZUSCHLAG', nr: zu.nr, text, anzahl, faktor: 1, einzel, summe: runden(einzel * anzahl) }
    }
  }
}

function grundleistung(z: ZahnLeistung, faktor: number, einst: Einstellungen, klasse: number, mehrschicht: boolean): { titel: string; zeilen: Zeile[] } {
  const f = flaechen(z)
  const k = kanaele(z)
  const kl = KLASSE_FAKTOR[klasse] ?? 1
  switch (z.therapie) {
    case 'komposit':
      return { titel: `Kompositfüllung, ${flaechenWort(Math.min(4, f))}`, zeilen: [gozZeile(fuellungNr(f), faktor, 1)] }
    case 'inlay': {
      const lab = einst.laborPreise.find((l) => l.id === (z.labor ?? 'keramik'))
      const zeilen = [gozZeile(einlageNr(f), faktor, 1)]
      if (lab?.id !== 'gold') zeilen.push(gozZeile('2197', faktor, 1))
      if (lab) zeilen.push(preisZeile('LABOR', 'Labor', lab.name, lab.preis * kl, 1))
      return { titel: `Einlagefüllung, ${flaechenWort(Math.min(3, f))}`, zeilen }
    }
    case 'goldhaemmer':
      return { titel: `Goldhämmerfüllung, ${flaechenWort(Math.min(3, f))}`, zeilen: [analogZeile(einlageNr(f), faktor, 1, `Goldhämmerfüllung, ${flaechenWort(Math.min(3, f))}`)] }
    case 'endo':
      return {
        titel: `Wurzelkanalbehandlung, ${k} Kanal${k === 1 ? '' : 'e'}, ${z.vital === false ? 'avital' : 'vital'}`,
        zeilen: [
          z.vital === false ? gozZeile('2390', faktor, 1) : gozZeile('2360', faktor, k),
          gozZeile('2410', faktor, k),
          gozZeile('2440', faktor, k),
        ],
      }
    case 'revision':
      return { titel: `Revision, ${k} Kanal${k === 1 ? '' : 'e'}`, zeilen: [gozZeile('2410', faktor, k), gozZeile('2440', faktor, k)] }
    case 'vital': {
      const art = z.vitalArt ?? 'indirekt'
      const nr = art === 'indirekt' ? '2330' : art === 'direkt' ? '2340' : '2350'
      const titel = art === 'indirekt' ? 'Indirekte Überkappung' : art === 'direkt' ? 'Direkte Überkappung' : 'Pulpotomie'
      return { titel, zeilen: [gozZeile(nr, faktor, 1)] }
    }
    case 'versiegelung':
      return { titel: 'Fissurenversiegelung', zeilen: [gozZeile('2000', faktor, 1)] }
    case 'aufbau': {
      if (z.aufbauStift) {
        const stift = einst.materialPreise.find((m) => m.id === 'glasfaser')
        return {
          titel: 'Aufbau mit Glasfaserstift',
          zeilen: [gozZeile('2195', faktor, 1), gozZeile('2197', faktor, 1), preisZeile('MAT', 'Mat.', stift?.name ?? 'Glasfaserstift', (stift?.preis ?? 0) * kl, 1)],
        }
      }
      return { titel: mehrschicht ? 'Mehrschichtiger Kompositaufbau' : 'Plastischer Aufbau', zeilen: [...(mehrschicht ? [] : [gozZeile('2180', faktor, 1)]), gozZeile('2197', faktor, 1)] }
    }
    case 'infiltration':
      return { titel: 'Kariesinfiltration', zeilen: [analogZeile('2060', faktor, 1, 'Kariesinfiltration')] }
    case 'veneer':
      return { titel: 'Direktes Kompositveneer', zeilen: [analogZeile('2120', faktor, 1, 'Direktes Kompositveneer')] }
    case 'bleaching':
      return { titel: `Internes Bleichen, ${sitzungen(z)} Sitzung${sitzungen(z) === 1 ? '' : 'en'}`, zeilen: [analogZeile('2360', faktor, sitzungen(z), 'Internes Bleichen eines devitalen Zahnes, je Sitzung')] }
  }
}

const ZAHNWEISE = new Set(['zahn', 'kanal', 'sitzung', 'zwischen'])

export function zahnRechnen(zahn: string, z: ZahnLeistung, plan: Plan, einst: Einstellungen): ZahnErgebnis {
  const t = THERAPIE[z.therapie]
  const hinweise: string[] = []
  const warnungen: string[] = []
  if (plan.vereinbarung === 'gkvZusatz' && t.kasse === 'mkv') {
    return {
      zahn, titel: t.titel, zeilen: [], summe: 0, hinweise, warnungen,
      ausgeschlossen: 'Füllung beim Kassenpatienten: die Mehrkosten rechnet der Füllungs-MKV-Planer (§ 28 Abs. 2 SGB V).',
    }
  }
  const faktor = z.faktor ?? plan.regler.faktor
  const chips = zusaetzeFuer(z, plan).filter((c) => c.aktiv)
  const mehrschicht = chips.some((c) => c.zusatz.id === 'mehrschicht')
  const g = grundleistung(z, faktor, einst, plan.regler.materialKlasse, mehrschicht)
  const neben = plan.vereinbarung === 'gkvZusatz' && t.kasse === 'bema'
  const zeilen = neben ? [] : g.zeilen
  for (const c of chips) {
    if (!ZAHNWEISE.has(c.zusatz.menge)) continue
    const n = anzahlFuer(c.zusatz, z)
    if (n > 0) zeilen.push({ ...zusatzZeile(c.zusatz, n, faktor, einst, plan.regler.materialKlasse), zusatz: c.zusatz.id })
  }
  for (const x of zeilen) x.zahn = zahn

  if (neben) hinweise.push('Grundleistung rechnet die Kasse nach BEMA ab; hier stehen nur die privat vereinbarten Zusatzleistungen.')
  if (faktor > GOZ_HOECHSTSATZ) hinweise.push(`Faktor ${faktorText(faktor)} über 3,5: Vereinbarung nach § 2 Abs. 1 und 2 GOZ nötig.`)
  else if (faktor > GOZ_SCHWELLE) hinweise.push(`Faktor ${faktorText(faktor)} über 2,3: Begründung auf der Rechnung (§ 10 Abs. 3 GOZ).`)
  if (z.therapie === 'vital' && z.vitalArt === 'pulpotomie') hinweise.push('Neben der Pulpotomie (2350) ist der Mikroskop-Zuschlag 0110 nicht berechnungsfähig.')
  if (z.therapie === 'versiegelung' && plan.vereinbarung !== 'pkv') hinweise.push('Bei 6- bis 17-Jährigen ist die Versiegelung der Molaren Kassenleistung (BEMA IP 5).')

  return { zahn, titel: g.titel, zeilen, summe: runden(zeilen.reduce((s, x) => s + x.summe, 0)), hinweise, warnungen }
}

export function behandlungstageAuto(plan: Plan) {
  return Math.max(1, ...Object.values(plan.zaehne).map(sitzungen))
}

export function rechnen(plan: Plan, einst: Einstellungen): Rechnung {
  const zaehneIds = ALLE_ZAEHNE.filter((z) => plan.zaehne[z])
  const zaehne = zaehneIds.map((z) => zahnRechnen(z, plan.zaehne[z], plan, einst))
  const tage = plan.behandlungstage > 0 ? plan.behandlungstage : behandlungstageAuto(plan)
  const faktor = plan.regler.faktor

  const regionen = new Map<string, Set<Region>>()
  const regionSitzung = new Map<string, Map<Region, number>>()
  const kiefer = new Map<string, Set<string>>()
  const einmal = new Map<string, number>() // Zusatz -> höchste Sitzungszahl der auslösenden Zähne
  for (const id of zaehneIds) {
    const z = plan.zaehne[id]
    if (zaehne.find((e) => e.zahn === id)?.ausgeschlossen) continue
    for (const c of zusaetzeFuer(z, plan)) {
      if (!c.aktiv) continue
      const zu = c.zusatz
      if (zu.menge === 'region') regionen.set(zu.id, (regionen.get(zu.id) ?? new Set()).add(regionVon(id)))
      if (zu.menge === 'regionSitzung') {
        const m = regionSitzung.get(zu.id) ?? new Map<Region, number>()
        m.set(regionVon(id), Math.max(m.get(regionVon(id)) ?? 0, sitzungen(z)))
        regionSitzung.set(zu.id, m)
      }
      if (zu.menge === 'kiefer') kiefer.set(zu.id, (kiefer.get(zu.id) ?? new Set()).add(kieferVon(id)))
      if (zu.menge === 'tag' || zu.menge === 'plan') einmal.set(zu.id, Math.max(einmal.get(zu.id) ?? 0, sitzungen(z)))
    }
  }

  const begleit: Zeile[] = []
  const neu = (id: string, anzahl: number, zusatz: string) => {
    if (anzahl > 0) begleit.push({ ...zusatzZeile(ZUSATZ[id], anzahl, faktor, einst, plan.regler.materialKlasse), zusatz })
  }
  for (const zu of ZUSAETZE) {
    if (regionSitzung.has(zu.id)) neu(zu.id, [...regionSitzung.get(zu.id)!.values()].reduce((s, n) => s + n, 0), zu.id)
    if (regionen.has(zu.id)) neu(zu.id, regionen.get(zu.id)!.size, zu.id)
    if (kiefer.has(zu.id)) neu(zu.id, kiefer.get(zu.id)!.size, zu.id)
    if (einmal.has(zu.id)) neu(zu.id, zu.menge === 'tag' ? (plan.behandlungstage > 0 ? tage : einmal.get(zu.id)!) : 1, zu.id)
  }

  const frei: Zeile[] = plan.frei
    .filter((p) => gozPunkte(p.nr) > 0)
    .map((p) => ({ ...gozZeile(p.nr, p.faktor, p.anzahl), zahn: p.zahn, zusatz: p.key }))

  const alle = [...zaehne.flatMap((z) => z.zeilen), ...begleit, ...frei]
  const summe = runden(alle.reduce((s, x) => s + x.summe, 0))
  const vereinbarung2 = alle.filter((x) => (x.ebene === 'GOZ' || x.ebene === 'ANALOG') && (x.faktor ?? 0) > GOZ_HOECHSTSATZ)

  const hinweise: string[] = []
  if (alle.some((x) => x.ebene === 'ANALOG')) {
    hinweise.push('Analogleistungen nach § 6 Abs. 1 GOZ: die Bezugsziffer ist ein Vorschlag (BZÄK-Analogkatalog) und kann von der Praxis anders gewählt werden.')
  }
  if (begleit.some((x) => x.ebene === 'ZUSCHLAG')) hinweise.push('Zuschläge 0110/0120 einmal je Behandlungstag, einfacher Satz.')
  if (zaehne.some((z) => z.ausgeschlossen)) hinweise.push('Füllungen bei Kassenpatienten gehören in den Füllungs-MKV-Planer – sie sind hier nicht berechnet.')

  return { zaehne, begleit, frei, summe, vereinbarung2, hinweise }
}

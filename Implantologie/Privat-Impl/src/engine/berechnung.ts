import type { Anpassung, Einstellungen, Plan, Position } from '../types'
import { planen } from './planung'
import { regelwerkAnwenden } from './regelwerk'
import { sitzungenErgaenzen } from './sitzungen'
import { zusatzleistungen, LABOR_AUFSCHLAG_MAX, LABOR_AUFSCHLAG_MIN } from './zusatz'
import { standardBegruendung } from './begruendung'
import {
  GOAE, GOZ, GOZ_HOECHSTSATZ, GOZ_SCHWELLE, GOZ_VEREINBARUNG_MAX,
  goaeEinzel, goaeRahmen, gozEinzel, runden,
} from './listen'
import { implantatkoerper, type Teil } from '../data/implantatkoerper'
import { materialFinden } from '../data/material'

export { GOZ, GOAE, GOZ_SCHWELLE, GOZ_HOECHSTSATZ }

export interface Zeile extends Position {
  text: string
  einzel: number
  betrag: number
  punkte?: number
}

export interface Kalkulation {
  honorarGoz: Zeile[]
  honorarGoae: Zeile[]
  material: Zeile[]
  labor: Zeile[]
  summeGoz: number
  summeGoae: number
  summeMaterialNetto: number
  summeLaborNetto: number
  mwst: number
  gesamt: number
  hinweise: string[]
  nichtAngesetzt: string[]
}

export const euro = (x: number) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

const key = (p: Position) => `${p.ebene}|${p.nr}|${p.zahn}`

/** Alle Positionen (Planung → Regelwerk → Sitzungen → Regler) zusammenführen. */
export function positionen(plan: Plan, einst: Einstellungen): { positionen: Position[]; hinweise: string[]; nichtAngesetzt: string[] } {
  const basis = planen(plan, einst)
  const nachRegel = regelwerkAnwenden(basis.positionen)
  const nachSitzung = sitzungenErgaenzen(plan, nachRegel.positionen, einst)
  const zusatz = zusatzleistungen(plan, nachSitzung.positionen, einst)
  // Regler-Zusätze ebenfalls durchs Regelwerk (z. B. 9050 neben 9010/9040)
  const alleAuto = regelwerkAnwenden([...nachSitzung.positionen, ...zusatz.positionen])

  const entfernt = new Set(plan.entfernt)
  const aus = new Set(plan.regler.aus)
  const sichtbar = alleAuto.positionen.filter((p) => !entfernt.has(p.id) && !aus.has(key(p)))
  const angepasst = sichtbar.map((p) => ({ ...p, ...(plan.anpassungen[p.id] as Anpassung | undefined) }))

  return {
    positionen: [...angepasst, ...plan.manuell],
    hinweise: [...basis.hinweise, ...nachRegel.hinweise, ...nachSitzung.hinweise, ...alleAuto.hinweise],
    nichtAngesetzt: zusatz.nichtAngesetzt,
  }
}

/** Vergleichsbasis ohne Reglerwirkung (für die Differenzen in der Kostenleiste). */
export const ohneRegler = (plan: Plan): Plan => ({
  ...plan,
  regler: { ...plan.regler, begleitStufe: 0, analogStufe: 0, analogBewertung: 0, gozFaktor: 0, goaeFaktor: 0, schabloneStufe: 0, laborAufschlag: 0, aus: [] },
})

/** Netto-EK eines Material-Postens auflösen (Katalog, Implantatteil oder fester Preis). */
function materialEinzel(p: Position, einst: Einstellungen): number {
  if (p.preis !== undefined) return runden(p.preis)
  if (p.nr.startsWith('impl:')) {
    const [, sysId, teil] = p.nr.split(':')
    return runden(implantatkoerper(sysId).preise[teil as Teil] ?? 0)
  }
  const posten = materialFinden(p.nr)
  if (posten) return runden(einst.materialPreise[posten.id] ?? posten.preis)
  return 0
}

export function kalkulieren(plan: Plan, einst: Einstellungen): Kalkulation {
  const { positionen: alle, hinweise, nichtAngesetzt } = positionen(plan, einst)
  const r = plan.regler
  const stdGoz = r.gozFaktor > 0 ? r.gozFaktor : einst.gozFaktor
  const stdGoae = r.goaeFaktor > 0 ? r.goaeFaktor : einst.goaeFaktor
  const gozMax = einst.erlaubeUeber35 ? GOZ_VEREINBARUNG_MAX : GOZ_HOECHSTSATZ
  const aufschlag = Math.min(Math.max(r.laborAufschlag, LABOR_AUFSCHLAG_MIN), LABOR_AUFSCHLAG_MAX)

  const honorarGoz: Zeile[] = []
  const honorarGoae: Zeile[] = []
  const material: Zeile[] = []
  const labor: Zeile[] = []

  for (const p of alle) {
    const anteil = p.gebuehrenanteil ?? 1
    if (p.ebene === 'GOZ') {
      const eintrag = GOZ.get(p.nr)
      if (p.analog && p.preis !== undefined) {
        honorarGoz.push({ ...p, faktor: p.faktor, einzel: runden(p.preis), text: p.text || p.analogText || '–', betrag: runden(p.preis * p.anzahl) })
        continue
      }
      let faktor = Math.min(Math.max(p.faktor ?? stdGoz, 1), gozMax)
      if (p.preis !== undefined) faktor = p.faktor ?? 1 // feste Zuschläge (0110/0120)
      const einzel = p.preis !== undefined ? runden(p.preis) : runden(gozEinzel(p.nr, faktor) * anteil)
      if (!eintrag && p.preis === undefined) hinweise.push(`GOZ ${p.nr} ist im Gebührenverzeichnis nicht vorhanden.`)
      if (faktor > gozMax) hinweise.push(`GOZ ${p.nr}: Faktor über ${gozMax.toFixed(1)} ist unzulässig.`)
      if (faktor > GOZ_HOECHSTSATZ) hinweise.push(`GOZ ${p.nr}: Faktor ${faktor.toFixed(1).replace('.', ',')} über 3,5 erfordert eine schriftliche Vereinbarung nach § 2 GOZ.`)
      honorarGoz.push({
        ...p, faktor, einzel, punkte: eintrag?.punkte,
        text: p.text || eintrag?.text || '–',
        begruendung: faktor > GOZ_SCHWELLE && !p.preis ? p.begruendung || standardBegruendung(p.nr) : p.begruendung,
        betrag: runden(einzel * p.anzahl),
      })
    } else if (p.ebene === 'GOAE') {
      const eintrag = GOAE.get(p.nr)
      if (p.analog && p.preis !== undefined) {
        honorarGoae.push({ ...p, faktor: p.faktor, einzel: runden(p.preis), text: p.text || p.analogText || '–', betrag: runden(p.preis * p.anzahl) })
        continue
      }
      const rahmen = goaeRahmen(p.nr)
      const faktor = Math.min(Math.max(p.faktor ?? stdGoae, 1), rahmen.max)
      const einzel = p.preis !== undefined ? runden(p.preis) : runden(goaeEinzel(p.nr, faktor) * anteil)
      if (!eintrag && p.preis === undefined) hinweise.push(`GOÄ ${p.nr} ist nicht in der geöffneten Liste vorhanden.`)
      honorarGoae.push({
        ...p, faktor, einzel, punkte: eintrag?.punkte,
        text: p.text || eintrag?.text || '–',
        begruendung: faktor > rahmen.schwelle ? p.begruendung || standardBegruendung(p.nr) : p.begruendung,
        betrag: runden(einzel * p.anzahl),
      })
    } else if (p.ebene === 'BEB') {
      const einzel = runden((p.preis ?? 0) * (1 + aufschlag / 100))
      labor.push({ ...p, einzel, text: p.text || 'Laborleistung', betrag: runden(einzel * p.anzahl) })
    } else {
      // MAT (Praxis-/Zahntechnik-Material, mit MwSt.)
      const einzel = materialEinzel(p, einst)
      material.push({ ...p, einzel, text: p.text || 'Material', betrag: runden(einzel * p.anzahl) })
    }
  }

  const sort = (a: Zeile, b: Zeile) => (a.sitzung ?? 0) - (b.sitzung ?? 0) || a.nr.localeCompare(b.nr) || a.zahn.localeCompare(b.zahn)
  honorarGoz.sort(sort); honorarGoae.sort(sort); material.sort(sort); labor.sort(sort)

  const summe = (z: Zeile[]) => runden(z.reduce((s, x) => s + x.betrag, 0))
  const summeGoz = summe(honorarGoz)
  const summeGoae = summe(honorarGoae)
  const summeMaterialNetto = summe(material)
  const summeLaborNetto = summe(labor)
  const mwst = runden((summeMaterialNetto + summeLaborNetto) * einst.mwst / 100)

  return {
    honorarGoz, honorarGoae, material, labor,
    summeGoz, summeGoae, summeMaterialNetto, summeLaborNetto, mwst,
    gesamt: runden(summeGoz + summeGoae + summeMaterialNetto + summeLaborNetto + mwst),
    hinweise, nichtAngesetzt,
  }
}

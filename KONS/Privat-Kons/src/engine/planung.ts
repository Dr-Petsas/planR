import type { GruppeMeta, Plan, Position, ZahnLeistung } from '../types'
import { KATALOG_NACH_ID } from '../data/katalog'
import { bemaFuellungKey, bemaLabel } from '../data/bema-kons'
import { STANDARD_MATERIAL } from '../data/material'
import { gozText } from './listen'
import { ALLE_ZAEHNE } from './zahnschema'

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

export const flaechenWort = (n: number): string =>
  ({ 1: 'einflächig', 2: 'zweiflächig', 3: 'dreiflächig', 4: 'vierflächig', 5: 'fünfflächig' }[n] ?? `${n}-flächig`)

/** GOZ-Füllungsnummer (Komposit, Adhäsiv/Mehrschicht) nach Flächenzahl. */
const gozFuellung = (f: number): string => (f <= 1 ? '2060' : f === 2 ? '2080' : f === 3 ? '2100' : '2120')
/** GOZ-Einlagefüllung (Inlay) nach Flächenzahl. */
const gozInlay = (f: number): string => (f <= 1 ? '2150' : f === 2 ? '2160' : '2170')

const materialName = (id: string) => STANDARD_MATERIAL.find((m) => m.id === id)?.name ?? id

interface Roh {
  ebene: Position['ebene']
  nr: string
  anzahl: number
  faktor?: number
  bema?: boolean
  mat?: boolean
  text?: string
}

/** Erzeugt die Positionen (roh, ohne €) und die Gruppen-Metadaten eines Plans. */
export function planen(plan: Plan): { positionen: Position[]; gruppen: GruppeMeta[] } {
  const positionen: Position[] = []
  const gruppen: GruppeMeta[] = []
  const faktor = plan.regler.gozFaktor

  for (const zahn of ALLE_ZAEHNE) {
    const z = plan.zaehne[zahn]
    if (!z || !z.therapie) continue
    const kat = KATALOG_NACH_ID[z.therapie]
    if (!kat) continue

    const gruppeKey = `${zahn}|${z.therapie}`
    const roh: Roh[] = []
    let titelZusatz = ''
    let flaechen: number | undefined

    switch (kat.kategorie) {
      case 'fuellung': {
        flaechen = clamp(z.flaechen ?? 1, 1, 5)
        titelZusatz = flaechenWort(flaechen)
        roh.push({ ebene: 'GOZ', nr: gozFuellung(flaechen), anzahl: 1 })
        if (z.kofferdam) roh.push({ ebene: 'GOZ', nr: '2040', anzahl: 1 })
        roh.push({ ebene: 'BEMA', nr: bemaFuellungKey(flaechen), anzahl: 1, bema: true })
        break
      }
      case 'inlay': {
        flaechen = clamp(z.flaechen ?? 2, 1, 5)
        const art = z.material === 'gold-inlay' ? 'Gold' : z.material === 'cadcam-inlay' ? 'CAD/CAM-Keramik' : 'Keramik'
        titelZusatz = `${art}, ${flaechenWort(flaechen)}`
        roh.push({ ebene: 'GOZ', nr: gozInlay(flaechen), anzahl: 1 })
        roh.push({ ebene: 'GOZ', nr: '2197', anzahl: 1 }) // adhäsive Befestigung
        if (z.material) roh.push({ ebene: 'MAT', nr: z.material, anzahl: 1, mat: true })
        if (z.kofferdam) roh.push({ ebene: 'GOZ', nr: '2040', anzahl: 1 })
        roh.push({ ebene: 'BEMA', nr: bemaFuellungKey(Math.max(flaechen, 2)), anzahl: 1, bema: true })
        break
      }
      case 'endo': {
        const kan = clamp(z.kanaele ?? 1, 1, 4)
        titelZusatz = `${kan} Kanal${kan > 1 ? 'e' : ''}${z.revision ? ', Revision' : ''}`
        roh.push({ ebene: 'GOZ', nr: '2390', anzahl: 1 }) // Trepanation
        roh.push({ ebene: 'GOZ', nr: '2410', anzahl: kan }) // Aufbereitung je Kanal
        roh.push({ ebene: 'GOZ', nr: '2440', anzahl: kan }) // Wurzelfüllung je Kanal
        if (z.elektrometrie) roh.push({ ebene: 'GOZ', nr: '2400', anzahl: kan })
        if (z.maschinell) roh.push({ ebene: 'GOZ', nr: '2420', anzahl: kan })
        if (z.mikroskop) roh.push({ ebene: 'GOZ', nr: '0110', anzahl: 1 })
        if (z.kofferdam) roh.push({ ebene: 'GOZ', nr: '2040', anzahl: 1 })
        if (kat.art === 'mehrkosten') {
          roh.push({ ebene: 'BEMA', nr: 'endoBasis', anzahl: 1, bema: true })
          roh.push({ ebene: 'BEMA', nr: 'endoKanal', anzahl: kan, bema: true })
        }
        break
      }
      case 'versiegelung': {
        roh.push({ ebene: 'GOZ', nr: '2000', anzahl: 1 })
        break
      }
      case 'vitalerhaltung': {
        roh.push({ ebene: 'GOZ', nr: '2330', anzahl: 1 })
        if (z.kofferdam) roh.push({ ebene: 'GOZ', nr: '2040', anzahl: 1 })
        roh.push({ ebene: 'BEMA', nr: 'cp', anzahl: 1, bema: true })
        break
      }
      case 'aufbau': {
        const mitStift = z.material === 'glasfaserstift'
        titelZusatz = mitStift ? 'mit Glasfaserstift' : 'adhäsiv'
        roh.push({ ebene: 'GOZ', nr: mitStift ? '2195' : '2180', anzahl: 1 })
        roh.push({ ebene: 'GOZ', nr: '2197', anzahl: 1 }) // adhäsive Befestigung
        if (mitStift) roh.push({ ebene: 'MAT', nr: 'glasfaserstift', anzahl: 1, mat: true })
        if (z.kofferdam) roh.push({ ebene: 'GOZ', nr: '2040', anzahl: 1 })
        break
      }
      default:
        continue
    }

    let idx = 0
    for (const r of roh) {
      const text = r.ebene === 'GOZ' ? gozText(r.nr) : r.ebene === 'BEMA' ? bemaLabel(r.nr) : materialName(r.nr)
      positionen.push({
        key: `${gruppeKey}#${idx++}`,
        gruppe: gruppeKey,
        ebene: r.ebene,
        nr: r.nr,
        zahn,
        anzahl: r.anzahl,
        faktor: r.ebene === 'GOZ' ? faktor : undefined,
        text,
        auto: true,
      })
    }

    gruppen.push({
      key: gruppeKey,
      zahn,
      titel: `Zahn ${zahn} · ${kat.titel}${titelZusatz ? ` (${titelZusatz})` : ''}`,
      kategorie: kat.kategorie,
      art: kat.art,
      flaechen,
      begruendung: beschreibeZahn(z, kat.kurz),
    })
  }

  return { positionen, gruppen }
}

function beschreibeZahn(z: ZahnLeistung, kurz: string): string {
  const teile = [kurz]
  const opt: string[] = []
  if (z.mikroskop) opt.push('Operationsmikroskop')
  if (z.elektrometrie) opt.push('elektrometrische Längenmessung')
  if (z.maschinell) opt.push('maschinelle Aufbereitung')
  if (z.kofferdam) opt.push('Kofferdam')
  if (z.revision) opt.push('Revision')
  if (opt.length) teile.push(opt.join(', '))
  if (z.notiz) teile.push(z.notiz)
  return teile.join(' · ')
}

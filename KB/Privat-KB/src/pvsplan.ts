/**
 * Plan fürs Praxisprogramm: die Planer rechnen ihn beim Speichern aus ihrem Ergebnis, die Übersicht schickt
 * ihn über die Bridge an den Connector. DS-Win legt daraus einen Kostenvoranschlag (kva) bzw. eine
 * Mehrkostenvereinbarung (mkv) an; Format siehe pvsConnectoR connectors/dampsoft/plan_formats.py.
 */

export type PvsArt = 'ZE' | 'IM' | 'KO'
export type PvsEbene = 'GOZ' | 'GOAE' | 'BEMA' | 'BEB' | 'MAT' | 'LABOR'

export interface PvsPosition {
  ebene: PvsEbene
  nr?: string
  zahn: string
  anzahl: number
  einzelpreis: number
  betrag: number
  faktor?: number
  art?: PvsArt
  /** Hauptleistung einer Mehrkostenfüllung (DS-Win „…mk“) */
  mkv?: boolean
  punkte?: number
  punktwert?: number
  labor?: 'eigen' | 'fremd'
  /** Kürzel der Praxisposition (Material) */
  eigen?: string
  bezeichnung?: string
  /** Begründung des Steigerungsfaktors (DENS: Faktorerklärung der KVA-Zeile) */
  begruendung?: string
  /** MwSt.-Satz in Prozent auf diese Labor-/Materialzeile, wie der Planer ihn rechnet (DENS setzt ihn je Laborposition) */
  mwst?: number
}

export interface PvsPlan {
  format: 'planr-plan'
  version: 1
  planart: 'kva' | 'mkv'
  art: PvsArt
  titel: string
  datum: string
  zaehne?: Record<string, { B?: string; TP?: string }>
  positionen: PvsPosition[]
  summen: { honorar: number; laborEigen: number; laborFremd: number; gesamt: number }
}

export const r2 = (x: number) => Math.round(x * 100) / 100

const FDI = /^[1-4][1-8]$/

/** Zahnangabe wie DS-Win sie annimmt: Zahn, Liste, Spanne, OK/UK; Regionen und Freitext entfallen. */
export function pvsZahn(z: string | undefined): string {
  const teile = String(z ?? '').split(/[,\s]+/).filter(Boolean)
  const gut = teile.filter((t) => FDI.test(t) || /^[1-4][1-8]-[1-4][1-8]$/.test(t) || t === 'OK' || t === 'UK')
  const kiefer = gut.filter((t) => t === 'OK' || t === 'UK')
  if (kiefer.length) return kiefer.length === 2 ? 'OK,UK' : kiefer[0]
  return gut.join(',').slice(0, 30)
}

/** Art der Leistung im DS-Win-Plan: Implantologie (GOZ 9000 ff.), Prothetik (GOZ 22xx–24xx, 5xxx, 7xxx, 8xxx), sonst wie der Plan. */
export function pvsArt(nr: string, standard: PvsArt): PvsArt {
  if (/^9\d{3}/.test(nr)) return 'IM'
  if (/^(2[234]\d\d|[578]\d{3})/.test(nr)) return 'ZE'
  return standard
}

/** Bruttolaborsumme auf Eigen- und Fremdlabor verteilen (MwSt. anteilig wie die Nettobeträge). */
export function laborTeilen(zeilen: { betrag: number; labor?: 'eigen' | 'fremd' }[], brutto: number): { laborEigen: number; laborFremd: number } {
  const netto = zeilen.reduce((s, z) => s + z.betrag, 0)
  const eigen = zeilen.filter((z) => z.labor === 'eigen').reduce((s, z) => s + z.betrag, 0)
  const laborEigen = netto > 0 ? r2(brutto * eigen / netto) : 0
  return { laborEigen, laborFremd: r2(brutto - laborEigen) }
}

/** Kostenvoranschlag: Summen aus den Positionen; `laborBrutto` ist die Labor- und Materialsumme, wie der Plan sie zeigt. */
export function kostenvoranschlag(a: {
  art: PvsArt; titel: string; datum: string; positionen: PvsPosition[]; laborBrutto: number
  zaehne?: PvsPlan['zaehne']
}): PvsPlan {
  const honorar = r2(a.positionen.filter((p) => p.ebene === 'GOZ' || p.ebene === 'GOAE').reduce((s, p) => s + p.betrag, 0))
  const labor = laborTeilen(a.positionen.filter((p) => p.ebene === 'BEB' || p.ebene === 'MAT' || p.ebene === 'LABOR'), a.laborBrutto)
  return {
    format: 'planr-plan', version: 1, planart: 'kva', art: a.art, titel: a.titel.slice(0, 120), datum: datumIso(a.datum),
    ...(a.zaehne ? { zaehne: a.zaehne } : {}),
    positionen: a.positionen,
    summen: { honorar, ...labor, gesamt: r2(honorar + labor.laborEigen + labor.laborFremd) },
  }
}

/** „TT.MM.JJJJ“ oder ISO → „JJJJ-MM-TT“, sonst heute */
export function datumIso(s: string): string {
  const t = String(s ?? '').trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  return de ? `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}` : new Date().toISOString().slice(0, 10)
}

/** Befundzeile des Plans (Kleinbuchstaben-Kürzel), leere Zähne ausdrücklich leer. */
export function befundZeile(zaehne: Record<string, { B?: string }> | undefined): PvsPlan['zaehne'] | undefined {
  if (!zaehne) return undefined
  const out: NonNullable<PvsPlan['zaehne']> = {}
  for (const [z, v] of Object.entries(zaehne)) {
    const b = String(v?.B ?? '').trim()
    if (FDI.test(z) && (!b || /^[a-z0-9)(]{1,4}$/.test(b))) out[z] = { B: b }
  }
  return out
}

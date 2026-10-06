import type { BebEintrag, Preisliste } from '../types'

const r = (nr: string, text: string, preis: number): BebEintrag => ({ nr, text, preis, richtpreis: true })

/**
 * Positionen, die jede BEB-Liste jedes Mandanten enthält. Fehlt eine Nummer, wird sie mit Richtpreis
 * (netto) ergänzt; vorhandene Nummern behalten Text und Preis der Liste.
 */
export const BEB_STANDARD: readonly BebEintrag[] = [
  r('0007', 'Oralscan aufbereiten', 14),
  r('0009', 'Scan Spezialmodell, Kunststoff gedruckt je Kiefer', 23),
  r('0013', 'Präp freilegen Oralscan', 6.5),
  r('0017', 'Stumpf Digitaldruck', 9.5),
  r('0032', 'Sintern', 12),
  r('0710', 'Eiltermin Zuschlag', 1),
  r('0723', 'Zahnfarbenbestimmung I', 30),
  r('0724', 'Zahnfarbenbestimmung II', 45),
  r('0901', 'CAD: Anlage Auftragsdaten', 9.5),
  r('0902', 'CAD: optisch digitale Registrierung', 14.5),
  r('0903', 'CAD: Modellsegmentierung', 9.5),
  r('0904', 'CAD: Segment / Biss digitalisieren, je Segment/Biss', 6.5),
  r('0905', 'CAD: Bearbeitung Präpgrenze entsprechend dem Scan', 6.5),
  r('0906', 'CAD: Glanz- und Kristallisationsbrand', 14),
  r('0907', 'CAD: Einzelkrone konstruieren', 28),
  r('0908', 'CAD: Brückenglied konstruieren', 24),
  r('0909', 'CAD: Kaufläche konstruieren', 18),
  r('0910', 'CAD: Verbundkonstruktion / Verbinder', 9.5),
  r('0911', 'CAD: CAM Element nacharbeiten', 12),
  r('1401', 'Provisorische Krone, Brückenglied, PMMA', 35),
  r('2281', 'Krone aus Keramik gefräst (Anatomisch Vollzirkon)', 110),
  r('2361', 'Brückenglied aus Keramik (Anatomisches Vollzirkon)', 110),
  r('2362', 'Brückenglied gegossen/gefräst Metall', 98),
  r('2556', 'Pro-Inlay, einflächig', 85),
  r('2557', 'Pro-Inlay, zweiflächig', 95),
  r('2558', 'Pro-Inlay, dreiflächig', 108),
  r('2559', 'Pro-Inlay, mehrflächig; Onlay', 125),
  r('3303', 'Sekundär Teleskop in Metallbasis einarbeiten', 45),
  r('3541', 'Konfektionsriegel primär', 60),
  r('3641', 'Konfektionsriegel sekundär', 60),
]

/** Nummern, die in älteren Listen eine andere Leistung tragen: die alte Leistung zieht auf `neu` um */
const UMZUG: readonly { nr: string; alt: RegExp; neu: string }[] = [
  { nr: '0007', alt: /kontrollmodell/i, neu: '0008' },
  { nr: '2361', alt: /metall/i, neu: '2362' },
]

const norm = (nr: string) => nr.trim().padStart(4, '0')

/** Ergänzt eine BEB-Liste um die fehlenden Standardpositionen; ohne Änderung kommt dieselbe Liste zurück. */
export function bebErgaenzen<T extends Pick<Preisliste<'beb'>, 'eintraege'>>(liste: T): T {
  const eintraege = [...liste.eintraege]
  let geaendert = false
  for (const u of UMZUG) {
    const i = eintraege.findIndex((e) => norm(e.nr) === u.nr)
    if (i < 0 || !u.alt.test(eintraege[i].text)) continue
    const [alt] = eintraege.splice(i, 1)
    if (!eintraege.some((e) => norm(e.nr) === u.neu)) eintraege.push({ ...alt, nr: u.neu })
    geaendert = true
  }
  const fehlend = BEB_STANDARD.filter((s) => !eintraege.some((e) => norm(e.nr) === s.nr))
  if (!fehlend.length && !geaendert) return liste
  return { ...liste, eintraege: [...eintraege, ...fehlend].sort((a, b) => norm(a.nr).localeCompare(norm(b.nr))) }
}

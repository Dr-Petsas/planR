import type { Befund, DiagnoseErgebnis, Einstellungen, ParFall } from '../types'
import { befundFuer, cptZaehne, initialBefund } from './strecke'
import { fristenPruefen } from './termine'
import { hatFbFeld, istBehandelbar } from './zahnschema'

export type MeldungsArt = 'fehler' | 'warnung' | 'hinweis'

export interface Pruefmeldung {
  art: MeldungsArt
  bereich: 'Stammdaten' | 'Blatt 1' | 'Blatt 2' | 'Strecke' | 'Punktwert'
  text: string
}

/** Befund-Pruefungen nach den Ausfuellhinweisen (KZVLB/KZV-SH). */
export function pruefeBefund(b: Befund): Pruefmeldung[] {
  const m: Pruefmeldung[] = []
  const w = (text: string, art: MeldungsArt = 'warnung') => m.push({ art, bereich: 'Blatt 2', text: `${b.bezeichnung}: ${text}` })
  let ohneMessung = 0
  let zuWenig = 0
  for (const [zahn, z] of Object.entries(b.zaehne)) {
    const messwerte = z.st.some((x) => x != null) || z.lockerung > 0 || z.fb > 0
    if (!istBehandelbar(z.zs)) {
      // fehlend, nicht erhaltungswuerdig, Brueckenglied, Implantat: keine Messwerte, keine AIT
      if (z.zs === 1 && messwerte) w(`Zahn ${zahn} ist fehlend (X), trägt aber Messwerte.`)
      if (z.zs === 2 && messwerte) w(`Zahn ${zahn} ist nicht erhaltungswürdig – keine Messwerte eintragen.`)
      if (z.zs === 5 && messwerte) w(`Zahn ${zahn} ist ersetzt (Brückenglied) – keine Messwerte.`)
      if (z.zs === 6 && z.aitOverride === true) w(`Implantat ${zahn} wird in AIT a/b nicht gezählt.`)
      if (z.zs !== 6 && z.aitOverride === true) w(`Zahn ${zahn}: AIT bei Zahnstatus ${z.zs} nicht möglich.`)
      continue
    }
    const gesetzt = z.st.filter((x) => x != null)
    if (gesetzt.length === 0) { ohneMessung++; continue }
    if (gesetzt.length < 2) zuWenig++
    if (z.st.some((x) => x != null && !Number.isInteger(x))) w(`Zahn ${zahn}: Sondierungstiefen in ganzen Millimetern.`)
    const tief = z.st.some((x) => x != null && x >= 4)
    if (z.aitOverride === true && !tief) w(`Zahn ${zahn}: AIT markiert, aber keine Sondierungstiefe ≥ 4 mm.`)
    if (z.fb > 0 && !hatFbFeld(zahn)) w(`Zahn ${zahn}: Furkationsbefall nur an Zähnen mit FB-Kästchen.`, 'hinweis')
    if (z.bop.some((x, i) => x && z.st[i] == null)) w(`Zahn ${zahn}: Sondierungsbluten ohne Sondierungstiefe an derselben Stelle.`, 'hinweis')
  }
  if (ohneMessung > 0) w(`${ohneMessung} vorhandene Zähne ohne Sondierungstiefen.`, 'hinweis')
  if (zuWenig > 0) w(`${zuWenig} Zähne mit weniger als 2 Messstellen (mind. mesio- und distoapproximal).`)
  return m
}

/** Vollstaendige Pruefung des Falls. */
export function pruefeFall(fall: ParFall, _einst: Einstellungen, diag: DiagnoseErgebnis): Pruefmeldung[] {
  const m: Pruefmeldung[] = []
  const p = fall.patient
  const add = (art: MeldungsArt, bereich: Pruefmeldung['bereich'], text: string) => m.push({ art, bereich, text })

  if (!p.name.trim()) add('fehler', 'Stammdaten', 'Name des Versicherten fehlt.')
  if (!p.geburtsdatum) add('fehler', 'Stammdaten', 'Geburtsdatum fehlt.')
  if (!p.kostentraegerkennung) add('warnung', 'Stammdaten', 'Kostenträgerkennung (IK der Kasse) fehlt.')
  if (!p.versichertennr) add('warnung', 'Stammdaten', 'Versicherten-Nr. fehlt.')
  if (p.kassenart === 'ersatz' && !p.kassennummer) add('hinweis', 'Punktwert', 'Ersatzkasse ohne Kassennummer – Region des Punktwerts aus der Praxis-KZV.')

  // Blatt 1
  const d = fall.diagnose
  if (d.alter <= 0) add('warnung', 'Blatt 1', 'Alter fehlt – Grading (%/Alter) nicht berechenbar.')
  if (d.diagnoseTyp === 'parodontitis' && diag.befalleneZaehne === 0) add('warnung', 'Blatt 1', 'Diagnose Parodontitis, aber kein Zahn mit ST ≥ 4 mm im Befund.')
  if (fall.anamnese.tabakkonsum && d.raucher === 'nein') add('hinweis', 'Blatt 1', 'Anamnese Tabakkonsum, aber Grading-Raucherstatus „nein".')
  if (fall.anamnese.diabetesMellitus && d.diabetes === 'nein') add('hinweis', 'Blatt 1', 'Anamnese Diabetes, aber Grading-Diabetes „nein".')
  if (d.knochenabbauProzent > 0 && !d.knochenabbauZahn) add('hinweis', 'Blatt 1', 'Zahn mit dem stärksten Knochenabbau angeben.')
  if (diag.stadium >= 3 && d.calMax < 5 && d.knochenabbauProzent <= 33 && !d.st6plus && !d.vertikalerKA3 && !d.furkationII_III && d.zahnverlustPar === 0) {
    add('hinweis', 'Blatt 1', 'Stadium III/IV ohne begründenden Wert (CAL, KA, Komplexität, Zahnverlust).')
  }

  // Blatt 2
  for (const b of fall.befunde) m.push(...pruefeBefund(b))
  if (fall.mitCPT) {
    const beva = befundFuer(fall, 'beva')
    if (!beva) add('hinweis', 'Blatt 2', 'CPT geplant: BEV-a-Befund erfassen (CPT nur an Zähnen mit ST ≥ 6 mm).')
    else if (cptZaehne(beva).ein.length + cptZaehne(beva).mehr.length === 0) add('warnung', 'Blatt 2', 'CPT geplant, aber im BEV-a-Befund kein Zahn mit ST ≥ 6 mm.')
  }
  if (initialBefund(fall) && fall.befunde.length && !fall.befunde.some((b) => b.phase === 'initial')) {
    add('hinweis', 'Blatt 2', 'Kein Befund als Initialbefund gekennzeichnet.')
  }

  // Strecke
  for (const f of fristenPruefen(fall, diag)) {
    const t = fall.termine.find((x) => x.id === f.terminId)
    add(f.art, 'Strecke', `${t?.titel ?? 'Termin'}: ${f.text}`)
  }
  for (const t of fall.termine) {
    if (t.erbracht && !t.datum) add('fehler', 'Strecke', `${t.titel}: als erbracht markiert, aber ohne Datum.`)
  }
  return m
}

export const zaehlMeldungen = (m: Pruefmeldung[]) => ({
  fehler: m.filter((x) => x.art === 'fehler').length,
  warnung: m.filter((x) => x.art === 'warnung').length,
  hinweis: m.filter((x) => x.art === 'hinweis').length,
})

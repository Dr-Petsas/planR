import type { Befund, Diagnose, DiagnoseErgebnis } from '../types'

/** Ein Zahn gilt als parodontal betroffen, wenn eine ST >= 4 mm vorliegt. */
export const zahnBetroffen = (st: (number | null)[]) => st.some((w) => w != null && w >= 4)

/** Vorhandene (nicht fehlende) Zähne im Befund. */
export const vorhandeneZaehne = (befund: Befund) =>
  Object.values(befund.zaehne).filter((z) => z.zs !== 1).length

export const betroffeneZaehne = (befund: Befund) =>
  Object.values(befund.zaehne).filter((z) => z.zs !== 1 && zahnBetroffen(z.st)).length

/**
 * Staging nach der Klassifikation 2018 (vereinfacht, auf die im PAR-Status
 * erfassbaren Parameter gestützt):
 *  I   CAL 1–2 mm
 *  II  CAL 3–4 mm
 *  III CAL >= 5 mm, ST >= 6 mm / vertikaler KA / Furkation II–III / Zahnverlust <= 4
 *  IV  wie III + komplexe Rehabilitation / >= 5 verlorene Zähne
 */
function stadiumBerechnen(d: Diagnose): { stadium: 1 | 2 | 3 | 4; text: string } {
  // Formularzeile Blatt 1: Roentg. Knochenabbau ODER interdentaler CAL.
  // KA%: < 15 % = I, 15-33 % = II, > 33 % = III/IV (apikales Drittel).
  // CAL: 1-2 mm = I, 3-4 mm = II, >= 5 mm = III/IV.
  let stadium: 1 | 2 | 3 | 4 = 1
  if (d.calMax >= 5 || d.knochenabbauProzent > 33) stadium = 3
  else if (d.calMax >= 3 || d.knochenabbauProzent >= 15) stadium = 2
  else stadium = 1

  // Komplexität hebt mindestens auf Stadium III
  if (d.st6plus || d.vertikalerKA3 || d.furkationII_III) stadium = Math.max(stadium, 3) as 1 | 2 | 3 | 4
  if (d.zahnverlustPar >= 1 && d.zahnverlustPar <= 4) stadium = Math.max(stadium, 3) as 1 | 2 | 3 | 4
  // Stadium IV
  if (d.zahnverlustPar >= 5 || d.komplexeReha) stadium = 4

  return { stadium, text: STADIUM_TEXT[stadium] }
}

/**
 * Grading nach %/Alter (röntgenologischer Knochenabbau in % geteilt durch das
 * Patientenalter): < 0,25 = A, 0,25–1,0 = B, > 1,0 = C.
 * Raucher und Diabetes heben das Grading (Grad-Modifikatoren).
 */
/** Klasse des Knochenabbauindex (A < 0,25, B 0,25-1,0, C > 1,0); null ohne KA/Alter. */
export function kaIndexKlasse(d: Diagnose): 'A' | 'B' | 'C' | null {
  if (d.kaIndexManuell) return d.kaIndexManuell
  if (d.alter <= 0 || d.knochenabbauProzent <= 0) return null
  const index = d.knochenabbauProzent / d.alter
  return index > 1.0 ? 'C' : index >= 0.25 ? 'B' : 'A'
}

function gradBerechnen(d: Diagnose): { grad: 'A' | 'B' | 'C'; basis: string; index: number } {
  const index = d.alter > 0 ? d.knochenabbauProzent / d.alter : 0
  let grad: 'A' | 'B' | 'C' = kaIndexKlasse(d) ?? 'A'
  const teile = [d.kaIndexManuell
    ? `Knochenabbauindex von Hand: ${{ A: '< 0,25', B: '0,25 - 1,0', C: '> 1,0' }[d.kaIndexManuell]}`
    : `KA ${d.knochenabbauProzent}% / Alter ${d.alter} = ${index.toFixed(2)}`]

  const hebeAuf = (ziel: 'B' | 'C', grund: string) => {
    const rang = { A: 0, B: 1, C: 2 }
    if (rang[ziel] > rang[grad]) {
      grad = ziel
      teile.push(grund)
    }
  }
  if (d.raucher === 'unter10') hebeAuf('B', 'Raucher < 10 Zig./Tag → mind. Grad B')
  if (d.raucher === 'ab10') hebeAuf('C', 'Raucher ≥ 10 Zig./Tag → Grad C')
  if (d.diabetes === 'hba1c_unter7') hebeAuf('B', 'Diabetes HbA1c < 7,0 % → mind. Grad B')
  if (d.diabetes === 'hba1c_ab7') hebeAuf('C', 'Diabetes HbA1c ≥ 7,0 % → Grad C')

  return { grad, basis: teile.join('; '), index }
}

const STADIUM_TEXT: Record<number, string> = {
  1: 'Stadium I – initiale Parodontitis',
  2: 'Stadium II – moderate Parodontitis',
  3: 'Stadium III – schwere Parodontitis mit möglichem Zahnverlust',
  4: 'Stadium IV – schwere Parodontitis mit Verlust der Kaufunktion',
}

export function diagnostizieren(d: Diagnose, initial: Befund): DiagnoseErgebnis {
  const hinweise: string[] = []
  const roem = ['', 'I', 'II', 'III', 'IV']
  const rechnung = stadiumBerechnen(d)
  const stadium = d.stadiumManuell ?? rechnung.stadium
  if (d.stadiumManuell && d.stadiumManuell !== rechnung.stadium) {
    hinweise.push(`Stadium von Hand auf ${roem[stadium]} gesetzt (aus den Angaben: ${roem[rechnung.stadium]}).`)
  }
  const text = STADIUM_TEXT[stadium]
  const gr = gradBerechnen(d)
  const grad = d.gradManuell ?? gr.grad
  if (d.gradManuell && d.gradManuell !== gr.grad) hinweise.push(`Grad von Hand auf ${grad} gesetzt (aus den Angaben: ${gr.grad}).`)
  const { basis, index } = gr

  const gesamt = vorhandeneZaehne(initial)
  const befallen = betroffeneZaehne(initial)
  const anteil = gesamt > 0 ? (befallen / gesamt) * 100 : 0
  const ausmassBefund = anteil >= 30 ? 'generalisiert' : 'lokalisiert'
  const ausmass: DiagnoseErgebnis['ausmass'] = d.mipMuster
    ? 'molaren-inzisiven'
    : d.ausmassManuell ?? ausmassBefund
  if (!d.mipMuster && d.ausmassManuell && d.ausmassManuell !== ausmassBefund) {
    hinweise.push(`Ausmaß von Hand „${d.ausmassManuell}", laut Blatt 2 ${ausmassBefund} (${Math.round(anteil)} % der Zähne).`)
  }

  if (gesamt === 0) hinweise.push('Noch kein Befund erfasst – Staging/Ausmaß vorläufig.')
  if (d.alter === 0) hinweise.push('Alter fehlt – Grading (%/Alter) nicht berechenbar.')
  if (grad === 'C') hinweise.push('Grad C → UPT-Intervall 3 Monate (6× in 2 Jahren).')
  else if (grad === 'B') hinweise.push('Grad B → UPT-Intervall ca. 5 Monate (4× in 2 Jahren).')
  else hinweise.push('Grad A → UPT-Intervall ca. 10 Monate (2× in 2 Jahren).')

  return {
    stadium,
    stadiumText: text,
    ausmass,
    grad,
    gradBasis: basis,
    kaIndex: index,
    befalleneZaehne: befallen,
    gesamtZaehne: gesamt,
    anteilProzent: Math.round(anteil),
    hinweise,
  }
}

/** Diagnose-Kurztext für den Antrag, z. B. „Parodontitis Stadium III, generalisiert, Grad B". */
export function diagnoseText(e: DiagnoseErgebnis): string {
  const stad = ['', 'I', 'II', 'III', 'IV'][e.stadium]
  const ausmass = e.ausmass === 'generalisiert' ? 'generalisiert' : e.ausmass === 'molaren-inzisiven' ? 'Molaren-Inzisiven-Muster' : 'lokalisiert'
  return `Parodontitis Stadium ${stad}, ${ausmass}, Grad ${e.grad}`
}

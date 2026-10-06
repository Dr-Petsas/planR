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
  let stadium: 1 | 2 | 3 | 4 = 1
  if (d.calMax >= 5) stadium = 3
  else if (d.calMax >= 3) stadium = 2
  else stadium = 1

  // Komplexität hebt mindestens auf Stadium III
  if (d.st6plus || d.vertikalerKA3 || d.furkationII_III) stadium = Math.max(stadium, 3) as 1 | 2 | 3 | 4
  if (d.zahnverlustPar >= 1 && d.zahnverlustPar <= 4) stadium = Math.max(stadium, 3) as 1 | 2 | 3 | 4
  // Stadium IV
  if (d.zahnverlustPar >= 5 || d.komplexeReha) stadium = 4

  const texte: Record<number, string> = {
    1: 'Stadium I – initiale Parodontitis',
    2: 'Stadium II – moderate Parodontitis',
    3: 'Stadium III – schwere Parodontitis mit möglichem Zahnverlust',
    4: 'Stadium IV – schwere Parodontitis mit Verlust der Kaufunktion',
  }
  return { stadium, text: texte[stadium] }
}

/**
 * Grading nach %/Alter (röntgenologischer Knochenabbau in % geteilt durch das
 * Patientenalter): < 0,25 = A, 0,25–1,0 = B, > 1,0 = C.
 * Raucher und Diabetes heben das Grading (Grad-Modifikatoren).
 */
function gradBerechnen(d: Diagnose): { grad: 'A' | 'B' | 'C'; basis: string; index: number } {
  const index = d.alter > 0 ? d.knochenabbauProzent / d.alter : 0
  let grad: 'A' | 'B' | 'C' = 'A'
  if (index > 1.0) grad = 'C'
  else if (index >= 0.25) grad = 'B'
  const teile = [`KA ${d.knochenabbauProzent}% / Alter ${d.alter} = ${index.toFixed(2)}`]

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

export function diagnostizieren(d: Diagnose, initial: Befund): DiagnoseErgebnis {
  const { stadium, text } = stadiumBerechnen(d)
  const { grad, basis, index } = gradBerechnen(d)

  const gesamt = vorhandeneZaehne(initial)
  const befallen = betroffeneZaehne(initial)
  const anteil = gesamt > 0 ? (befallen / gesamt) * 100 : 0
  const ausmass: DiagnoseErgebnis['ausmass'] = anteil >= 30 ? 'generalisiert' : 'lokalisiert'

  const hinweise: string[] = []
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
  const ausmass = e.ausmass === 'generalisiert' ? 'generalisiert' : 'lokalisiert'
  return `Parodontitis Stadium ${stad}, ${ausmass}, Grad ${e.grad}`
}

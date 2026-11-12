/**
 * Öffentliche Probe: Originalzustand des hochgeladenen Plans.
 * GOZ- und Laborzeilen kommen vom Blatt statt aus der Regelengine, die Summen stehen wie auf dem Blatt.
 * Solange am Plan nichts geändert ist, zeigt die Oberfläche genau diese Zahlen. Danach rechnet PlanR.
 */
import type { HkpPlan, Labor, Position } from './types'
import { positionBerechnen, type Ergebnis, type Listen } from './engine/berechnung'
import type { ProbeGebuehr, ProbeSummen } from './probeImport'

export interface BlattStand {
  plan: HkpPlan
  summen: ProbeSummen
  /** Betrag der Zeile vom Blatt je Positions-Id */
  betraege: Record<string, number>
  /** MwSt.-Satz Labor vor der Übernahme: der Beleg weist die MwSt. selbst aus */
  mwst: number
  schluessel: string
}

const BLATT = 'blatt-'
const runden = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const gleich = (a: number, b: number, t = 0.005) => Math.abs(a - b) <= t

export const vomBlatt = (p: Position) => p.id.startsWith(BLATT)

/** Alles, was Zahlen ändert. Gleichheit heißt: Der Plan steht noch so, wie er vom Blatt kam. */
export function planSchluessel(plan: HkpPlan): string {
  return JSON.stringify([plan.zaehne, plan.positionen, plan.befunde, plan.zuschuss, plan.einstellungen, plan.abformung, plan.abformungProthese, plan.werkstoffe, plan.versorgungsart, plan.implantat])
}

/** Faktor, mit dem die Zeile den Betrag vom Blatt ergibt. Teil 2 rundet auf ganze Euro. */
function faktorAus(punkte: number, punktwert: number, anzahl: number, betrag: number): number | undefined {
  const roh = betrag / anzahl / (punkte * punktwert)
  const nah = Math.round(roh * 10) / 10
  const ganzeEuro = Number.isInteger(betrag)
  const passt = (f: number) => {
    const b = runden(runden(punkte * punktwert * f) * anzahl)
    return ganzeEuro ? Math.round(b) === betrag : gleich(b, betrag, 0.02)
  }
  return [2.3, 3.5, nah, runden(nah - 0.1), runden(nah + 0.1)].find((f) => f >= 1 && passt(f))
}

function gozVomBlatt(plan: HkpPlan, listen: Listen, zeilen: ProbeGebuehr[], betraege: Record<string, number>): Position[] {
  return zeilen.map((z, i) => {
    const anzahl = z.anzahl && z.anzahl > 0 ? z.anzahl : 1
    const basis: Position = { id: `${BLATT}GOZ-${i}`, ebene: 'GOZ', nr: z.nr.trim().toLowerCase(), zahn: (z.zahn ?? '').trim(), anzahl, auto: false }
    if (!z.betrag || z.betrag <= 0) return { ...basis, faktor: z.faktor ?? plan.einstellungen.gozFaktor }
    betraege[basis.id] = z.betrag
    const probe = positionBerechnen({ ...basis, faktor: 1 }, listen, plan)
    const faktor = probe.punkte ? faktorAus(probe.punkte, listen.goz?.punktwert ?? 0.0562421, anzahl, z.betrag) : undefined
    return faktor ? { ...basis, faktor } : { ...basis, preis: runden(z.betrag / anzahl), reglerPreis: true }
  })
}

function laborVomBlatt(plan: HkpPlan, listen: Listen, zeilen: ProbeGebuehr[], labor: Labor, betraege: Record<string, number>): Position[] {
  return zeilen.map((z, i) => {
    const anzahl = z.anzahl && z.anzahl > 0 ? z.anzahl : 1
    const basis: Position = {
      id: `${BLATT}${z.ebene}-${i}`, ebene: z.ebene as 'BEL' | 'BEB', nr: z.nr.trim().toLowerCase(), zahn: (z.zahn ?? '').trim(), anzahl, auto: false, labor,
      ...(z.text?.trim() ? { text: z.text.trim() } : {}),
    }
    if (!z.betrag || z.betrag <= 0) return basis
    betraege[basis.id] = runden(z.betrag * anzahl)
    // Steht der Preis so in der Liste, bleibt die Zeile an den Reglern; sonst gilt der Preis vom Blatt fest.
    const liste = positionBerechnen(basis, listen, plan)
    if (!liste.fehler && gleich(liste.einzelpreis, z.betrag)) return basis
    return { ...basis, preis: z.betrag, reglerPreis: true, ...(basis.text ? {} : { text: liste.bezeichnung || 'Laborleistung laut Beleg' }) }
  })
}

/** BEMA steht auf Teil 1 nur als Summe: Die gerechneten Zeilen bleiben, wenn sie die Summe treffen. */
function bemaVomBlatt(plan: HkpPlan, listen: Listen, positionen: Position[], ziel: number): Position[] {
  const bema = positionen.filter((p) => p.ebene === 'BEMA')
  const summe = (liste: Position[]) => runden(liste.reduce((s, p) => s + positionBerechnen(p, listen, plan).betrag, 0))
  if (gleich(summe(bema), ziel, 0.05)) return positionen
  const ohneEine = bema.map((weg) => bema.filter((p) => p !== weg)).find((rest) => gleich(summe(rest), ziel, 0.05))
  const neu: Position[] = ohneEine ?? (ziel > 0
    ? [{ id: `${BLATT}BEMA`, ebene: 'BEMA', nr: '', zahn: '', anzahl: 1, preis: ziel, text: 'Zahnärztliches Honorar BEMA laut Blatt', auto: false }]
    : [])
  return [...neu, ...positionen.filter((p) => p.ebene !== 'BEMA')]
}

/** Legt die Zeilen und Summen des Blatts in den Plan und merkt sich den Stand als Original. */
export function blattUebernehmen(
  plan: HkpPlan, listen: Listen, gebuehren: ProbeGebuehr[], summen: ProbeSummen,
): { plan: HkpPlan; original: BlattStand | null; hinweise: string[] } {
  const hinweise: string[] = []
  const goz = gebuehren.filter((p) => p.ebene === 'GOZ' && p.nr.trim())
  const labor = gebuehren.filter((p) => (p.ebene === 'BEL' || p.ebene === 'BEB') && p.nr.trim())
  const laborZiel = summen.laborBeleg ?? summen.labor
  const hatSummen = [summen.honorarGoz, summen.gesamt, summen.eigenanteil, laborZiel].some((n) => n !== undefined)
  if (!goz.length && !labor.length && !hatSummen) {
    return { plan, original: null, hinweise: ['Vom Blatt sind keine Beträge gelesen (nur Teil 1): Die Zahlen sind von PlanR gerechnet. Für die Originalzahlen Teil 2 und den Eigenlaborbeleg mit hochladen.'] }
  }

  const betraege: Record<string, number> = {}
  const mwst = plan.einstellungen.mwstLabor
  let einstellungen = plan.einstellungen
  let positionen = plan.positionen.filter((p) => !vomBlatt(p))

  if (goz.length) positionen = [...positionen.filter((p) => p.ebene !== 'GOZ'), ...gozVomBlatt(plan, listen, goz, betraege)]
  else if (summen.honorarGoz !== undefined) hinweise.push('GOZ-Zeilen von Teil 2 sind nicht gelesen: Die einzelnen GOZ-Positionen sind von PlanR gerechnet, die Summe steht wie auf dem Blatt.')

  const istLabor = (p: Position) => p.ebene === 'BEL' || p.ebene === 'BEB' || p.ebene === 'MAT'
  if (labor.length) {
    const art: Labor = summen.laborBeleg !== undefined || plan.einstellungen.labor === 'praxis' ? 'eigen' : 'fremd'
    const zeilen = laborVomBlatt(plan, listen, labor, art, betraege)
    positionen = [...positionen.filter((p) => !istLabor(p)), ...zeilen]
    if (laborZiel !== undefined) {
      einstellungen = { ...einstellungen, mwstLabor: 0 }
      const rest = runden(laborZiel - labor.reduce((s, z) => s + (z.betrag ?? 0) * (z.anzahl && z.anzahl > 0 ? z.anzahl : 1), 0))
      if (rest > 0.005) {
        const id = `${BLATT}MAT-rest`
        betraege[id] = rest
        positionen = [...positionen, { id, ebene: 'MAT', nr: '', zahn: '', anzahl: 1, preis: rest, text: 'Übrige Posten laut Beleg (Material, MwSt.)', labor: art, auto: false }]
      } else if (rest < -0.005) {
        hinweise.push('Die gelesenen Laborzeilen ergeben mehr als die Summe auf dem Beleg. Bitte die Laborzeilen gegenlesen.')
      }
    }
  } else if (laborZiel !== undefined) {
    einstellungen = { ...einstellungen, mwstLabor: 0 }
    positionen = positionen.filter((p) => !istLabor(p))
    if (laborZiel > 0) {
      const id = `${BLATT}MAT-summe`
      betraege[id] = laborZiel
      positionen = [...positionen, { id, ebene: 'MAT', nr: '', zahn: '', anzahl: 1, preis: laborZiel, text: 'Material- und Laborkosten laut Blatt', auto: false }]
      hinweise.push('Eigenlaborbeleg bzw. Laborrechnung ist nicht dabei: Die Laborkosten stehen als eine Summe vom Blatt.')
    }
  }

  // Teil 2 weist mehr Labor aus als der Eigenbeleg: der Rest ist Fremdlabor (Kostenvoranschlag liegt nicht bei).
  if (summen.laborBeleg !== undefined && summen.labor !== undefined) {
    const fremd = runden(summen.labor - summen.laborBeleg)
    if (fremd > 1) {
      const id = `${BLATT}MAT-fremd`
      betraege[id] = fremd
      positionen = [...positionen, { id, ebene: 'MAT', nr: '', zahn: '', anzahl: 1, preis: fremd, text: 'Fremdlabor laut Teil 2 (ohne Beleg)', labor: 'fremd', auto: false }]
      hinweise.push('Teil 2 weist mehr Laborkosten aus als der Eigenlaborbeleg. Der Rest steht als Fremdlabor in einer Summe.')
    }
  }

  const mitEinstellungen = { ...plan, einstellungen }
  if (summen.honorarBema !== undefined) positionen = bemaVomBlatt(mitEinstellungen, listen, positionen, summen.honorarBema)

  const neu: HkpPlan = { ...mitEinstellungen, positionen }
  return { plan: neu, original: { plan: neu, summen, betraege, mwst, schluessel: planSchluessel(neu) }, hinweise }
}

/** Ergebnis im Originalzustand: Zeilenbeträge und Summen exakt wie auf dem Blatt. */
export function originalErgebnis(e: Ergebnis, o: BlattStand): Ergebnis {
  const s = o.summen
  const positionen = e.positionen.map((p) => {
    const betrag = o.betraege[p.id]
    return betrag === undefined ? p : { ...p, betrag, einzelpreis: runden(betrag / (p.anzahl || 1)) }
  })
  const fest = s.festzuschuss
  const voll = s.festzuschussVoll
  return {
    ...e,
    positionen,
    summen: {
      ...e.summen,
      ...(s.honorarBema !== undefined ? { bemaHonorar: s.honorarBema } : {}),
      ...(s.honorarGoz !== undefined ? { gozHonorar: s.honorarGoz } : {}),
      ...(s.labor !== undefined ? { materialUndLabor: s.labor } : {}),
      ...(s.gesamt !== undefined ? { gesamt: s.gesamt } : {}),
      ...(fest !== undefined ? { festzuschuss: fest, kassenanteil: fest } : {}),
      ...(voll !== undefined ? { festzuschuss100: voll } : {}),
      ...(s.eigenanteil !== undefined ? { eigenanteil: s.eigenanteil } : {}),
      ...(fest !== undefined && voll !== undefined ? { eigenanteilRegel: runden(voll - fest) } : {}),
    },
  }
}

/** Vor einem Lauf der Regelengine: Die Zeilen vom Blatt gehen raus, PlanR plant Honorar und Labor selbst. */
export function ohneBlatt(plan: HkpPlan, o: BlattStand | null): HkpPlan {
  if (!o || !plan.positionen.some(vomBlatt)) return plan
  return { ...plan, positionen: plan.positionen.filter((p) => !vomBlatt(p)), einstellungen: { ...plan.einstellungen, mwstLabor: o.mwst } }
}

import type { Einstellungen, Plan, Position } from './types'
import { kalkulieren, positionen } from './engine/berechnung'
import { runden } from './engine/listen'
import { neuerPlan } from './planNeu'

/** Zeile eines eingelesenen Kostenvoranschlags, wie die Probe-Seite sie schickt. */
export interface BlattZeile {
  ebene?: string
  nr?: string
  zahn?: string
  anzahl?: number
  faktor?: number
  /** Betrag der ganzen Zeile, beim Material einschließlich Mehrwertsteuer */
  betrag?: number
  text?: string
  analog?: boolean
  sitzung?: number
}

export interface BlattSchema { B?: Record<string, string>; TP?: Record<string, string> }

/** Stück und Einzelpreis, die zusammen genau den Zeilenbetrag ergeben. Geht die Teilung nicht auf, steht die Menge im Text. */
function teilen(betrag: number, anzahl: number, text: string): { anzahl: number; preis: number; text: string } {
  const einzel = runden(betrag / anzahl)
  if (runden(einzel * anzahl) === runden(betrag)) return { anzahl, preis: einzel, text }
  return { anzahl: 1, preis: runden(betrag), text: text ? `${text}, ${anzahl} Stück` : `${anzahl} Stück` }
}

/** GOZ 9010 ist die Implantatinsertion: ihre Zähne sind die geplanten Implantate. */
const IMPLANTAT_SETZEN = '9010'

/**
 * Trägt die Implantate des Blatts als Planung ins Zahnschema ein, ohne dass der Planer dafür eigene Zeilen rechnet.
 * Die Leistungen stehen schon als Zeilen vom Blatt im Plan. Was der Planer aus der Planung dazu erzeugen würde, wird abgewählt.
 * Sonst stünde jede Leistung doppelt im Kostenvoranschlag.
 */
export function planungEintragen(plan: Plan, einst: Einstellungen): Plan {
  const zaehne = { ...plan.zaehne }
  for (const p of plan.manuell) {
    if (p.ebene !== 'GOZ' || p.nr !== IMPLANTAT_SETZEN) continue
    for (const teil of p.zahn.split(',')) {
      const zahn = teil.trim()
      const nummer = Number(zahn)
      if (zahn.length !== 2 || !Number.isInteger(nummer) || nummer < 11 || nummer > 48) continue
      if (zaehne[zahn]?.TP) continue
      zaehne[zahn] = { B: zaehne[zahn]?.B ?? '', TP: 'I' }
    }
  }
  const mit: Plan = { ...plan, zaehne }
  const eigene = new Set(mit.manuell.map((p) => p.id))
  const erzeugt = positionen({ ...mit, entfernt: [] }, einst).positionen.filter((p) => !eigene.has(p.id)).map((p) => p.id)
  return { ...mit, entfernt: [...new Set([...mit.entfernt, ...erzeugt])] }
}

/**
 * Baut aus einem eingelesenen privaten Implantat-Kostenvoranschlag einen Plan, der dieselben Beträge ergibt.
 * Der Befund kommt ins Zahnschema, jede Zeile wird eine eigene Position in ihrer Sitzung.
 * Kennt das Gebührenverzeichnis Ziffer und Faktor und kommt auf denselben Betrag, bleibt die Zeile ohne festen Preis
 * und folgt damit dem Verzeichnis. Sonst gilt der Betrag vom Blatt.
 * Material steht auf dem Blatt brutto, im Plan netto mit Mehrwertsteuer darunter.
 */
export function planAusBlatt(nummer: number, schema: BlattSchema, zeilen: BlattZeile[], einst: Einstellungen): Plan {
  const zaehne: Plan['zaehne'] = {}
  for (const [zahn, befund] of Object.entries(schema.B ?? {})) zaehne[zahn] = { B: befund.toLowerCase(), TP: schema.TP?.[zahn] ?? '' }

  const manuell: Position[] = []
  const soll = new Map<string, number>()
  const material: { position: Position; brutto: number }[] = []
  for (const [i, z] of zeilen.entries()) {
    const ebene = z.ebene === 'GOZ' ? 'GOZ' : z.ebene === 'GOÄ' || z.ebene === 'GOAE' ? 'GOAE' : z.ebene === 'MAT' ? 'MAT' : z.ebene === 'BEB' ? 'BEB' : null
    if (!ebene) continue
    const anzahl = z.anzahl && z.anzahl > 0 ? z.anzahl : 1
    const grund: Position = { id: `blatt-${i}`, ebene, nr: z.nr ?? '', zahn: z.zahn ?? '', anzahl, auto: false, ...(z.sitzung ? { sitzung: z.sitzung } : {}) }
    if (ebene === 'MAT') {
      const brutto = z.betrag ?? 0
      const netto = teilen(runden(brutto / (1 + einst.mwst / 100)), anzahl, z.text ?? 'Material')
      const position: Position = { ...grund, ...netto, material: true }
      material.push({ position, brutto })
      manuell.push(position)
      continue
    }
    if (ebene === 'BEB') {
      manuell.push({ ...grund, ...(z.betrag !== undefined ? { preis: z.betrag } : {}), ...(z.text ? { text: z.text } : {}) })
      continue
    }
    const faktor = z.faktor ? { faktor: z.faktor } : {}
    if (z.analog && z.betrag !== undefined) {
      const fest = teilen(z.betrag, anzahl, z.text ?? '')
      manuell.push({ ...grund, ...faktor, anzahl: fest.anzahl, preis: fest.preis, text: fest.text, analog: true, basisEbene: ebene, analogText: fest.text })
      continue
    }
    manuell.push({ ...grund, ...faktor })
    if (z.betrag !== undefined) soll.set(grund.id, z.betrag)
  }

  const plan: Plan = {
    ...neuerPlan(nummer),
    zaehne,
    manuell,
    global: { ...neuerPlan(nummer).global, bildgebung: 'keine' },
    // Nichts dazurechnen: der Plan soll zuerst genau das Blatt zeigen.
    regler: { ...neuerPlan(nummer).regler, begleitStufe: 0, analogStufe: 0, analogBewertung: 0, gozFaktor: einst.gozFaktor, goaeFaktor: einst.goaeFaktor, schabloneStufe: 0, laborAufschlag: 0 },
  }

  // Gegenprobe am Verzeichnis: wo der Planer auf einen anderen Betrag käme, gilt der Preis vom Blatt.
  const gerechnet = kalkulieren(plan, einst)
  const ist = new Map([...gerechnet.honorarGoz, ...gerechnet.honorarGoae].map((z) => [z.id, z.betrag]))
  for (const p of manuell) {
    const betrag = soll.get(p.id)
    if (betrag === undefined || ist.get(p.id) === betrag) continue
    const quelle = zeilen[Number(p.id.slice('blatt-'.length))]
    const fest = teilen(betrag, p.anzahl, quelle.text ?? '')
    p.anzahl = fest.anzahl
    p.preis = fest.preis
    if (fest.text) p.text = fest.text
  }

  // Material: netto je Zeile gerundet kann um Cent neben der Bruttosumme des Blatts liegen. Die letzte Zeile gleicht aus.
  if (material.length) {
    const brutto = runden(material.reduce((s, m) => s + m.brutto, 0))
    const netto = () => runden(material.reduce((s, m) => s + runden((m.position.preis ?? 0) * m.position.anzahl), 0))
    const mit = (n: number) => runden(n + runden(n * einst.mwst / 100))
    for (let schritt = 0; schritt < 5 && mit(netto()) !== brutto; schritt++) {
      const letzte = material[material.length - 1].position
      const zeile = runden((letzte.preis ?? 0) * letzte.anzahl)
      const neu = runden(zeile + (mit(netto()) < brutto ? 0.01 : -0.01))
      if (letzte.anzahl > 1) letzte.text = `${letzte.text ?? 'Material'}, ${letzte.anzahl} Stück`
      letzte.anzahl = 1
      letzte.preis = neu
    }
  }
  return planungEintragen(plan, einst)
}

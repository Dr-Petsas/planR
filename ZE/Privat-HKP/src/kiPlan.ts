/** Der private Zahnersatzplan für die KI-Zeile und das Prüfmodul: lesen, Schalter setzen, Positionen ändern. */
import type { Einstellungen, Plan } from './types'
import { kalkulieren, positionen, type Kalkulation } from './engine/berechnung'
import { kronenEinheiten, werkstoffVon, WERKSTOFFE, WERKSTOFFE_FUER, type KronenEinheit, type Werkstoff } from './engine/material'
import { BEFUND_KUERZEL, OBERKIEFER, PLANUNG_KUERZEL, UNTERKIEFER } from './engine/zahnschema'
import { freiAnwenden, kiDienst, zahnText, zielSchalter, zielSetzen, type KiZiel, type KiPosition, type KiSchalter, type KiSchritt, type KiZahnFeld, type KiZahnWerte, type PlanBlick, type PlanKiDienst } from './planKi'

export function kiZeilen(kalk: Kalkulation): KiPosition[] {
  return [...kalk.honorar, ...kalk.labor, ...kalk.material].map((z) => ({
    id: z.id, ebene: z.ebene, nr: z.nr, zahn: z.zahn, anzahl: z.anzahl,
    ...(z.faktor !== undefined ? { faktor: z.faktor } : {}),
    einzel: z.einzel, betrag: z.betrag, text: z.text,
    ...(z.auto ? { auto: true } : {}),
    ...(z.begruendung ? { begruendung: z.begruendung } : {}),
  }))
}

const ABFORMUNG = ['', 'scan', 'abdruck']
const WERKSTOFF_NAMEN = Object.keys(WERKSTOFFE) as Werkstoff[]

/** Einheiten mit Kronenmaterial, wie die Karte »Kronenmaterial« der Seite sie zeigt. */
const einheitenVon = (plan: Plan): KronenEinheit[] => kronenEinheiten(positionen(plan).positionen.filter((p) => p.ebene === 'BEB'))

const zielVon = (einst: Einstellungen): KiZiel<Plan> => ({
  was: 'GOZ-Faktor', gesamt: (p) => kalkulieren(p, einst).gesamt,
  lesen: (p) => (p.regler.gozFaktor > 0 ? p.regler.gozFaktor : einst.gozFaktor),
  setzen: (p, f) => ({ ...p, regler: { ...p.regler, gozFaktor: f <= einst.gozFaktor ? 0 : f } }),
  von: einst.gozFaktor,
})

function schalter(plan: Plan): KiSchalter[] {
  const einheiten = einheitenVon(plan)
  const stoffe = [...new Set(einheiten.map((e) => werkstoffVon(e, plan.werkstoffe ?? {}).werkstoff))]
  const alle = einheiten.length > 0 && einheiten.every((e) => werkstoffVon(e, plan.werkstoffe ?? {}).gewaehlt)
  return [
    ...(einheiten.length ? [{ name: 'kronenmaterial', text: 'Kronenmaterial für ALLE Einheiten des Plans, zu denen es passt (leer = gemischt oder noch nicht gewählt; ein einzelner Zahn geht über das Zahnfeld werkstoff)', wert: alle && stoffe.length === 1 ? stoffe[0] : '', werte: WERKSTOFF_NAMEN as string[] }] : []),
    { name: 'abformung', text: 'Abformung der präparierten Zähne (scan = Intraoralscan, abdruck = konventionell)', wert: plan.abformung ?? '', werte: ABFORMUNG },
    { name: 'abformungProthese', text: 'zweite Abformung für den herausnehmbaren Teil', wert: plan.abformungProthese ?? '', werte: ABFORMUNG },
    { name: 'implantat.loeffel', text: 'Löffel bei Implantatabformung', wert: plan.implantat.loeffel, werte: ['geschlossen', 'offen'] },
    { name: 'implantat.abutment', text: 'Abutment auf Implantaten', wert: plan.implantat.abutment, werte: ['standard', 'individuell', 'keramik'] },
    { name: 'bemerkung', text: 'Bemerkung auf dem Plan (freier Text)', wert: plan.bemerkung ?? '' },
    { name: 'bruecke', text: 'Brücke "von A auf B" in EINEM Schritt, statt einzelner Zahn-Schritte. Wert: beide Pfeilerzähne mit Bindestrich, z. B. "14-16"; nur wenn der Arzt die Ausführung nennt, dahinter K (Metall), KV (verblendet) oder KM (vollkeramisch), z. B. "14-16 KM"', wert: '' },
  ]
}

const GLIED: Record<string, string> = { K: 'B', KV: 'BV', KM: 'BM' }
const LUECKE = ['f', 'x', 'b', 'bw', 'e', 'ew']

/** Die Zähne der Spanne in Kieferreihenfolge; leer, wenn die Angabe keine Spanne in einem Kiefer ist. */
function brueckeReihe(wert: string): string[] {
  const [a = '', b = ''] = (wert.trim().split(' ')[0] ?? '').split('-').map((x) => x.trim())
  const kiefer = [OBERKIEFER, UNTERKIEFER].find((k) => k.includes(a) && k.includes(b))
  if (!kiefer || a === b) return []
  const [von, bis] = [kiefer.indexOf(a), kiefer.indexOf(b)].sort((x, y) => x - y)
  return kiefer.slice(von, bis + 1)
}

/** Brücke über eine Spanne: Endzähne werden Pfeiler, alles dazwischen Brückenglied; eine Ausführung für die ganze Brücke. */
export function brueckeSetzen(plan: Plan, wert: string): { plan: Plan; text: string } | string {
  const [spanne = '', art = ''] = wert.trim().split(' ').filter(Boolean)
  const reihe = brueckeReihe(spanne)
  if (!reihe.length) return 'Für die Brücke brauche ich zwei Pfeilerzähne im selben Kiefer, zum Beispiel 14 und 16.'
  if (reihe.length < 3) return `Zwischen ${reihe[0]} und ${reihe[reihe.length - 1]} liegt kein Zahn: dort gibt es nichts zu überbrücken.`
  const pfeiler = [reihe[0], reihe[reihe.length - 1]]
  for (const z of pfeiler) if (LUECKE.includes(plan.zaehne[z]?.B ?? '')) return `Zahn ${z} fehlt laut Befund und kann kein Brückenpfeiler sein.`
  const klasse = art.toUpperCase()
  if (klasse && !GLIED[klasse]) return 'Als Ausführung der Brücke kenne ich K (Metall), KV (vestibulär verblendet) und KM (vollkeramisch / vollverblendet).'
  const k = klasse || pfeiler.map((z) => plan.zaehne[z]?.TP ?? '').find((tp) => GLIED[tp]) || 'KM'
  const zaehne = { ...plan.zaehne }
  const werkstoffe = { ...(plan.werkstoffe ?? {}) }
  for (const z of reihe) {
    const alt = zaehne[z] ?? { B: '', TP: '' }
    const tp = pfeiler.includes(z) ? k : GLIED[k]
    if (alt.TP !== tp) delete werkstoffe[z]
    zaehne[z] = { B: pfeiler.includes(z) ? alt.B : (LUECKE.includes(alt.B) ? alt.B : 'f'), TP: tp }
  }
  const mitte = reihe.slice(1, -1)
  return { plan: { ...plan, zaehne, werkstoffe }, text: `Brücke ${reihe[0]}–${reihe[reihe.length - 1]}: Pfeiler ${pfeiler.join(' und ')} (${k}), Brückenglied ${mitte.join(', ')} (${GLIED[k]})` }
}

export const ZAHNFELDER: KiZahnFeld[] = [
  { name: 'befund', text: 'Befund (Zeile B, Kleinbuchstaben)', werte: { '': 'leer, kein Befund', ...BEFUND_KUERZEL } },
  { name: 'planung', text: 'Planung (Zeile TP, Großbuchstaben)', werte: { '': 'leer, nichts geplant', ...PLANUNG_KUERZEL } },
  { name: 'brueckeAnfang', text: 'Brückenanfang von Hand an diesem Zahn festlegen; nur nötig, wenn die Brücke sich nicht aus Pfeilern und Gliedern ergibt', ja: true },
  { name: 'brueckeEnde', text: 'Brückenende von Hand an diesem Zahn festlegen; nur nötig, wenn die Brücke sich nicht aus Pfeilern und Gliedern ergibt', ja: true },
  {
    name: 'werkstoff', text: 'Kronenmaterial dieses Zahns (nur angeben, wenn der Arzt ein Material nennt; ob Metall oder Keramik passt, legt die Planung des Zahns fest)',
    werte: Object.fromEntries(Object.entries(WERKSTOFFE).map(([k, w]) => [k, w.titel])),
  },
]

/** Trägt Befund und Planung eines Zahns ein wie das Zahnschema der Seite; die Positionen rechnet der Planer daraus neu. */
export function zahnSetzen(plan: Plan, zahn: string, w: KiZahnWerte): { plan: Plan; text: string } | string {
  const alt = plan.zaehne[zahn] ?? { B: '', TP: '' }
  const neu = {
    ...alt,
    ...(w.befund !== undefined ? { B: String(w.befund) } : {}),
    ...(w.planung !== undefined ? { TP: String(w.planung) } : {}),
    ...(w.brueckeAnfang !== undefined ? { bAnfang: !!w.brueckeAnfang } : {}),
    ...(w.brueckeEnde !== undefined ? { bEnde: !!w.brueckeEnde } : {}),
  }
  if (!neu.TP) { neu.bAnfang = false; neu.bEnde = false }
  const gleich = neu.B === alt.B && neu.TP === alt.TP && !!neu.bAnfang === !!alt.bAnfang && !!neu.bEnde === !!alt.bEnde
  if (gleich && w.werkstoff === undefined) return `Zahn ${zahn} steht schon so im Zahnschema.`
  const zaehne = { ...plan.zaehne }
  if (!neu.B && !neu.TP) delete zaehne[zahn]
  else zaehne[zahn] = neu
  let p: Plan = gleich ? plan : { ...plan, zaehne }
  // Wer die Planung herausnimmt, scheitert nicht an einem mitgeschickten Material: ohne Einheit gibt es keins.
  if (!neu.TP && !gleich) {
    const werkstoffe = { ...(p.werkstoffe ?? {}) }
    delete werkstoffe[zahn]
    const { werkstoff: _, ...rest } = w
    return { plan: { ...p, werkstoffe }, text: zahnText(ZAHNFELDER, zahn, rest) }
  }
  if (w.werkstoff !== undefined) {
    // Erst mit der (neuen) Planung steht fest, welche Einheit der Zahn trägt.
    const stoff = String(w.werkstoff) as Werkstoff
    const e = einheitenVon(p).find((x) => x.zahn === zahn)
    if (!e) return `Zahn ${zahn} trägt in diesem Plan keine Krone, kein Brückenglied und kein Teleskop. Ein Kronenmaterial lässt sich dort nicht wählen.`
    if (!WERKSTOFFE_FUER[e.art].includes(stoff)) {
      return `Zahn ${zahn}: ${WERKSTOFFE[stoff].titel} passt nicht zu der dort geplanten Einheit (${e.art === 'metall' ? 'Metall' : 'Keramik'}); möglich sind ${WERKSTOFFE_FUER[e.art].map((x) => WERKSTOFFE[x].kurz).join(', ')}. Für ein anderes Material zuerst die Planung des Zahns ändern.`
    }
    if (gleich && plan.werkstoffe?.[zahn] === stoff) return `Zahn ${zahn} hat schon ${WERKSTOFFE[stoff].titel}.`
    p = { ...p, werkstoffe: { ...(p.werkstoffe ?? {}), [zahn]: stoff } }
  }
  return { plan: p, text: zahnText(ZAHNFELDER, zahn, w) }
}

export function zeBlick(plan: Plan, einst: Einstellungen, gesperrt: boolean): PlanBlick {
  const kalk = kalkulieren(plan, einst)
  const zaehne = Object.entries(plan.zaehne).filter(([, z]) => z.B || z.TP)
    .map(([nr, z]) => `${nr}: ${z.B ? `Befund ${z.B}` : ''}${z.B && z.TP ? ', ' : ''}${z.TP ? `Planung ${z.bAnfang ? '-' : ''}${z.TP}${z.bEnde ? '-' : ''}` : ''}`)
  return {
    planart: 'privat-hkp', name: 'privater Zahnersatz (Kostenvoranschlag: GOZ, BEB-Labor, Material)',
    nummer: plan.nummer, gesperrt,
    kann: gesperrt ? [] : ['schalter', 'zahn', 'hinzu', 'setze', 'weg', 'zurueck'],
    ebenen: ['GOZ', 'BEB', 'MAT'],
    positionen: kiZeilen(kalk),
    summen: { honorar: kalk.summeHonorar, laborNetto: kalk.summeLaborNetto, mwst: kalk.mwst, material: kalk.summeMaterial, gesamt: kalk.gesamt },
    angaben: {
      zaehne: zaehne.join('; ') || 'im Zahnschema ist noch nichts eingetragen',
      kronenmaterial: einheitenVon(plan).map((x) => { const w = werkstoffVon(x, plan.werkstoffe ?? {}); return `${x.zahn}: ${WERKSTOFFE[w.werkstoff].kurz}${w.gewaehlt ? '' : ' (Vorgabe, noch nicht gewählt)'}` }).join('; ') || 'keine Einheit mit Kronenmaterial',
      faktor: `GOZ-Faktor des Plans ${plan.regler.gozFaktor > 0 ? plan.regler.gozFaktor : einst.gozFaktor}`,
      ...(kalk.nichtAngesetzt.length ? { nichtAngesetzt: kalk.nichtAngesetzt.join('; ') } : {}),
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    },
    schalter: [...schalter(plan), ...zielSchalter(plan, zielVon(einst))],
    zahnfelder: ZAHNFELDER,
    hinweise: [],
  }
}

function schalterSetzen(plan: Plan, name: string, wert: boolean | string | number): { plan: Plan; text: string } | string {
  const jetzt = schalter(plan).find((s) => s.name === name)
  if (!jetzt) return 'Diese Einstellung gibt es in diesem Plan nicht.'
  if (name === 'bruecke') return brueckeSetzen(plan, String(wert))
  if (name === 'bemerkung') {
    const neu = String(wert).trim().slice(0, 600)
    if (neu === (plan.bemerkung ?? '')) return 'Die Bemerkung steht schon so im Plan.'
    return { plan: { ...plan, bemerkung: neu }, text: neu ? `Bemerkung: ${neu}` : 'Bemerkung gelöscht' }
  }
  if (typeof wert !== 'string' || !jetzt.werte?.includes(wert)) return `${jetzt.text}: diesen Wert kenne ich nicht.`
  if (jetzt.wert === wert) return `${jetzt.text} ist schon so eingestellt.`
  const text = `${jetzt.text.split(' (')[0]}: ${wert || 'ohne'}`
  if (name === 'kronenmaterial') {
    const stoff = wert as Werkstoff
    const passend = einheitenVon(plan).filter((e) => WERKSTOFFE_FUER[e.art].includes(stoff))
    if (!passend.length) return `${WERKSTOFFE[stoff].titel} passt zu keiner Einheit dieses Plans. Für ein anderes Material zuerst die Planung der Zähne ändern.`
    const rest = einheitenVon(plan).length - passend.length
    return {
      plan: { ...plan, werkstoffe: { ...(plan.werkstoffe ?? {}), ...Object.fromEntries(passend.map((e) => [e.zahn, stoff])) } },
      text: `Kronenmaterial ${WERKSTOFFE[stoff].titel} an ${passend.map((e) => e.zahn).join(', ')}${rest ? `; ${rest} Einheit${rest > 1 ? 'en' : ''} anderer Art bleib${rest > 1 ? 'en' : 't'}` : ''}`,
    }
  }
  if (name.startsWith('implantat.')) return { plan: { ...plan, implantat: { ...plan.implantat, [name.slice(10)]: wert } }, text }
  return { plan: { ...plan, [name]: wert }, text }
}

export function zeAnwenden(plan: Plan, einst: Einstellungen, schritte: KiSchritt[]): { plan: Plan; getan: string[]; nicht: string[] } {
  const vorher = kalkulieren(plan, einst)
  // Die Brücke plant ihre Spanne selbst: Zahn-Schritte für dieselben Zähne im selben Zug würden ihr Befunde wegnehmen.
  const spannen = schritte.flatMap((s) => (s.op === 'schalter' && s.name === 'bruecke' ? [brueckeReihe(String(s.wert))] : []))
  schritte = schritte.filter((s) => !(s.op === 'zahn' && spannen.some((r) => r.includes(s.zahn))))
  const r = freiAnwenden(plan, schritte, kiZeilen(vorher), { ebenen: ['GOZ', 'BEB', 'MAT'], maxFaktor: 3.5, schalter: (p, name, wert) => (name === 'zielbetrag' ? zielSetzen(p, zielVon(einst), wert) : schalterSetzen(p, name, wert)), zahnfelder: () => ZAHNFELDER, zahn: zahnSetzen })
  let neu = r.plan
  let kalk = kalkulieren(neu, einst)
  const alt = new Set(plan.manuell.map((m) => m.id))
  const leer = kiZeilen(kalk).filter((z) => !alt.has(z.id) && !z.auto && z.ebene === 'GOZ' && !(z.betrag > 0))
  if (leer.length) {
    const ids = new Set(leer.map((z) => z.id))
    neu = { ...neu, manuell: neu.manuell.filter((m) => !ids.has(m.id)) }
    kalk = kalkulieren(neu, einst)
    for (const z of leer) {
      r.getan = r.getan.filter((g) => !g.startsWith(`GOZ ${z.nr} `) && !g.startsWith(`GOZ ${z.nr}(`))
      r.nicht.push(`GOZ ${z.nr} kennt die Gebührenliste dieses Planers nicht. Ich habe sie nicht eingetragen.`)
    }
  }
  const bekannt = new Set(vorher.hinweise)
  for (const h of new Set(kalk.hinweise)) if (!bekannt.has(h)) r.nicht.push(`Hinweis der Rechnung: ${h}`)
  return { plan: neu, getan: r.getan, nicht: r.nicht }
}

export function zeKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  return kiDienst<Plan>({
    lesen,
    schreiben,
    blick: (plan, gesperrt) => zeBlick(plan, lesen().einst, gesperrt),
    anwenden: (plan, schritte) => zeAnwenden(plan, lesen().einst, schritte),
    gesamt: (plan) => kalkulieren(plan, lesen().einst).gesamt,
  })
}

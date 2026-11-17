/** Der private Kons-/Endo-Plan für die KI-Zeile und das Prüfmodul. */
import type { Einstellungen, FreiePosition, Plan, Rechnung, Therapie, ZahnLeistung } from './types'
import { THERAPIE, THERAPIEN, ZUSAETZE } from './data/katalog'
import { standardLeistung, ZIFFER } from './components/Zahnschema'
import { rechnen, zusaetzeFuer, zusatzUmschalten } from './engine/kons'
import { feldSetzen, felderSchalter, listenDienst, listenZeilen, zahnText, zielSchalter, zielSetzen, type KiFeld, type KiZiel, type KiPosition, type KiZahnFeld, type KiZahnWerte, type PlanKiDienst } from './planKi'

type Frei = FreiePosition & { id: string }
const ebene = (e: string) => (e === 'ANALOG' ? 'GOZ' : e)

export function kiZeilen(r: Rechnung, plan: Plan): KiPosition[] {
  const frei = new Set(plan.frei.map((f) => f.key))
  const feste = listenZeilen([...r.zaehne.flatMap((z) => z.zeilen), ...r.begleit], { ebene: (z) => ebene(z.ebene ?? 'GOZ') })
  return [...feste, ...r.frei.map((z) => ({ ...listenZeilen([{ ...z, id: z.zusatz }], { ebene: () => 'GOZ' })[0], auto: !frei.has(z.zusatz ?? '') || undefined }))]
}

const ZUSATZ_NAMEN = Object.fromEntries(ZUSAETZE.map((z) => [z.id, z.titel]))

/** Regler und Angaben des Plans, wie sie in der Leiste links stehen. */
export const FELDER: KiFeld<Plan>[] = [
  { name: 'regler.faktor', text: 'GOZ-Faktor aller Leistungen', von: 1, bis: 5, lesen: (p) => p.regler.faktor, setzen: (p, w: number) => ({ ...p, regler: { ...p.regler, faktor: w } }) },
  { name: 'regler.stufe', text: 'Umfang der Zusatzleistungen: 0 nur Grundleistung, 1 Standard, 2 erweitert, 3 mit Analogleistungen', von: 0, bis: 3, lesen: (p) => p.regler.stufe, setzen: (p, w: number) => ({ ...p, regler: { ...p.regler, stufe: Math.round(w) } }) },
  { name: 'regler.materialKlasse', text: 'Preisklasse für Labor und Material: 0 günstig, 1 Standard, 2 hochwertig', von: 0, bis: 2, lesen: (p) => p.regler.materialKlasse, setzen: (p, w: number) => ({ ...p, regler: { ...p.regler, materialKlasse: Math.round(w) } }) },
  { name: 'behandlungstage', text: 'Behandlungstage für die Zuschläge 0110/0120; 0 = der Planer zählt selbst', von: 0, bis: 20, lesen: (p) => p.behandlungstage, setzen: (p, w: number) => ({ ...p, behandlungstage: Math.round(w) }) },
  { name: 'vereinbarung', text: 'Art der Vereinbarung (pkv = Privatpatient, gkvPrivat = Kassenpatient ganz privat, gkvZusatz = Kassenpatient mit privaten Zusatzleistungen neben der Kassenleistung)', werte: ['pkv', 'gkvPrivat', 'gkvZusatz'], lesen: (p) => p.vereinbarung, setzen: (p, w: Plan['vereinbarung']) => ({ ...p, vereinbarung: w }) },
  { name: 'abformung', text: 'Abformung für Inlays (abdruck = konventionell, scan = Intraoralscan)', werte: ['abdruck', 'scan'], lesen: (p) => p.abformung ?? '', setzen: (p, w: NonNullable<Plan['abformung']>) => ({ ...p, abformung: w }), da: (p) => Object.values(p.zaehne).some((z) => z.therapie === 'inlay') },
  { name: 'bemerkung', text: 'Bemerkung auf dem Plan (freier Text)', lesen: (p) => p.bemerkung ?? '', setzen: (p, w: string) => ({ ...p, bemerkung: w }) },
]

export const ZAHNFELDER: KiZahnFeld[] = [
  { name: 'therapie', text: 'Therapie an diesem Zahn', werte: { '': 'Zahn aus dem Plan nehmen', ...Object.fromEntries(THERAPIEN.map((t) => [t.id, t.titel])) } },
  { name: 'flaechen', text: 'Flächen (Komposit bis 5, Inlay, Goldhämmer und Veneer bis 3)', von: 1, bis: 5 },
  { name: 'kanaele', text: 'Wurzelkanäle (Endo, Revision)', von: 1, bis: 5 },
  { name: 'sitzungen', text: 'Sitzungen (Endo, Revision, Inlay, Bleaching)', von: 1, bis: 6 },
  { name: 'vital', text: 'Endo an vitaler Pulpa (nein = avital)', ja: true },
  { name: 'vitalArt', text: 'Art der Vitalerhaltung', werte: { indirekt: 'indirekte Überkappung', direkt: 'direkte Überkappung', pulpotomie: 'Pulpotomie' } },
  { name: 'aufbauStift', text: 'Aufbau mit Glasfaserstift (nein = plastisch)', ja: true },
  { name: 'faktor', text: 'eigener GOZ-Faktor für diesen Zahn', von: 1, bis: 3.5 },
  { name: 'zusatzDazu', text: 'Zusatzleistung an diesem Zahn dazunehmen (wie der Chip auf der Zahnkarte; je Schritt eine)', werte: ZUSATZ_NAMEN },
  { name: 'zusatzWeg', text: 'Zusatzleistung an diesem Zahn abwählen (je Schritt eine)', werte: ZUSATZ_NAMEN },
]
/** Welche Angaben zu welcher Therapie gehören. */
const PASST: Record<string, Therapie[]> = {
  flaechen: ['komposit', 'inlay', 'goldhaemmer', 'veneer'],
  kanaele: ['endo', 'revision'],
  sitzungen: ['endo', 'revision', 'inlay', 'bleaching'],
  vital: ['endo'],
  vitalArt: ['vital'],
  aufbauStift: ['aufbau'],
}

/** Trägt die Therapie eines Zahns ein wie Zahnschema und Zahnkarte; die Zeilen rechnet der Planer daraus neu. */
export function zahnSetzen(plan: Plan, zahn: string, w: KiZahnWerte): { plan: Plan; text: string } | string {
  const alt = plan.zaehne[zahn]
  const zaehne = { ...plan.zaehne }
  if (w.therapie === '') {
    if (!alt) return `Zahn ${zahn} ist nicht im Plan.`
    delete zaehne[zahn]
    return { plan: { ...plan, zaehne }, text: `Zahn ${zahn} aus dem Plan genommen` }
  }
  const therapie = (w.therapie as Therapie | undefined) ?? alt?.therapie
  if (!therapie) return `Zahn ${zahn} ist noch nicht im Plan. Dafür brauche ich die Therapie.`
  let neu: ZahnLeistung = alt?.therapie === therapie ? { ...alt } : standardLeistung(therapie, zahn)
  for (const [name, wert] of Object.entries(w)) {
    if (name === 'therapie') continue
    if (name === 'zusatzDazu' || name === 'zusatzWeg') {
      const stand = zusaetzeFuer(neu, plan).find((x) => x.zusatz.id === wert)
      if (!stand) return `Zahn ${zahn}: »${ZUSATZ_NAMEN[String(wert)] ?? wert}« gibt es bei »${THERAPIE[therapie].kurz}« in dieser Vereinbarung nicht.`
      if (stand.aktiv !== (name === 'zusatzWeg')) return `Zahn ${zahn}: »${stand.zusatz.titel}« ist schon ${stand.aktiv ? 'gewählt' : 'abgewählt'}.`
      neu = zusatzUmschalten(neu, stand)
      continue
    }
    if (PASST[name] && !PASST[name].includes(therapie)) return `Zahn ${zahn}: ${ZAHNFELDER.find((f) => f.name === name)?.text ?? name} gibt es bei »${THERAPIE[therapie].kurz}« nicht.`
    const max = name === 'flaechen' && therapie !== 'komposit' ? 3 : ZIFFER[therapie]?.feld === name ? ZIFFER[therapie]!.max : undefined
    if (max !== undefined && Number(wert) > max) return `Zahn ${zahn}: bei »${THERAPIE[therapie].kurz}« höchstens ${max}.`
    neu = { ...neu, [name]: wert }
  }
  if (alt && JSON.stringify(alt) === JSON.stringify(neu)) return `Zahn ${zahn} steht schon so im Plan.`
  zaehne[zahn] = neu
  return { plan: { ...plan, zaehne }, text: zahnText(ZAHNFELDER, zahn, w) }
}

const zusatzListe = (z: ZahnLeistung, plan: Plan) => {
  const an = zusaetzeFuer(z, plan).filter((x) => x.aktiv).map((x) => x.zusatz.id)
  return an.length ? `, Zusatzleistungen: ${an.join(', ')}` : ''
}

export function konsKi(lesen: () => { plan: Plan; gesperrt: boolean; einst: Einstellungen }, schreiben: (plan: Plan) => void): PlanKiDienst {
  const rechnung = (plan: Plan) => rechnen(plan, lesen().einst)
  const ziel: KiZiel<Plan> = { was: 'GOZ-Faktor', gesamt: (p) => rechnung(p).summe, lesen: (p) => p.regler.faktor, setzen: (p, f) => ({ ...p, regler: { ...p.regler, faktor: f } }) }
  return listenDienst<Plan, Frei>({
    planart: 'privat-kons', name: 'privater Plan Zahnerhaltung (Füllungen, Endodontie, Inlays nach GOZ)',
    ebenen: ['GOZ'], tarif: ['GOZ'], maxFaktor: 3.5,
    lesen, schreiben,
    zahnfelder: () => ZAHNFELDER, zahnSetzen,
    schalter: (plan) => [...felderSchalter(FELDER, plan), ...zielSchalter(plan, ziel)],
    schalterSetzen: (plan, name, wert) => (name === 'zielbetrag' ? zielSetzen(plan, ziel, wert) : feldSetzen(FELDER, plan, name, wert) ?? 'Diese Einstellung gibt es in diesem Plan gerade nicht.'),
    liste: (plan) => plan.frei.map((f) => ({ ...f, id: f.key })),
    mitListe: (plan, liste) => ({ ...plan, frei: liste.map(({ id, ...f }) => ({ ...f, key: id })) }),
    neu: (s, id) => ({ id, key: id, nr: s.nr, anzahl: s.anzahl || 1, faktor: s.faktor || lesen().plan.regler.faktor, ...(s.zahn ? { zahn: s.zahn } : {}) }),
    rechnen: (plan) => {
      const r = rechnung(plan)
      return { zeilen: kiZeilen(r, plan), summen: { gesamt: r.summe }, gesamt: r.summe }
    },
    angaben: (plan) => ({
      zaehne: Object.entries(plan.zaehne).map(([nr, z]) => `${nr}: ${z.therapie}${z.flaechen ? `, ${z.flaechen} Flächen` : ''}${z.kanaele ? `, ${z.kanaele} Kanäle` : ''}${zusatzListe(z, plan)}`).join('; ') || 'noch kein Zahn geplant',
      regler: `Faktor ${plan.regler.faktor}, Stufe ${plan.regler.stufe} (0 nur Grundleistung bis 3 mit Analogleistungen), Materialklasse ${plan.regler.materialKlasse}`,
      aufbau: 'Die Zeilen je Zahn errechnet der Planer aus Therapie, Reglern und Zusatzleistungen. Ich kann Zähne mit Therapie eintragen, ändern und herausnehmen, Zusatzleistungen je Zahn dazunehmen oder abwählen (Zahnfelder zusatzDazu und zusatzWeg), die Regler und Angaben aus SCHALTER setzen und GOZ-Positionen frei ergänzen.',
      ...(plan.bemerkung ? { bemerkung: plan.bemerkung.slice(0, 400) } : {}),
    }),
  })
}

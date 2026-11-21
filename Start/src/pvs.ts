/** Export eines HKP ins PVS über den lokalen pvsConnectoR. Mapping und Schreiben macht der Connector. */

/** PVS mit fertigem HKP-Connector; die Adresse kennt nur der Server der Übersicht */
export const PVS_CONNECTOR: Record<string, string> = {
  dens: 'http://127.0.0.1:8770',
  dampsoft: 'http://127.0.0.1:8766',
  'cgm-z1pro': 'http://127.0.0.1:8772',
}

/** PVS, in denen die Patientensuche sucht und ihre HKPs listet (Übernahme nur mit PVS_CONNECTOR) */
export const PVS_SUCHE: Record<string, string> = { ...PVS_CONNECTOR }
/** PVS, deren 01-Befund PlanR lesen und als geänderten Befund zurückschreiben kann */
export const PVS_BEFUND = new Set(['dampsoft', 'dens', 'cgm-z1pro'])
/** PVS, aus denen PlanR die genehmigten, noch nicht abgerechneten Pläne liest (Kontrollbuch) */
export const PVS_OFFEN = new Set(['dampsoft', 'dens', 'cgm-z1pro'])

export interface PvsTreffer {
  id: string
  firstName?: string
  lastName?: string
  birthDate?: string
}

export interface PlanPatient {
  vorname?: string
  name?: string
  geburtsdatum?: string
}

/** „TT.MM.JJJJ“ oder ISO → „JJJJ-MM-TT“, sonst '' */
export function datumIso(s: unknown): string {
  const t = String(s ?? '').trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  return de ? `${de[3]}-${de[2].padStart(2, '0')}-${de[1].padStart(2, '0')}` : ''
}

const gleich = (a: unknown, b: unknown) => {
  const n = (s: unknown) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de')
  return n(a) === n(b)
}

/**
 * Patient im PVS zum Plan: Vor- und Nachname exakt, Geburtsdatum muss passen, wenn der Plan eins hat.
 * Ohne eindeutigen Treffer wird nichts geschrieben.
 */
export function patientWaehlen(treffer: PvsTreffer[], p: PlanPatient, pvsName: string): { id?: string; fehler?: string } {
  const wer = `${p.vorname ?? ''} ${p.name ?? ''}`.trim()
  if (!p.name?.trim() || !p.vorname?.trim()) return { fehler: 'Im Plan fehlt Vor- oder Nachname des Patienten.' }
  const namen = treffer.filter((t) => gleich(t.firstName, p.vorname) && gleich(t.lastName, p.name))
  const geb = datumIso(p.geburtsdatum)
  const passend = geb ? namen.filter((t) => datumIso(t.birthDate) === geb) : namen
  if (passend.length === 1) return { id: passend[0].id }
  if (!namen.length) return { fehler: `${wer} gibt es in ${pvsName} nicht – Schreibweise prüfen oder den Patienten dort anlegen.` }
  if (!passend.length) return { fehler: `${wer} gibt es in ${pvsName}, aber mit anderem Geburtsdatum als im Plan.` }
  return {
    fehler: geb
      ? `${wer} gibt es in ${pvsName} ${passend.length}-mal mit gleichem Geburtsdatum – bitte dort zusammenführen.`
      : `${wer} gibt es in ${pvsName} ${passend.length}-mal – im Plan das Geburtsdatum eintragen.`,
  }
}

type Obj = Record<string, unknown>
const nur = (o: unknown, felder: string[]): Obj =>
  Object.fromEntries(felder.filter((f) => (o as Obj | undefined)?.[f] !== undefined).map((f) => [f, (o as Obj)[f]]))

const KIEFER: Record<string, string[]> = {
  OK: ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'],
  UK: ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'],
}
const PROTHESE_BEMA = /^9[6-8]/

/** Zähne, die eine Position betrifft: Einzelzahn, Liste, Spanne „34-36“, Kiefer nur bei Prothesenleistungen */
function zaehneDer(p: Obj): string[] {
  const out: string[] = []
  for (const teil of String(p.zahn ?? '').split(/[,\s]+/).filter(Boolean)) {
    const kiefer = KIEFER[teil.toUpperCase()]
    if (kiefer) {
      if (p.ebene === 'BEMA' && PROTHESE_BEMA.test(String(p.nr ?? ''))) out.push(...kiefer)
      continue
    }
    const [von, bis] = teil.split('-')
    const reihe = Object.values(KIEFER).find((k) => k.includes(von) && (!bis || k.includes(bis)))
    if (!reihe) continue
    const [a, b] = [reihe.indexOf(von), reihe.indexOf(bis ?? von)]
    out.push(...reihe.slice(Math.min(a, b), Math.max(a, b) + 1))
  }
  return out
}

/**
 * Zeile TP, wie sie auf dem HKP steht: leeres TP heißt Regelversorgung – aber nur an Zähnen, die der Plan
 * auch versorgt (Anker einer durch ein Implantat ersetzten Brücke bleiben leer).
 */
export function planungJeZahn(zaehne: Record<string, Obj>, positionen: Obj[]): Record<string, string> {
  const versorgt = new Set(positionen.flatMap(zaehneDer))
  return Object.fromEntries(Object.entries(zaehne).map(([z, v]) => {
    const tp = String(v.TP ?? '').trim()
    return [z, tp || (versorgt.has(z) ? String(v.R ?? '').trim() : '')]
  }))
}

/** Befunde einer erneuerungsbedürftigen Suprakonstruktion (Befundklasse 7) */
const SUPRA_FESTSITZEND = new Set(['skw', 'sbw'])
const SUPRA_PROTHESE = new Set(['sew', 'sow', 'stw'])

/**
 * Zähne, an denen eine Suprakonstruktion erneuert wird (Befunde 7.1, 7.2, 7.5) – dieselbe Regel wie
 * supraErneuerung in der HKP-Engine. Ausgenommen: Ausnahmefall Nr. 36 ZE-Richtlinie mit Befund 7.6
 * (atrophierter zahnloser Kiefer) und Pläne, deren Versorgungsart von Hand auf Regel- oder gleichartige
 * Versorgung gesetzt ist (Ausnahmefall Nr. 36 a, Einzelzahnlücke).
 */
export function supraErneuerung(plan: Obj): string[] {
  if (plan.versorgungsart === 'regel' || plan.versorgungsart === 'gleichartig') return []
  const klinisch = (plan.klinisch ?? {}) as Obj
  return Object.entries((plan.zaehne ?? {}) as Record<string, Obj>).filter(([z, v]) => {
    if (!(String(v.TP ?? '').trim() || String(v.R ?? '').trim()).toUpperCase().startsWith('S')) return false
    const b = String(v.B ?? '').trim().toLowerCase()
    if (SUPRA_FESTSITZEND.has(b)) return true
    return SUPRA_PROTHESE.has(b) && !(z[0] === '1' || z[0] === '2' ? klinisch.atrophieOK : klinisch.atrophieUK)
  }).map(([z]) => z)
}

/**
 * HKP für den Connector: Positionen so, wie MAS sie berechnet hat (inkl. Material, Edelmetall und
 * Zusatzleistungen, Mengen nach Werkstoff) – die gespeicherten Planzeilen allein ergeben falsche Laborsummen.
 *
 * Erneuerte Suprakonstruktionen gehen so hinaus, wie sie auf dem HKP stehen (BMV-Z Anlage 14d): Zeile R leer,
 * Suprakonstruktion in Zeile TP, Versorgung andersartig. Im Plan steht das Kürzel als Rechengrundlage in Zeile R.
 */
export function hkpFuerPvs(plan: Obj, ergebnis: Obj): string {
  const berechnet = Array.isArray(ergebnis.positionen) ? (ergebnis.positionen as Obj[]) : []
  const zaehne = (plan.zaehne ?? {}) as Record<string, Obj>
  const planung = planungJeZahn(zaehne, berechnet)
  const supra = new Set(supraErneuerung(plan))
  return JSON.stringify({
    verwaltung: nur(plan.verwaltung, ['ausstellungsdatum']),
    zuschuss: plan.zuschuss,
    zaehne: Object.fromEntries(Object.entries(zaehne).map(([z, v]) => {
      if (!supra.has(z)) return [z, { ...v, planung: planung[z] }]
      const tp = String(v.TP ?? '').trim() || String(v.R ?? '').trim()
      return [z, { ...v, R: '', TP: tp, planung: tp }]
    })),
    positionen: berechnet.map((p) => nur(p, ['id', 'ebene', 'nr', 'anzahl', 'zahn', 'labor', 'eigen', 'bezeichnung'])),
    ergebnis: {
      versorgungsart: supra.size ? 'andersartig' : ergebnis.versorgungsart,
      summen: ergebnis.summen,
      befunde: ergebnis.befunde,
      positionen: berechnet.map((p) => nur(p, ['id', 'betrag', 'einzelpreis', 'punkte', 'punktwert', 'faktor'])),
    },
  })
}

/** Planer, deren Plan beim Speichern schon fürs Praxisprogramm gerechnet wird (pvsplan.ts) */
export const PVS_PLANER: Record<string, string> = {
  'privat-kv': 'Privat-ZE-Plan', 'privat-impl': 'Implantologie-Plan', 'privat-kons': 'Kons-Plan', 'kons-mkv': 'Füllungs-MKV',
  'privat-kb': 'Schienen-Plan',
}

/** Wohin diese Pläne gehen: DS-Win alle; DENS Kons, Füllungs-MKV und Implantologie als Kostenvoranschlag, Privat-ZE als Privatprothetik */
const PLAN_PVS: Record<string, string[]> = {
  dampsoft: Object.keys(PVS_PLANER),
  dens: Object.keys(PVS_PLANER),
  'cgm-z1pro': Object.keys(PVS_PLANER),
}

export const planInsPvsMoeglich = (pvs: string | undefined, modul: string) => !!pvs && (PLAN_PVS[pvs] ?? []).includes(modul)

/**
 * Praxisprogramm, das die Bridge starten soll, wenn es von dem abweicht, mit dem sie sich meldet.
 * Leer, wenn die Einstellung kein angebundener Connector ist oder schon übereinstimmt.
 */
export function bridgeSollPvs(eingestellt: string, gemeldet?: string, kann?: string[]): string | undefined {
  if (!PVS_CONNECTOR[eingestellt] || eingestellt === gemeldet) return undefined
  // Die Bridge hat gemeldet, welche Programme auf ihrem Rechner liegen: ein anderes kann sie nicht starten.
  if (kann && !kann.includes(eingestellt)) return undefined
  return eingestellt
}

/** Was eine verbundene Bridge meldet: laufendes Praxisprogramm und (ab Bridge 1.26) die auf ihrem Rechner vorhandenen */
export interface BridgeMeldung { pvs?: string; kann?: string[] }

/** Vorhandene Praxisprogramme aus der Meldung der Bridge; undefined = ältere Bridge, die das nicht meldet */
export function bridgeKannGemeldet(roh: string | null | undefined): string[] | undefined {
  if (roh == null) return undefined
  return roh.split(',').map((s) => s.trim()).filter((s) => !!PVS_CONNECTOR[s])
}

/** Kann diese Bridge das Praxisprogramm fahren? Ältere Bridges (ohne Angabe) gelten als umstellbar. */
export const bridgeKann = (stand: BridgeMeldung, pvs: string) => stand.pvs === pvs || !stand.kann || stand.kann.includes(pvs)

/**
 * Bridge einer Ablage für das eingestellte Praxisprogramm. Im Verbund können mehrere Bridges an verschiedenen
 * Praxisprogrammen hängen: Es gilt die, die das Programm schon fährt, dann eine, die es auf ihrem Rechner hat,
 * dann eine ältere, die sich umstellen lässt. Zuletzt irgendeine verbundene, sonst die erste eingerichtete.
 */
export function bridgeWaehlen(bruecken: string[], pvs: string, stand: (mandant: string) => BridgeMeldung | null): string | undefined {
  const rang = (m: string) => {
    const s = stand(m)
    if (!s) return 4
    if (!pvs || s.pvs === pvs) return 0
    if (s.kann?.includes(pvs)) return 1
    return s.kann ? 3 : 2
  }
  let beste: string | undefined
  let bester = 5
  for (const m of bruecken) {
    const r = rang(m)
    if (r < bester) { beste = m; bester = r }
  }
  return beste
}

/** Gemeldetes Praxisprogramm der Bridge; nur ein angebundener Connector zählt. */
export function bridgePvsGemeldet(roh: string | null | undefined): string | undefined {
  const pvs = String(roh ?? '')
  return PVS_CONNECTOR[pvs] ? pvs : undefined
}

export interface PvsWahl { pvs: string; geaendert: string }

/**
 * Praxisprogramm, das diese Bridge fahren muss.
 * Sie bedient jede Ablage, für deren eingestelltes Programm sie die gewählte Bridge ist (bridgeWaehlen).
 * Bei mehreren gilt die zuletzt geänderte Einstellung. Bedient eine andere Bridge die Ablage, bleibt diese,
 * wie sie ist – sonst stellten sich zwei Bridges im Verbund gegenseitig um. Ohne Ablage mit Einstellung die eigene.
 */
export function pvsFuerBridge(
  bridge: string,
  ablagen: Record<string, string[]>,
  stand: (mandant: string) => BridgeMeldung | null,
  einstellung: Record<string, PvsWahl | undefined>,
): string {
  const treffer: PvsWahl[] = []
  let andereBedient = false
  for (const [ablage, bruecken] of Object.entries(ablagen)) {
    const e = einstellung[ablage]
    if (!e?.pvs || !bruecken.includes(bridge)) continue
    if (bridgeWaehlen(bruecken, e.pvs, stand) === bridge) treffer.push(e)
    else andereBedient = true
  }
  if (!treffer.length && !andereBedient && einstellung[bridge]?.pvs) treffer.push(einstellung[bridge])
  treffer.sort((a, b) => (b.geaendert || '').localeCompare(a.geaendert || ''))
  return treffer[0]?.pvs ?? ''
}

/** Ab Bridge 1.18 folgt sie dieser Einstellung und stellt den Connector um. */
export function bridgeFolgtEinstellung(version: string | undefined): boolean {
  const [haupt, neben] = (version ?? '').split('.').map((teil) => Number(teil) || 0)
  return haupt > 1 || (haupt === 1 && neben >= 18)
}

/** Vermerk, dass ein Plan schon im PVS liegt */
export interface PvsVermerk {
  pvs: string
  patientId: string
  planNr: number
  /** mehrere DS-Win-Pläne aus einem PlanR-Plan (Füllungs-MKV und Privatvereinbarung) */
  plaene?: number[]
  am: string
}

export const vermerkText = (v: PvsVermerk, pvsName: string) =>
  `In ${pvsName} als Plan Nr. ${(v.plaene ?? [v.planNr]).join(' und ')} angelegt (${new Date(v.am).toLocaleDateString('de-DE')})`

/** Aktueller Zahnstatus aus dem PVS: Kürzel je Zahn genau wie dort ('' = ohne Befund) */
export interface PvsBefund {
  datum: string
  version: string
  zaehne: Record<string, string>
}

/**
 * DS-Win schreibt Implantate in dieser Praxis als j, j1 oder j2 (auch „j 1“ / „j 2“).
 * PlanR und das Handy zeigen und planen sie als i.
 */
export function implantKuerzel(code: string): string {
  return /^j(?:\s*[12])?$/i.test(code.trim()) ? 'i' : code
}

/** Antwort des Connectors auf GET /patients/<nr>/befunde/01; Datum: aktueller Status, sonst letzter 01-Befund */
export function befundAusPvs(d: unknown): PvsBefund | null {
  const o = d as { version?: unknown; current?: { date?: unknown; teeth?: Record<string, { status?: unknown }> }; items?: { date?: unknown }[] }
  const teeth = o?.current?.teeth
  if (typeof o?.version !== 'string' || !teeth || typeof teeth !== 'object') return null
  const zaehne = Object.fromEntries([...KIEFER.OK, ...KIEFER.UK].map((z) => [z, implantKuerzel(String(teeth[z]?.status ?? '').trim())]))
  return { datum: datumIso(o.current?.date) || datumIso(o.items?.[0]?.date), version: o.version, zaehne }
}

/** Neuer Befund → Schreibauftrag für den Connector: nur die genannten Kiefer, ohne Kürzel = vorhanden */
export function befundAuftrag(zaehne: Record<string, unknown>, kiefer: unknown[]): Record<string, string> {
  const teeth: Record<string, string> = {}
  for (const k of kiefer) {
    for (const z of KIEFER[String(k)] ?? []) {
      if (!(z in zaehne)) continue
      const code = String(zaehne[z] ?? '').trim()
      teeth[z] = code || 'healthy'
    }
  }
  return teeth
}

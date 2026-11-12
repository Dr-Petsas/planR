/**
 * Öffentliche Probe: Befund, Regelversorgung, Therapieplanung und die Gebührenzeilen
 * in einen leeren HKP. Nichts davon geht ins Register.
 */
import type { Ebene, HkpPlan, Position, ZahnZeilen } from './types'
import { BEFUND_KUERZEL, THERAPIE_KUERZEL, ALLE_ZAEHNE, kieferVon } from './engine/zahnschema'
import { befundOhneStrich, markeLesen } from './engine/bruecken'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden, type RegelOptionen } from './engine/regeln'
import { regelUebernehmen } from './engine/aufwertung'
import { berechnen, type Listen } from './engine/berechnung'
import { leererPlan } from './store/plan'

export interface ProbeSchema {
  B?: Record<string, string>
  R?: Record<string, string>
  TP?: Record<string, string>
}

export interface ProbeGebuehr {
  ebene: Ebene | 'GOÄ'
  nr: string
  zahn?: string
  anzahl?: number
  faktor?: number
  betrag?: number
}

export interface ProbeSummen {
  festzuschuss?: number
}

const BEMA_AM_ZAHN = new Set(['20a', '20b', '20c', '91a', '91b', '91d', '90'])

function wert(map: Record<string, string> | undefined, zahn: string) {
  return (map?.[zahn] ?? '').trim()
}

type Kiefer = 'OK' | 'UK'

const KIEFER_NAME: Record<Kiefer, string> = { OK: 'Oberkiefer', UK: 'Unterkiefer' }

/** Das Einlesen verwechselt den Lückenschluss )( mit x. */
const VERWECHSELT: Record<string, string> = { x: ')(', ')(': 'x' }

interface Lesart {
  B: Record<string, string>
  nichtErsetzen: string[]
}

function regelzeile(schema: ProbeSchema): Record<string, string> {
  const aus: Record<string, string> = {}
  for (const z of ALLE_ZAEHNE) {
    const roh = wert(schema.R, z)
    const kuerzel = roh ? markeLesen(roh).kuerzel.toUpperCase() : ''
    if (kuerzel in THERAPIE_KUERZEL) aus[z] = kuerzel
  }
  return aus
}

function rechnen(basis: HkpPlan, optionen: RegelOptionen): { plan: HkpPlan; hinweise: string[] } {
  const regel = regelversorgungErmitteln(basis.zaehne, optionen)
  if (Object.values(basis.zaehne).some((z) => z.TP)) {
    const therapie = therapieAnwenden(regel, basis.zaehne, basis)
    return { plan: regelUebernehmen(basis, therapie, basis.zaehne), hinweise: therapie.hinweise }
  }
  if (!Object.values(regel.R).some(Boolean) && !regel.befunde.length) return { plan: basis, hinweise: regel.hinweise }
  const ohneTp = Object.fromEntries(Object.entries(basis.zaehne).map(([z, v]) => [z, { ...v, TP: '' }]))
  return { plan: regelUebernehmen({ ...basis, versorgungsart: 'auto' }, regel, ohneTp), hinweise: regel.hinweise }
}

function abweichend(plan: HkpPlan, blatt: Record<string, string>, verglichen: Set<Kiefer>) {
  return ALLE_ZAEHNE.filter((z) => verglichen.has(kieferVon(z)) && (plan.zaehne[z]?.R ?? '') !== (blatt[z] ?? ''))
}

/** In jedem Kiefer, dessen Regelzeile gelesen wurde, gilt die Zeile vom Blatt, auch wo sie leer ist. */
function regelVomBlatt(plan: HkpPlan, blatt: Record<string, string>, verglichen: Set<Kiefer>): HkpPlan {
  if (!verglichen.size) return plan
  const zaehne = { ...plan.zaehne }
  for (const z of ALLE_ZAEHNE) if (verglichen.has(kieferVon(z))) zaehne[z] = { ...zaehne[z], R: blatt[z] ?? '' }
  return { ...plan, zaehne }
}

function gebuehrenDazu(plan: HkpPlan, liste: ProbeGebuehr[]): HkpPlan {
  const gueltig = liste.filter((p) => (p.ebene === 'GOZ' || p.ebene === 'BEL' || p.ebene === 'BEB' || p.ebene === 'BEMA') && p.nr.trim())
  const gozZaehne = new Set(gueltig.filter((p) => p.ebene === 'GOZ' && p.zahn).map((p) => p.zahn as string))
  const hatBema = plan.positionen.some((p) => p.ebene === 'BEMA')
  let positionen = plan.positionen.filter((p) => !(p.auto && p.ebene === 'BEMA' && gozZaehne.has(p.zahn) && BEMA_AM_ZAHN.has(p.nr)))
  const index = new Map(positionen.map((p, i) => [`${p.ebene}|${p.nr.toLowerCase()}|${p.zahn}`, i]))
  for (const p of gueltig) {
    if (p.ebene === 'BEMA' && hatBema) continue
    const ebene = p.ebene as Ebene
    const zahn = (p.zahn ?? '').trim()
    const nr = p.nr.trim().toLowerCase()
    const key = `${ebene}|${nr}|${zahn}`
    const vorhanden = index.get(key)
    if (vorhanden !== undefined) {
      if (ebene === 'GOZ' && p.faktor) positionen[vorhanden] = { ...positionen[vorhanden], faktor: p.faktor }
      continue
    }
    const labor = ebene === 'BEL' || ebene === 'BEB' ? (plan.einstellungen.labor === 'praxis' ? 'eigen' : 'fremd') : undefined
    const neu: Position = {
      id: `blatt-${ebene}-${nr}-${zahn}-${positionen.length}`,
      ebene, nr, zahn, anzahl: p.anzahl && p.anzahl > 0 ? p.anzahl : 1, auto: false,
      ...(ebene === 'GOZ' ? { faktor: p.faktor ?? plan.einstellungen.gozFaktor } : {}),
      ...(labor ? { labor } : {}),
      ...(p.betrag && p.betrag > 0 && (ebene === 'BEL' || ebene === 'BEB') ? { preis: p.betrag } : {}),
    }
    index.set(key, positionen.length)
    positionen = [...positionen, neu]
  }
  return { ...plan, positionen }
}

/**
 * Zahnschema übernehmen, rechnen lassen und die Gebührenzeilen des Blatts dazulegen. Patientenfelder bleiben leer.
 * Die gerechnete Regelversorgung wird gegen die Zeile R vom Blatt geprüft: Ein Kiefer ohne R und TP auf dem Blatt
 * wird nicht geplant, eine Abweichung probiert die bekannten Lesefehler am Befund aus, der Rest wird gemeldet.
 */
export function planAusSchema(einstellungen: HkpPlan['einstellungen'], schema: ProbeSchema, gebuehren: ProbeGebuehr[] = []): { plan: HkpPlan; hinweise: string[] } {
  const zaehne: Record<string, ZahnZeilen> = Object.fromEntries(ALLE_ZAEHNE.map((z) => {
    const befund = befundOhneStrich(wert(schema.B, z))
    const tp = markeLesen(wert(schema.TP, z))
    const kuerzel = tp.kuerzel.toUpperCase()
    const bekannt = kuerzel in THERAPIE_KUERZEL
    return [z, {
      B: befund in BEFUND_KUERZEL ? befund : '',
      R: '',
      TP: bekannt ? kuerzel : '',
      ...(bekannt && tp.bAnfang ? { bAnfang: true } : {}),
      ...(bekannt && tp.bEnde ? { bEnde: true } : {}),
    }]
  }))
  const basis: HkpPlan = { ...leererPlan(), einstellungen, zaehne, patient: leererPlan().patient }
  const blatt = regelzeile(schema)
  const geplant = new Set(ALLE_ZAEHNE.filter((z) => blatt[z] || zaehne[z].TP).map(kieferVon))
  const verglichen = new Set(Object.keys(blatt).map(kieferVon))
  const optionen = (l: Lesart): RegelOptionen => ({
    ...regelOptionen(basis),
    ...(geplant.size ? { nurKiefer: [...geplant] } : {}),
    ...(l.nichtErsetzen.length ? { nichtErsetzen: l.nichtErsetzen } : {}),
  })
  const mit = (l: Lesart) => rechnen({ ...basis, zaehne: Object.fromEntries(ALLE_ZAEHNE.map((z) => [z, { ...zaehne[z], B: l.B[z] }])) }, optionen(l))

  let lesart: Lesart = { B: Object.fromEntries(ALLE_ZAEHNE.map((z) => [z, zaehne[z].B])), nichtErsetzen: [] }
  let stand = mit(lesart)
  let offen = abweichend(stand.plan, blatt, verglichen)
  const abgleich: string[] = []
  while (offen.length) {
    let bester: { lesart: Lesart; stand: typeof stand; offen: string[]; hinweis?: string } | null = null
    for (const z of offen) {
      if (zaehne[z].TP) continue
      const b = lesart.B[z]
      const versuche: { lesart: Lesart; hinweis?: string }[] = []
      const anders = VERWECHSELT[b]
      if (anders) versuche.push({
        lesart: { ...lesart, B: { ...lesart.B, [z]: anders } },
        hinweis: `Zahn ${z}: „${b}“ gelesen, zur Regelversorgung auf dem Blatt passt nur „${anders}“ (${BEFUND_KUERZEL[anders]}). Übernommen, bitte gegenlesen.`,
      })
      if (b === 'f' && !blatt[z] && !lesart.nichtErsetzen.includes(z)) versuche.push({ lesart: { ...lesart, nichtErsetzen: [...lesart.nichtErsetzen, z] } })
      for (const v of versuche) {
        const s = mit(v.lesart)
        const o = abweichend(s.plan, blatt, verglichen)
        if (o.length < (bester?.offen.length ?? offen.length)) bester = { ...v, stand: s, offen: o }
      }
    }
    if (!bester) break
    lesart = bester.lesart
    stand = bester.stand
    offen = bester.offen
    if (bester.hinweis) abgleich.push(bester.hinweis)
  }
  if (offen.length) {
    const liste = offen.map((z) => `${z} Blatt „${blatt[z] || '–'}“ / PlanR „${stand.plan.zaehne[z]?.R || '–'}“`).join(', ')
    abgleich.push(`Regelversorgung weicht vom Blatt ab: ${liste}. Eingetragen ist die Zeile vom Blatt, bitte Befund und Regelzeile an diesen Zähnen gegenlesen.`)
  }
  const ohneGrenze = geplant.size < 2 ? rechnen(basis, regelOptionen(basis)).plan : null
  for (const k of ['OK', 'UK'] as const) {
    const haette = ohneGrenze && !geplant.has(k) ? ALLE_ZAEHNE.filter((z) => kieferVon(z) === k && ohneGrenze.zaehne[z]?.R) : []
    if (geplant.size && haette.length) {
      const liste = haette.map((z) => `${z} ${ohneGrenze?.zaehne[z].R}`).join(', ')
      abgleich.push(`${KIEFER_NAME[k]}: auf dem Blatt weder Regelversorgung noch Therapie, deshalb nicht geplant. Aus dem gelesenen Befund hätte PlanR ${liste} gerechnet, bitte den Befund gegenlesen.`)
    }
    if (geplant.has(k) && !verglichen.has(k)) abgleich.push(`${KIEFER_NAME[k]}: Regelversorgung auf dem Blatt nicht gelesen, PlanR hat sie aus dem Befund gerechnet. Bitte gegenlesen.`)
  }
  const plan = gebuehrenDazu(regelVomBlatt(stand.plan, blatt, verglichen), gebuehren)
  return { plan, hinweise: [...abgleich, ...stand.hinweise] }
}

const euro = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/**
 * Zweite Gegenprobe: Der Festzuschuss vom Blatt gegen den gerechneten. Passt er nur zu einer anderen
 * Bonusstufe, wird die übernommen. Passt er zu keiner, stimmt der Befund nicht mit dem Blatt überein.
 */
export function zuschussAbgleich(plan: HkpPlan, listen: Listen, summen: ProbeSummen | undefined): { plan: HkpPlan; hinweise: string[] } {
  const blatt = summen?.festzuschuss
  if (!blatt || blatt <= 0 || !Object.values(plan.zaehne).some((z) => z.B)) return { plan, hinweise: [] }
  const mit = (zuschuss: HkpPlan['zuschuss']) => berechnen({ ...plan, zuschuss }, listen).summen.festzuschuss
  const passt = (n: number) => Math.abs(n - blatt) <= 0.05
  const gerechnet = mit(plan.zuschuss)
  if (passt(gerechnet)) return { plan, hinweise: [] }
  const stufen: { zuschuss: HkpPlan['zuschuss']; name: string }[] = [
    ...(['60', '70', '75'] as const).map((bonus) => ({ zuschuss: { bonus, haertefall: false }, name: `${bonus} %` })),
    { zuschuss: { ...plan.zuschuss, haertefall: true }, name: '100 % (Härtefall)' },
  ]
  const treffer = stufen.find((s) => passt(mit(s.zuschuss)))
  if (treffer) return {
    plan: { ...plan, zuschuss: treffer.zuschuss },
    hinweise: [`Festzuschuss auf dem Blatt ${euro(blatt)}: passt zur Stufe ${treffer.name}, die Stufe ist übernommen.`],
  }
  return {
    plan,
    hinweise: [`Festzuschuss weicht vom Blatt ab: Blatt ${euro(blatt)}, PlanR ${euro(gerechnet)}. Dann stimmt der gelesene Befund nicht mit dem Blatt überein, oder das Blatt rechnet mit Festzuschüssen aus einem anderen Jahr. Bitte Befund und Regelversorgung gegenlesen.`],
  }
}

/** Der eingebettete Planer nimmt Schema, Gebührenzeilen und Summen von der Probeseite an. */
export function probeHoren(uebernehmen: (schema: ProbeSchema, gebuehren: ProbeGebuehr[], summen: ProbeSummen) => void) {
  if (window.parent === window) return () => {}
  const auf = (ev: MessageEvent) => {
    if (ev.origin !== location.origin) return
    const daten = ev.data as { type?: string; schema?: ProbeSchema; positionen?: ProbeGebuehr[]; summen?: ProbeSummen } | null
    if (!daten || daten.type !== 'planr-probe' || !daten.schema) return
    uebernehmen(daten.schema, Array.isArray(daten.positionen) ? daten.positionen : [], daten.summen ?? {})
  }
  window.addEventListener('message', auf)
  const bereit = () => window.parent.postMessage({ type: 'planr-probe-bereit' }, location.origin)
  bereit()
  const nochmal = window.setTimeout(bereit, 600)
  return () => {
    window.clearTimeout(nochmal)
    window.removeEventListener('message', auf)
  }
}

import type { Ebene, Position, ZahnZeilen } from '../types'
import type { RegelErgebnis } from './regeln'
import { brueckenBereiche, pfeilerIm } from './bruecken'
import { FEHLEND, KRONE_NOETIG, OBERKIEFER, UNTERKIEFER, imVerblendbereich, istWeisheitszahn, kieferVon } from './zahnschema'

/**
 * Zuordnung Therapiekürzel (Zeile TP) zu GOZ- und BEB-Leistungen für gleich-/andersartige Versorgung.
 * `gozAnker` gilt, wenn der Zahn Brücken- oder Prothesenanker ist.
 */
export const TP_ZUORDNUNG: Record<string, { goz: string; gozAnker?: string; beb: string[] }> = {
  K: { goz: '2210', gozAnker: '5010', beb: ['2101'] },
  KV: { goz: '2210', gozAnker: '5010', beb: ['2121', '2611'] },
  KM: { goz: '2210', gozAnker: '5010', beb: ['2281', '2612'] },
  KH: { goz: '2210', gozAnker: '5010', beb: ['2101'] },
  KVH: { goz: '2210', gozAnker: '5010', beb: ['2121', '2611'] },
  KMH: { goz: '2210', gozAnker: '5010', beb: ['2281', '2612'] },
  PK: { goz: '2220', beb: ['2104'] },
  PKV: { goz: '2220', beb: ['2126', '2611'] },
  PKM: { goz: '2220', beb: ['2534'] },
  T: { goz: '5040', beb: ['3001'] },
  TV: { goz: '5040', beb: ['3001', '2611'] },
  TM: { goz: '5040', beb: ['3001', '2612'] },
  KO: { goz: '2210', gozAnker: '5010', beb: ['2101', '3023'] },
  KVO: { goz: '2210', gozAnker: '5010', beb: ['2121', '2611', '3023'] },
  KMO: { goz: '2210', gozAnker: '5010', beb: ['2281', '2612', '3023'] },
  T2: { goz: '5100', beb: ['3001'] },
  T2V: { goz: '5100', beb: ['3001', '2611'] },
  T2M: { goz: '5100', beb: ['3001', '2612'] },
  SK: { goz: '2200', gozAnker: '5000', beb: ['2101'] },
  SKV: { goz: '2200', gozAnker: '5000', beb: ['2121', '2611'] },
  SKM: { goz: '2200', gozAnker: '5000', beb: ['2281', '2612'] },
  SKO: { goz: '2200', gozAnker: '5000', beb: ['2101', '3023'] },
  SKVO: { goz: '2200', gozAnker: '5000', beb: ['2121', '2611', '3023'] },
  SKMO: { goz: '2200', gozAnker: '5000', beb: ['2281', '2612', '3023'] },
  ST: { goz: '5040', beb: ['3001'] },
  STV: { goz: '5040', beb: ['3001', '2611'] },
  STM: { goz: '5040', beb: ['3001', '2612'] },
  A: { goz: '', beb: ['2155'] },
  ABV: { goz: '', beb: ['2362', '2611'] },
  ABM: { goz: '', beb: ['2351', '2612'] },
  B: { goz: '', beb: ['2362'] },
  BV: { goz: '', beb: ['2362', '2611'] },
  BM: { goz: '', beb: ['2351', '2612'] },
  SB: { goz: '', beb: ['2362'] },
  SBV: { goz: '', beb: ['2362', '2611'] },
  SBM: { goz: '', beb: ['2351', '2612'] },
}

/** Brückenglied, auch implantatgetragen oder adhäsiv */
const GLIED = /^(S?B|AB)[VM]?$/
/** ersetzter Zahn einer Prothese, auch über einem Steg oder auf einem Implantat-Verbindungselement */
const PROTHESENZAHN = /^(S?EO?|SO)$/
/** ersetzter Zahn über einem Steg */
const STEGZAHN = /^S?EO$/
/** Krone mit Geschiebe */
const GESCHIEBE = /^S?K[VM]?O$/
/** Pfeiler mit Krone, Teilkrone oder Teleskop (natürlich oder implantatgetragen) */
const PFEILERKRONE = /^(S?K|PK|S?T)/
const IMPLANTAT_PROTHESE = /^(SE|SEO|SO|ST[VM]?)$/
/** Kürzel, die eine Prothese im Kiefer voraussetzen (ersetzte Zähne, Teleskope, Geschiebe, Halteelemente) */
const PROTHESEN_TP = /^(S?EO?|SO|S?T|S?K[VM]?O|K[VM]?H|H)$/

const ZAHN_BEMA = /^(20[abc]|91[abd]|90)$/
const ZAHN_BEL = /^(1013|1021|1022|1024|1026|1100|1200|1201|1343|1620)$/
const PROTHESE_BEMA = /^(96[abc]|97[ab]|98[abceg]|98h\/[12])$/
const PROTHESE_BEL = new Set(['0010', '0021', '0211', '0213', '0220', '0120', '2010', '3010', '3020', '3030', '3610', '3620'])
const EINHEIT_BEL = new Set(['1021', '1022', '1024', '1100'])
const ZAHNARBEIT_BEL = /^(1013|1021|1022|1024|1026|1100|1200|1201)$/

let zaehler = 0
function pos(ebene: Ebene, nr: string, zahn: string, anzahl = 1): Position {
  return { id: `auto-tp-${Date.now().toString(36)}-${(zaehler++).toString(36)}`, ebene, nr, zahn, anzahl, auto: true }
}

const befundKuerzel = (z: ZahnZeilen | undefined) => (z?.B ?? '').trim().toLowerCase()
const zahnListe = (zahn: string) => zahn.split(/[,\s]+/).filter(Boolean)
const spanne = (zaehne: string[]) => (zaehne.length === 1 ? zaehne[0] : `${zaehne[0]}-${zaehne[zaehne.length - 1]}`)

export type KuerzelArt = '' | 'implantat' | 'prothese' | 'kombi' | 'bruecke' | 'krone'

/** Versorgungsform eines Kürzels für die Abgrenzung gleich-/andersartig */
export function kuerzelArt(k: string): KuerzelArt {
  k = k.trim().toUpperCase()
  if (!k) return ''
  if (k.startsWith('S')) return 'implantat'
  if (/^(E|EO|H)$/.test(k)) return 'prothese'
  if (/^(T|R)/.test(k) || GESCHIEBE.test(k)) return 'kombi'
  if (/^(B|A)/.test(k)) return 'bruecke'
  return 'krone'
}

/**
 * Macht die Therapieplanung (TP) an einem Zahn die Versorgung andersartig? Nach Anlage 2 BMV-Z bleiben
 * Geschiebe/Stege anstelle von Teleskopen und Geschiebe an überkronungsbedürftigen Zähnen gleichartig;
 * Implantate (Erstversorgung), Brücken statt Prothese und Prothese statt Brücke sind andersartig.
 */
export function andersartig(r: string, tp: string, prothesenKiefer: boolean): boolean {
  const a = kuerzelArt(r)
  const b = kuerzelArt(tp)
  if (!b || r.trim().toUpperCase() === tp.trim().toUpperCase()) return false
  if (b === 'implantat') return a !== 'implantat'
  if (!a) return b === 'prothese' ? !prothesenKiefer : b !== 'krone'
  if (a === 'krone') return b !== 'krone' && !GESCHIEBE.test(tp.trim().toUpperCase())
  if (a === 'kombi') return b !== 'kombi' && b !== 'krone'
  if (r.trim().toUpperCase() === 'H' && b === 'krone') return !/H$/.test(tp.trim().toUpperCase())
  return a !== b
}

/**
 * Wendet die Therapieplanung (Zeile TP) auf die Regelversorgung an – nach den Berechnungsbeispielen
 * des KZBV-Kompendiums: Zähne mit abweichender Planung werden nach GOZ/BEB berechnet, gleichartige
 * Bestandteile behalten Provisorien und Prothesenleistungen nach BEMA, andersartige Bestandteile
 * (Implantate, Brücke statt Prothese, Prothese statt Brücke, implantatgetragene Prothese) werden
 * vollständig nach GOZ/BEB berechnet (Mischfall: Regelbestandteile bleiben BEMA/BEL).
 * Leeres TP bedeutet Regelversorgung – außer bei Brücken, deren Glieder durch Implantate oder eine
 * Prothese ersetzt werden, und bei Prothesen, deren ersetzte Zähne festsitzend versorgt werden.
 */
export function therapieplanAnwenden(regel: RegelErgebnis, zaehne: Record<string, ZahnZeilen>): RegelErgebnis {
  const R = regel.R
  const tp: Record<string, string> = {}
  for (const [z, v] of Object.entries(zaehne)) {
    const t = v.TP.trim().toUpperCase()
    if (t && t !== (R[z] ?? '')) tp[z] = t
  }
  if (!Object.keys(tp).length) return regel

  const B = (z: string) => befundKuerzel(zaehne[z])
  const hinweise = [...regel.hinweise]
  const hinweis = (h: string) => {
    if (!hinweise.includes(h)) hinweise.push(h)
  }
  let positionen = [...regel.positionen]
  const neu: Position[] = []
  const entfernen = (f: (p: Position) => boolean) => {
    positionen = positionen.filter((p) => !f(p))
  }

  for (const [kiefer, reihe] of [['OK', OBERKIEFER], ['UK', UNTERKIEFER]] as const) {
    if (!reihe.some((z) => tp[z])) continue
    const kieferName = kiefer === 'OK' ? 'Oberkiefer' : 'Unterkiefer'
    const sitz = reihe.filter((z) => B(z) !== ')(')
    const zahnlos = sitz.filter((z) => !istWeisheitszahn(z)).every((z) => FEHLEND.has(B(z)))
    const roh = (z: string) => tp[z] ?? R[z] ?? ''

    // ---- Regel-Brücken, deren Glieder durch Implantate/Prothese ersetzt werden, lösen sich auf ----
    const ueber: Record<string, string> = {}
    const wegfall = new Set<string>()
    const prothesenSpannen = new Set<string>()
    const spannen = positionen.filter((p) => p.ebene === 'BEMA' && p.nr === '92' && kieferVon(p.zahn.split('-')[0]) === kiefer)
    const glieder = (p: Position) => {
      const [von, bis] = p.zahn.split('-')
      const a = sitz.indexOf(von)
      const b = sitz.indexOf(bis)
      return sitz.slice(Math.min(a, b) + 1, Math.max(a, b))
    }
    const bleibendeSpannen = spannen.filter((p) => glieder(p).every((z) => GLIED.test(roh(z))))
    const bleibend = new Set(bleibendeSpannen.flatMap((p) => p.zahn.split('-')))
    const aufgeloest = spannen.filter((p) => glieder(p).every((z) => !GLIED.test(roh(z))))
    for (const p of spannen) if (!bleibendeSpannen.includes(p) && !aufgeloest.includes(p)) hinweis(`Brücke ${p.zahn}: nur teilweise ersetzt – Leistungen bitte prüfen.`)
    for (const p of aufgeloest) {
      for (const x of p.zahn.split('-')) {
        if (tp[x] || bleibend.has(x)) continue
        if (KRONE_NOETIG.has(B(x))) {
          positionen = positionen.map((q) => (q.zahn === x && q.ebene === 'BEMA' && /^91[ab]$/.test(q.nr) ? { ...q, nr: imVerblendbereich(x) ? '20b' : '20a' } : q))
        } else {
          wegfall.add(x)
          entfernen((q) => q.zahn === x && ((q.ebene === 'BEMA' && /^(91[ab]|19)$/.test(q.nr)) || (q.ebene === 'BEL' && ZAHN_BEL.test(q.nr))))
        }
      }
      hinweis(`Brücke ${p.zahn} entfällt (Glieder durch ${glieder(p).some((z) => roh(z).startsWith('S')) ? 'Implantate' : 'Prothese'} ersetzt); Anker ohne eigenen Kronenbefund werden nicht versorgt, der Festzuschuss bleibt.`)
      if (glieder(p).every((z) => PROTHESENZAHN.test(roh(z)))) {
        prothesenSpannen.add(spanne(glieder(p)))
        neu.push(pos('GOZ', '5070', spanne(glieder(p))))
      }
    }

    // ---- Prothese der Regelversorgung: bleibt, wird andersartig oder entfällt ----
    const tpRoh = (z: string) => zaehne[z]?.TP.trim().toUpperCase() ?? ''
    const regelProthese = sitz.some((z) => R[z] === 'E')
    const ersetzt = sitz.filter((z) => R[z] === 'E' && tp[z] && !PROTHESEN_TP.test(tp[z]))
    const protheseGeplant = sitz.some((z) => PROTHESEN_TP.test(tpRoh(z)))
    const implantatProthese = sitz.some((z) => tp[z] && IMPLANTAT_PROTHESE.test(tp[z]) && !(R[z] ?? '').startsWith('S'))
    const entfaellt = regelProthese && ersetzt.length > 0 && !protheseGeplant
    if (entfaellt) {
      for (const z of sitz) {
        if (tp[z]) continue
        const r = R[z] ?? ''
        if (r === 'E' || r === 'H') wegfall.add(z)
        else if (/^T/.test(r)) {
          if (KRONE_NOETIG.has(B(z))) {
            ueber[z] = imVerblendbereich(z) ? 'KV' : 'K'
            positionen = positionen.map((q) => (q.zahn !== z ? q
              : q.ebene === 'BEMA' && q.nr === '91d' ? { ...q, nr: imVerblendbereich(z) ? '20b' : '20a' }
                : q.ebene === 'BEL' && q.nr === '1200' ? { ...q, nr: imVerblendbereich(z) ? '1024' : '1021' } : q))
          } else {
            wegfall.add(z)
            entfernen((q) => q.zahn === z && ((q.ebene === 'BEMA' && /^(91d|19)$/.test(q.nr)) || (q.ebene === 'BEL' && ZAHN_BEL.test(q.nr))))
          }
        }
      }
      const rest = sitz.filter((z) => R[z] === 'E' && !tp[z])
      hinweis(`${kieferName}: festsitzende Versorgung statt Prothese (andersartig) – die Prothese der Regelversorgung entfällt${rest.length ? `, ${rest.join(', ')} werden nicht ersetzt` : ''}. Für eine Prothese die zu ersetzenden Zähne in Zeile TP mit E kennzeichnen.`)
    } else if (regelProthese && ersetzt.length) {
      const ohne = sitz.filter((z) => R[z] === 'E' && !tpRoh(z))
      for (const z of ohne) wegfall.add(z)
      if (ohne.length) hinweis(`${kieferName}: Prothese nur für die in Zeile TP mit E markierten Zähne – ${ohne.join(', ')} werden nicht ersetzt.`)
    }

    const plan = (z: string) => tp[z] ?? ueber[z] ?? (wegfall.has(z) ? '' : R[z] ?? '')
    const laeufe = (f: (z: string) => boolean) => {
      const out: { zaehne: string[]; links?: string; rechts?: string }[] = []
      let akt: string[] = []
      sitz.forEach((z, i) => {
        if (f(z)) akt.push(z)
        if ((!f(z) || i === sitz.length - 1) && akt.length) {
          out.push({ zaehne: akt, links: sitz[sitz.indexOf(akt[0]) - 1], rechts: sitz[sitz.indexOf(akt[akt.length - 1]) + 1] })
          akt = []
        }
      })
      return out
    }
    const istPfeiler = (x: string | undefined): x is string => !!x && (PFEILERKRONE.test(plan(x)) || plan(x) === 'A')

    const prothesenZaehne = sitz.filter((z) => PROTHESENZAHN.test(plan(z)))
    const prothese = implantatProthese || (!regelProthese && prothesenZaehne.length) ? 'andersartig' : entfaellt ? 'entfaellt' : regelProthese ? 'regel' : 'keine'
    const markiert = brueckenBereiche(reihe, plan, (z) => zaehne[z]).filter((b) => b.explizit)
    const bruecken = laeufe((z) => GLIED.test(plan(z))).map((l) => {
      const m = markiert.find((b) => l.zaehne.every((z) => b.zaehne.includes(z)))
      return { ...l, anker: m ? pfeilerIm(m, plan) : [l.links, l.rechts].filter(istPfeiler) }
    })
    const brueckenAnker = new Set(bruecken.flatMap((b) => b.anker))
    const stege = laeufe((z) => STEGZAHN.test(plan(z)))
    const stegAnker = new Set(stege.flatMap((s) => [s.links, s.rechts]).filter((x): x is string => !!x))

    // ---- andersartige Bestandteile ----
    const anders = new Set(sitz.filter((z) => tp[z] && andersartig(R[z] ?? '', tp[z], regelProthese)))
    if (prothese === 'andersartig') {
      for (const z of sitz) {
        const k = plan(z)
        if (PROTHESENZAHN.test(k) || /^S?T/.test(k) || GESCHIEBE.test(k) || /H$/.test(k) || stegAnker.has(z)) anders.add(z)
      }
    }
    for (const b of bruecken) {
      const teile = [...b.zaehne, ...b.anker]
      if (teile.some((z) => anders.has(z))) for (const z of teile) anders.add(z)
    }

    // ---- Brückenspannen der Regelversorgung ----
    positionen = positionen.flatMap((p): Position[] => {
      if (!spannen.includes(p)) return [p]
      if (aufgeloest.includes(p)) return []
      const g = glieder(p)
      return g.some((z) => tp[z] || anders.has(z)) ? [{ ...pos('GOZ', '5070', spanne(g)), anzahl: p.anzahl }] : [p]
    })

    // ---- Prothesenleistungen der Regelversorgung ----
    if (regelProthese && (prothese === 'andersartig' || prothese === 'entfaellt')) {
      entfernen((p) => p.zahn === kiefer && ((p.ebene === 'BEMA' && PROTHESE_BEMA.test(p.nr)) || (p.ebene === 'BEL' && PROTHESE_BEL.has(p.nr))))
      entfernen((p) => p.ebene === 'BEL' && p.nr === '2031' && zahnListe(p.zahn).some((z) => kieferVon(z) === kiefer))
    } else if (prothese === 'regel') {
      const n = prothesenZaehne.length
      positionen = positionen.map((p) => (p.zahn !== kiefer ? p
        : p.ebene === 'BEMA' && /^96[abc]$/.test(p.nr) ? { ...p, nr: n <= 4 ? '96a' : n <= 8 ? '96b' : '96c' }
          : p.ebene === 'BEL' && /^(3020|3030|3620)$/.test(p.nr) ? { ...p, anzahl: n } : p))
      const halte = sitz.filter((z) => /H$/.test(plan(z)))
      const hatte = positionen.some((p) => p.ebene === 'BEL' && p.nr === '2031' && zahnListe(p.zahn).some((z) => kieferVon(z) === kiefer))
      positionen = positionen.flatMap((p): Position[] => {
        if (p.ebene === 'BEL' && p.nr === '2031' && zahnListe(p.zahn).some((z) => kieferVon(z) === kiefer)) return halte.length ? [{ ...p, zahn: halte.join(','), anzahl: halte.length }] : []
        if (p.ebene === 'BEMA' && /^98h/.test(p.nr) && p.zahn === kiefer) return halte.length ? [{ ...p, nr: halte.length >= 2 ? '98h/2' : '98h/1' }] : []
        return [p]
      })
      if (halte.length && !hatte) positionen.push(pos('BEMA', halte.length >= 2 ? '98h/2' : '98h/1', kiefer), pos('BEL', '2031', halte.join(','), halte.length))
    }

    // ---- Zähne mit eigener Planung oder als Teil einer andersartigen Versorgung ----
    for (const z of sitz) {
      if (!tp[z] && !anders.has(z)) continue
      const k = plan(z)
      const andersZ = anders.has(z)
      const hatte19 = positionen.some((p) => p.ebene === 'BEMA' && p.nr === '19' && p.zahn === z)
      const regelGozBeb = TP_ZUORDNUNG[R[z] ?? '']
      entfernen((p) => p.zahn === z && (
        (p.ebene === 'BEMA' && (ZAHN_BEMA.test(p.nr) || (andersZ && p.nr === '19'))) ||
        (p.ebene === 'BEL' && ZAHN_BEL.test(p.nr)) ||
        (!!regelGozBeb && ((p.ebene === 'GOZ' && (p.nr === regelGozBeb.goz || p.nr === regelGozBeb.gozAnker)) || (p.ebene === 'BEB' && regelGozBeb.beb.includes(p.nr))))))
      if (andersZ) {
        const stifte = positionen.filter((p) => p.zahn === z && p.ebene === 'BEMA' && /^18[ab]$/.test(p.nr))
        entfernen((p) => p.zahn === z && ((p.ebene === 'BEMA' && /^18[ab]$/.test(p.nr)) || (p.ebene === 'BEL' && /^(1033|1050)$/.test(p.nr))))
        for (const s of stifte) {
          const n = s.nachtraeglich ? { nachtraeglich: true } : {}
          neu.push({ ...pos('GOZ', s.nr === '18a' ? '2195' : '2190', z), ...n })
          if (s.nr === '18b') neu.push({ ...pos('BEB', '2001', z), ...n })
        }
      }
      if (!k || PROTHESENZAHN.test(k) || k === 'H' || k === 'R') continue
      if (k === 'A') hinweis('Adhäsivbrücke: GOZ 5150 (erste Spanne) bzw. 5160 (jede weitere) je Spanne ansetzen.')
      const zuo = TP_ZUORDNUNG[k]
      if (!zuo) {
        hinweis(`Für Therapiekürzel ${k} (Zahn ${z}) ist keine GOZ/BEB-Zuordnung hinterlegt – bitte manuell ergänzen.`)
        continue
      }
      const anker = brueckenAnker.has(z) || GESCHIEBE.test(k) || stegAnker.has(z)
      const goz = anker && zuo.gozAnker ? zuo.gozAnker : zuo.goz
      if (goz) neu.push(pos('GOZ', goz, z))
      for (const b of zuo.beb) neu.push(pos('BEB', b, z))
      if (GESCHIEBE.test(k)) neu.push(pos('GOZ', '5080', z))
      if (PFEILERKRONE.test(k) && (andersZ || !hatte19)) neu.push(pos('GOZ', andersZ && brueckenAnker.has(z) ? '5120' : '2270', z))
    }
    for (const z of sitz) {
      if (tp[z] !== 'R' || stegAnker.has(z)) continue
      hinweis(`Wurzelstiftkappe ${z}: zahnärztlich GOZ 5030, zahntechnische Leistung bitte ergänzen.`)
      neu.push(pos('GOZ', '5030', z))
    }

    // ---- neue Brücken (nicht in der Regelversorgung) ----
    const regelSpannen = new Set(spannen.map((p) => p.zahn))
    for (const b of bruecken) {
      const ankerSpanne = `${b.links && b.anker.includes(b.links) ? b.links : b.zaehne[0]}-${b.rechts && b.anker.includes(b.rechts) ? b.rechts : b.zaehne[b.zaehne.length - 1]}`
      const andersB = b.zaehne.some((z) => anders.has(z))
      if (!regelSpannen.has(ankerSpanne) && (b.zaehne.some((z) => tp[z]) || andersB)) neu.push(pos('GOZ', '5070', spanne(b.zaehne)))
      if (andersB) neu.push(pos('GOZ', '5140', spanne(b.zaehne)))
    }

    // ---- Stege: je Spanne GOZ 5070 + 5080, Steganker mit Kappe ----
    for (const s of stege) {
      const zahn = spanne(s.zaehne)
      neu.push(pos('GOZ', '5070', zahn), pos('GOZ', '5080', zahn))
      neu.push(pos('BEB', '3031', zahn), pos('BEB', '3032', zahn, s.zaehne.length), pos('BEB', zahnlos ? '3621' : '3623', zahn))
    }
    for (const x of stegAnker) {
      const k = plan(x)
      if (k === 'SO') neu.push(pos('GOZ', '5030', x), pos('BEB', '2035', x), pos('BEB', '3906', x))
      else if (k === 'R' || B(x) === 'r' || B(x) === 'rw') {
        entfernen((p) => p.zahn === x && ((p.ebene === 'BEMA' && p.nr === '90') || (p.ebene === 'BEL' && /^(1013|1343)$/.test(p.nr))))
        neu.push(pos('GOZ', '5030', x), pos('BEB', '2181', x))
      } else if (!PFEILERKRONE.test(k)) hinweis(`Steg: Zahn ${x} ist kein Steganker (Krone, Wurzelkappe oder Implantat mit SO) – Planung bitte prüfen.`)
    }
    const einzelanker = sitz.filter((z) => plan(z) === 'SO' && !stegAnker.has(z))
    for (const z of einzelanker) neu.push(pos('GOZ', '5080', z), pos('BEB', '3027', z))
    if (einzelanker.length) hinweis(`Implantat-Einzelanker (Locator/Kugelkopf) ${einzelanker.join(', ')}: GOZ 5080 je Verbindungselement – ob zusätzlich GOZ 5030 je Implantat anfällt, bitte prüfen.`)

    // ---- andersartige Prothese nach GOZ/BEB ----
    if (prothese === 'andersartig' && prothesenZaehne.length) {
      const n = prothesenZaehne.length
      if (zahnlos) {
        neu.push(pos('GOZ', kiefer === 'OK' ? '5220' : '5230', kiefer), pos('GOZ', kiefer === 'OK' ? '5180' : '5190', kiefer))
        neu.push(pos('BEB', '6001', kiefer), pos('BEB', '6002', kiefer, n), pos('BEB', '6301', kiefer), pos('BEB', '6302', kiefer, n))
      } else {
        neu.push(pos('GOZ', '5210', kiefer))
        for (const l of laeufe((z) => PROTHESENZAHN.test(plan(z)) && !STEGZAHN.test(plan(z)))) {
          if (!prothesenSpannen.has(spanne(l.zaehne)) && [l.links, l.rechts].some((x) => !!x && PFEILERKRONE.test(plan(x)))) neu.push(pos('GOZ', '5070', spanne(l.zaehne)))
        }
        neu.push(pos('BEB', '4001', kiefer), pos('BEB', '6001', kiefer), pos('BEB', '6003', kiefer, n), pos('BEB', '6311', kiefer), pos('BEB', '6312', kiefer, n))
      }
      hinweis(`${kieferName}: ${implantatProthese ? 'implantatgetragene Prothese' : regelProthese ? 'Prothese mit anderer Verankerung' : 'Prothese statt Brücke'} – andersartige Versorgung, Leistungen nach GOZ/BEB.`)
    }

    for (const z of sitz) {
      if (!tp[z] || !/^SK/.test(tp[z]) || !anders.has(z) || !GLIED.test(R[z] ?? '')) continue
      const i = sitz.indexOf(z)
      const [l, r] = [sitz[i - 1], sitz[i + 1]]
      if (l && r && !B(l) && !B(r) && !GLIED.test(R[l] ?? '') && !GLIED.test(R[r] ?? ''))
        hinweis(`Implantat ${z} in einer Einzelzahnlücke mit gesunden Nachbarzähnen: liegt ein Ausnahmefall nach Nr. 36 a) ZE-Richtlinie vor (keine Parodontalbehandlung nötig), ist die Suprakonstruktion Regel- bzw. gleichartige Versorgung (BEMA 20 i/19 i). Berechnet ist der Normalfall (andersartig, GOZ 2270).`)
    }
  }

  // ---- Grundleistungen festsitzend: BEL nur, solange BEL-Kronen/-Brücken bleiben ----
  const einheiten = positionen.filter((p) => p.ebene === 'BEL' && EINHEIT_BEL.has(p.nr)).reduce((s, p) => s + p.anzahl, 0)
  const belArbeit = positionen.some((p) => p.ebene === 'BEL' && ZAHNARBEIT_BEL.test(p.nr))
  const bebKiefer = new Set(neu.filter((p) => p.ebene === 'BEB' && /^\d\d$/.test(p.zahn) && !(tp[p.zahn] ?? R[p.zahn] ?? '').startsWith('S')).map((p) => kieferVon(p.zahn)))
  const bebArbeit = neu.some((p) => p.ebene === 'BEB' && /^\d\d$/.test(p.zahn))
  positionen = positionen.flatMap((p): Position[] => {
    if (p.ebene !== 'BEL') return [p]
    if (p.nr === '9700') return einheiten ? [{ ...p, anzahl: einheiten }] : []
    if (belArbeit || !['0010', '0051', '0120'].includes(p.nr) || (p.nr !== '0051' && p.zahn !== '')) return [p]
    if (!bebArbeit) return []
    if (p.nr === '0010') return [{ ...p, ebene: 'BEB', nr: '0002' }]
    if (p.nr === '0120') return [{ ...p, ebene: 'BEB', nr: '0402' }]
    const k = zahnListe(p.zahn).filter((x) => bebKiefer.has(x as 'OK' | 'UK'))
    return k.length ? [{ ...p, ebene: 'BEB', nr: '0021', zahn: k.join(','), anzahl: k.length }] : []
  })

  return { ...regel, positionen: [...positionen, ...neu], hinweise }
}

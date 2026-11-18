/**
 * Reihenfolge der Rechnungspositionen, dieselbe wie die Behandlungsschritte.
 * Überschriften stehen nur auf der Rechnung. Die Übergabe ans Praxisprogramm sortiert mit und lässt die Überschriften weg.
 * Die Tabelle muss zu Start/src/schritte.ts passen (Test dort).
 */
export type RechnungAbschnitt = 'vor' | 'haupt' | 'abschluss' | 'kontrolle' | 'sonst'

const ORT: Record<string, [RechnungAbschnitt, number]> = {
  'GOAE:1': ['vor', 10],
  'GOAE:3': ['vor', 11],
  'GOAE:5': ['vor', 12],
  'GOAE:6': ['vor', 12],
  'GOAE:34': ['vor', 14],
  'GOZ:0010': ['vor', 12],
  'GOZ:0070': ['vor', 16],
  'GOZ:0030': ['vor', 20],
  'GOZ:0040': ['vor', 20],
  'GOAE:5000': ['vor', 30],
  'GOAE:5002': ['vor', 30],
  'GOAE:5004': ['vor', 31],
  'GOAE:5370': ['vor', 32],
  'GOAE:5377': ['vor', 33],
  'GOZ:0050': ['vor', 40],
  'GOZ:0060': ['vor', 40],
  'GOZ:0065': ['vor', 40],
  'GOZ:5170': ['vor', 41],
  'GOZ:9000': ['vor', 45],
  'GOZ:9003': ['vor', 46],
  'GOZ:1000': ['vor', 50],
  'GOZ:1010': ['vor', 51],
  'GOZ:1040': ['vor', 52],
  'GOZ:4050': ['vor', 53],
  'GOZ:4055': ['vor', 53],
  'GOZ:0080': ['haupt', 100],
  'GOZ:0090': ['haupt', 101],
  'GOZ:0100': ['haupt', 102],
  'GOZ:9005': ['haupt', 105],
  'GOZ:2040': ['haupt', 110],
  'GOZ:2030': ['haupt', 112],
  'GOZ:2290': ['haupt', 120],
  'GOZ:2300': ['haupt', 121],
  'GOZ:2390': ['haupt', 130],
  'GOZ:2360': ['haupt', 131],
  'GOZ:2410': ['haupt', 132],
  'GOZ:2400': ['haupt', 133],
  'GOZ:2420': ['haupt', 134],
  'GOZ:2430': ['haupt', 135],
  'GOZ:2440': ['haupt', 136],
  'GOZ:3070': ['haupt', 140],
  'GOZ:3000': ['haupt', 150],
  'GOZ:3010': ['haupt', 150],
  'GOZ:3020': ['haupt', 150],
  'GOZ:3030': ['haupt', 151],
  'GOZ:3040': ['haupt', 151],
  'GOZ:3045': ['haupt', 151],
  'GOZ:3110': ['haupt', 152],
  'GOZ:3120': ['haupt', 152],
  'GOZ:3190': ['haupt', 153],
  'GOZ:9090': ['haupt', 155],
  'GOZ:9140': ['haupt', 155],
  'GOZ:9100': ['haupt', 156],
  'GOZ:9110': ['haupt', 157],
  'GOZ:9120': ['haupt', 157],
  'GOZ:9130': ['haupt', 157],
  'GOZ:9150': ['haupt', 158],
  'GOZ:9170': ['haupt', 159],
  'GOZ:9160': ['haupt', 159],
  'GOZ:9010': ['haupt', 160],
  'GOZ:9020': ['haupt', 160],
  'GOZ:9040': ['haupt', 161],
  'GOZ:9050': ['haupt', 170],
  'GOZ:9060': ['haupt', 171],
  'GOAE:2442': ['haupt', 175],
  'GOAE:2381': ['haupt', 180],
  'GOAE:2382': ['haupt', 180],
  'GOZ:3240': ['haupt', 181],
  'GOZ:3100': ['haupt', 185],
  'GOZ:3050': ['haupt', 190],
  'GOZ:3060': ['haupt', 190],
  'GOZ:2180': ['haupt', 195],
  'GOZ:2190': ['haupt', 196],
  'GOZ:2195': ['haupt', 196],
  'GOZ:2050': ['haupt', 200],
  'GOZ:2060': ['haupt', 200],
  'GOZ:2070': ['haupt', 200],
  'GOZ:2080': ['haupt', 200],
  'GOZ:2090': ['haupt', 200],
  'GOZ:2100': ['haupt', 200],
  'GOZ:2110': ['haupt', 200],
  'GOZ:2120': ['haupt', 200],
  'GOZ:2020': ['haupt', 205],
  'GOZ:2150': ['haupt', 210],
  'GOZ:2160': ['haupt', 210],
  'GOZ:2170': ['haupt', 210],
  'GOZ:2200': ['haupt', 220],
  'GOZ:2210': ['haupt', 220],
  'GOZ:2220': ['haupt', 220],
  'GOZ:5000': ['haupt', 221],
  'GOZ:5010': ['haupt', 221],
  'GOZ:5020': ['haupt', 221],
  'GOZ:5030': ['haupt', 221],
  'GOZ:5040': ['haupt', 221],
  'GOZ:5070': ['haupt', 222],
  'GOZ:2260': ['haupt', 215],
  'GOZ:2270': ['haupt', 215],
  'GOZ:5120': ['haupt', 215],
  'GOZ:5140': ['haupt', 216],
  'GOZ:5200': ['haupt', 225],
  'GOZ:5210': ['haupt', 225],
  'GOZ:5220': ['haupt', 225],
  'GOZ:5230': ['haupt', 225],
  'GOZ:2197': ['haupt', 230],
  'GOZ:6190': ['haupt', 290],
  'GOZ:8000': ['haupt', 60],
  'GOZ:8010': ['haupt', 70],
  'GOZ:8020': ['haupt', 71],
  'GOZ:8030': ['haupt', 71],
  'GOZ:8035': ['haupt', 71],
  'GOZ:8050': ['haupt', 72],
  'GOZ:8060': ['haupt', 72],
  'GOZ:8065': ['haupt', 72],
  'GOZ:8080': ['haupt', 80],
  'GOZ:8090': ['haupt', 81],
  'GOZ:7000': ['haupt', 226],
  'GOZ:7010': ['haupt', 226],
  'GOZ:7020': ['haupt', 226],
  'GOZ:7070': ['haupt', 227],
  'GOZ:7030': ['haupt', 228],
  'GOZ:7080': ['haupt', 215],
  'GOZ:7090': ['haupt', 215],
  'GOZ:7100': ['haupt', 228],
  'GOZ:8100': ['haupt', 240],
  'GOZ:4040': ['haupt', 240],
  'BEMA:K1': ['haupt', 226],
  'BEMA:K2': ['haupt', 226],
  'BEMA:K3': ['haupt', 226],
  'BEMA:K4': ['haupt', 227],
  'BEMA:K6': ['haupt', 228],
  'BEMA:7a': ['vor', 40],
  'BEMA:7b': ['vor', 40],
  'GOZ:4000': ['vor', 13],
  'GOZ:4005': ['vor', 13],
  'GOZ:4020': ['haupt', 141],
  'GOZ:4030': ['haupt', 142],
  'GOZ:4070': ['haupt', 145],
  'GOZ:4075': ['haupt', 145],
  'GOZ:4025': ['haupt', 146],
  'GOZ:4080': ['haupt', 147],
  'GOZ:4090': ['haupt', 148],
  'GOZ:4100': ['haupt', 148],
  'GOZ:4136': ['haupt', 148],
  'GOZ:4110': ['haupt', 149],
  'GOZ:4138': ['haupt', 149],
  'GOZ:4120': ['haupt', 182],
  'GOZ:4130': ['haupt', 182],
  'GOZ:4133': ['haupt', 182],
  'BEMA:4': ['vor', 13],
  'BEMA:ATG': ['vor', 15],
  'BEMA:MHU': ['vor', 50],
  'BEMA:AITa': ['haupt', 145],
  'BEMA:AITb': ['haupt', 145],
  'BEMA:CPT': ['haupt', 148],
  'BEMA:CPTa': ['haupt', 148],
  'BEMA:CPTb': ['haupt', 148],
  'BEMA:108': ['haupt', 240],
  'GOZ:6000': ['vor', 42],
  'GOZ:6010': ['vor', 43],
  'GOZ:6020': ['vor', 44],
  'GOZ:6220': ['vor', 47],
  'GOZ:6030': ['haupt', 232],
  'GOZ:6040': ['haupt', 232],
  'GOZ:6050': ['haupt', 232],
  'GOZ:6060': ['haupt', 232],
  'GOZ:6070': ['haupt', 232],
  'GOZ:6080': ['haupt', 232],
  'GOZ:6090': ['haupt', 232],
  'GOZ:6100': ['haupt', 233],
  'GOZ:6120': ['haupt', 233],
  'GOZ:6140': ['haupt', 234],
  'GOZ:6150': ['haupt', 234],
  'GOZ:6160': ['haupt', 235],
  'GOZ:6170': ['haupt', 235],
  'GOZ:6200': ['haupt', 236],
  'GOZ:6230': ['haupt', 236],
  'GOZ:6240': ['haupt', 237],
  'GOZ:6250': ['haupt', 237],
  'GOZ:6260': ['haupt', 237],
  'GOZ:6180': ['haupt', 238],
  'GOZ:6110': ['haupt', 245],
  'GOZ:6130': ['haupt', 245],
  'BEMA:116': ['vor', 42],
  'BEMA:117': ['vor', 43],
  'BEMA:118': ['vor', 44],
  'BEMA:119': ['haupt', 232],
  'BEMA:120': ['haupt', 232],
  'BEMA:126a': ['haupt', 233],
  'BEMA:126b': ['haupt', 233],
  'BEMA:127a': ['haupt', 234],
  'BEMA:128a': ['haupt', 234],
  'BEMA:01': ['vor', 12],
  'BEMA:04': ['vor', 13],
  'BEMA:107': ['vor', 53],
  'BEMA:40': ['haupt', 101],
  'BEMA:41a': ['haupt', 102],
  'BEMA:105': ['haupt', 141],
  'BEMA:13a': ['haupt', 200],
  'BEMA:13b': ['haupt', 200],
  'BEMA:13c': ['haupt', 200],
  'BEMA:13d': ['haupt', 200],
  'GOZ:3290': ['kontrolle', 300],
  'GOZ:3300': ['kontrolle', 301],
  'GOZ:3310': ['kontrolle', 302],
  'GOZ:2130': ['kontrolle', 310],
  'GOZ:1020': ['kontrolle', 320],
  'GOZ:4150': ['kontrolle', 303],
  'BEMA:111': ['kontrolle', 303],
  'BEMA:BEV': ['kontrolle', 304],
  'BEMA:BEVa': ['kontrolle', 304],
  'BEMA:BEVb': ['kontrolle', 305],
  'GOZ:4060': ['kontrolle', 321],
  'GOZ:7040': ['kontrolle', 330],
  'GOZ:7050': ['kontrolle', 331],
  'GOZ:7060': ['kontrolle', 332],
  'BEMA:K7': ['kontrolle', 330],
  'BEMA:K8': ['kontrolle', 331],
  'BEMA:K9': ['kontrolle', 332],
  'GOZ:6210': ['kontrolle', 335],
  'BEMA:122a': ['kontrolle', 335],
  'BEMA:UPTa': ['kontrolle', 340],
  'BEMA:UPTb': ['kontrolle', 340],
  'BEMA:UPTc': ['kontrolle', 340],
  'BEMA:UPTd': ['kontrolle', 340],
  'BEMA:UPTe': ['kontrolle', 340],
  'BEMA:UPTf': ['kontrolle', 340],
  'BEMA:UPTg': ['kontrolle', 340],
}

export const RECHNUNG_ORT = ORT

const ZUSCHLAG = new Set<string>(['GOZ:0110', 'GOZ:0120', 'GOZ:0500', 'GOZ:0510', 'GOZ:0520', 'GOZ:0530', 'GOAE:440', 'GOAE:441', 'GOAE:442', 'GOAE:443', 'GOAE:444', 'GOAE:445'])

const STUFEN: [number, string][] = [
  [69, 'Funktionsanalyse'], [79, 'Registrierung'], [99, 'Modellanalyse'], [119, 'Betäubung und Arbeitsfeld'],
  [129, 'Alte Versorgung entfernen'], [139, 'Wurzelbehandlung'], [149, 'Parodontalbehandlung'], [194, 'Chirurgischer Eingriff'],
  [209, 'Aufbau und Füllung'], [219, 'Provisorium'], [231, 'Eingliederung'], [239, 'Kieferorthopädische Behandlung'],
  [249, 'Feineinstellung'], [289, 'Weitere Leistungen'], [299, 'Abschluss der Sitzung'],
]

const TITEL: Record<Exclude<RechnungAbschnitt, 'sonst'>, string> = {
  vor: 'Vorbereitende Maßnahmen',
  haupt: 'Hauptbehandlung',
  abschluss: 'Abschließende Maßnahmen',
  kontrolle: 'Kontrollen',
}

const PHASE_IMPL = ['', 'Planung', 'Knochenaufbau', 'Implantation', 'Freilegung', 'Nachsorge']

export interface RechnungFeld { ebene: string; nr: string; sitzung?: number }

const klinisch = (ebene: string) => ebene === 'GOZ' || ebene === 'GOAE' || ebene === 'BEMA'

function zuschlagRang(schluessel: string): number {
  if (schluessel === 'GOZ:0110' || schluessel === 'GOZ:0120') return 103
  if (/^GOZ:05[0-3]0$/.test(schluessel)) return 191
  return 198
}

function phaseVon(rang: number, sitzung: number, impl: boolean): string {
  if (impl && sitzung > 0 && PHASE_IMPL[sitzung]) return PHASE_IMPL[sitzung]
  return STUFEN.find(([bis]) => rang <= bis)?.[1] ?? ''
}

interface Stelle { abschnitt: RechnungAbschnitt; rang: number; sitzung: number; phase: string; i: number }

function stellen<T>(zeilen: T[], feld: (z: T) => RechnungFeld, impl: boolean): Stelle[] {
  const felder = zeilen.map(feld)
  const mitSitzung = felder.some((f) => (f.sitzung ?? 0) > 0)
  const letzte = Math.max(0, ...felder.map((f) => f.sitzung ?? 0))
  const bildSchon = new Set<string>()
  return felder.map((f, i) => {
    const ebene = String(f.ebene || '')
    const nr = String(f.nr || '').trim()
    const sitzung = f.sitzung && f.sitzung > 0 ? f.sitzung : 0
    if (!klinisch(ebene) || !nr) return { abschnitt: 'sonst', rang: 0, sitzung: 0, phase: '', i }
    const schluessel = ebene + ':' + nr
    if (ZUSCHLAG.has(schluessel)) {
      const rang = zuschlagRang(schluessel)
      return { abschnitt: 'haupt', rang, sitzung, phase: phaseVon(rang, sitzung, impl), i }
    }
    const bekannt = ORT[schluessel]
    let abschnitt: RechnungAbschnitt = bekannt?.[0] ?? 'haupt'
    const rang = bekannt?.[1] ?? 250
    const bild = abschnitt === 'vor' && rang >= 30 && rang <= 33
    if (mitSitzung && sitzung) {
      if (sitzung === 1) abschnitt = 'vor'
      else if (impl && sitzung === letzte && letzte >= 5) abschnitt = 'kontrolle'
      else if (bild) abschnitt = 'kontrolle'
      else if (abschnitt === 'vor') abschnitt = 'haupt'
    } else if (bild && bildSchon.has(schluessel)) abschnitt = 'kontrolle'
    if (bild) bildSchon.add(schluessel)
    if (abschnitt === 'haupt' && rang >= 290 && rang < 300) abschnitt = 'abschluss'
    const phase = abschnitt === 'haupt' ? phaseVon(rang, sitzung, impl && mitSitzung) : ''
    return { abschnitt, rang, sitzung, phase, i }
  })
}

const FOLGE: Record<RechnungAbschnitt, number> = { vor: 0, haupt: 1, abschluss: 2, kontrolle: 3, sonst: 4 }

function geordnet<T>(zeilen: T[], feld: (z: T) => RechnungFeld, impl: boolean) {
  const liste = stellen(zeilen, feld, impl)
  return zeilen.map((zeile, i) => ({ zeile, s: liste[i] })).sort((a, b) =>
    FOLGE[a.s.abschnitt] - FOLGE[b.s.abschnitt] || a.s.sitzung - b.s.sitzung || a.s.rang - b.s.rang || a.s.i - b.s.i)
}

/** Dieselbe Folge wie die Behandlungsschritte. Labor und Material bleiben hinten, in ihrer bisherigen Folge. */
export function nachSchritten<T>(zeilen: T[], feld: (z: T) => RechnungFeld, impl = false): T[] {
  return geordnet(zeilen, feld, impl).map((x) => x.zeile)
}

export interface Glied<T> { zeile: T; ueberschrift?: string }

/** Sortierte Zeilen. Eine Überschrift steht nur an der ersten Zeile eines Abschnitts oder einer Stufe. */
export function mitUeberschrift<T>(zeilen: T[], feld: (z: T) => RechnungFeld, impl = false): Glied<T>[] {
  let zuletzt = ''
  return geordnet(zeilen, feld, impl).map(({ zeile, s }) => {
    if (s.abschnitt === 'sonst') return { zeile }
    const titel = s.phase ? TITEL[s.abschnitt] + ' · ' + s.phase : TITEL[s.abschnitt]
    const ueberschrift = titel === zuletzt ? undefined : titel
    zuletzt = titel
    return ueberschrift ? { zeile, ueberschrift } : { zeile }
  })
}

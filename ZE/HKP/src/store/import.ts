import * as XLSX from 'xlsx'
import type { EintragNachTyp, ListenTyp, Preisliste } from '../types'
import { kzvNachNr } from '../data/kzv'
import { csvZeilen, dekodieren, istVdds, vddsAuswerten, vddsDateiname, zahl } from './vdds'

export { zahl }

export interface ImportErgebnis<T extends ListenTyp = ListenTyp> {
  eintraege: EintragNachTyp[T][]
  meta: Partial<Pick<Preisliste, 'name' | 'gueltigAb' | 'punktwert' | 'quelle' | 'kzv'>>
  warnungen: string[]
}

const SPALTEN: Record<string, RegExp> = {
  nr: /^(nr|nummer|geb\.?-?nr|gebnr|ziffer|pos|position|bel-?nr|beb-?nr|befund(-?nr)?|code|kürzel|kuerzel)\.?$/i,
  text: /^(text|bezeichnung|leistung|leistungstext|beschreibung|leistungsbeschreibung|befundtext)$/i,
  punkte: /^(punkte|punktzahl|bew\.?-?zahl|bewertungszahl|bewertung)$/i,
  preis: /^(preis|betrag|euro|eur|preis ?eur|preis ?€|vk|einzelpreis)$/i,
  gewerbe: /^(gewerbe|gewerblich|gewerbelabor|fremdlabor|preis ?gewerbe)$/i,
  praxis: /^(praxis|praxislabor|eigenlabor|preis ?praxis)$/i,
  honorar: /^(honorar)$/i,
  mul: /^(mul|mul-?kosten|material.*labor.*)$/i,
  b60: /^(60|60 ?%|bonus ?0|ohne bonus)$/i,
  b70: /^(70|70 ?%|bonus ?1)$/i,
  b75: /^(75|75 ?%|bonus ?2)$/i,
  b100: /^(100|100 ?%|härtefall|haertefall|gesamt)$/i,
  hinweis: /^(hinweis|bemerkung|abrechnungsbestimmung)$/i,
}

function spaltenZuordnen(kopf: string[]) {
  const map: Record<string, number> = {}
  kopf.forEach((k, i) => {
    const name = String(k ?? '').trim()
    for (const [feld, re] of Object.entries(SPALTEN)) {
      if (map[feld] === undefined && re.test(name)) map[feld] = i
    }
  })
  return map
}

function zeileZuEintrag(typ: ListenTyp, z: unknown[], m: Record<string, number>): EintragNachTyp[ListenTyp] | null {
  const get = (f: string) => (m[f] === undefined ? '' : z[m[f]])
  const nr = String(get('nr') ?? '').trim()
  if (!nr) return null
  const text = String(get('text') ?? '').trim()
  switch (typ) {
    case 'bema':
    case 'goz':
      return { nr, text, punkte: zahl(get('punkte')), ...(get('hinweis') ? { hinweis: String(get('hinweis')) } : {}) }
    case 'bel2': {
      const g = m.gewerbe !== undefined ? zahl(get('gewerbe')) : zahl(get('preis'))
      const p = m.praxis !== undefined ? zahl(get('praxis')) : g
      return { nr: nr.replace(/\s/g, ''), text, gewerbe: g, praxis: p }
    }
    case 'beb':
      return { nr, text, preis: zahl(get('preis')) }
    case 'festzuschuss': {
      const b100 = zahl(get('b100'))
      const honorar = zahl(get('honorar'))
      const mul = zahl(get('mul'))
      const h = b100 || honorar + mul
      return {
        nr, text, honorar, mul,
        betraege: {
          '60': zahl(get('b60')) || runden(h * 0.6),
          '70': zahl(get('b70')) || runden(h * 0.7),
          '75': zahl(get('b75')) || runden(h * 0.75),
          '100': h,
        },
      }
    }
  }
}

const runden = (n: number) => Math.round(n * 100) / 100

function tabelleAuswerten(typ: ListenTyp, zeilen: unknown[][], dateiname = ''): ImportErgebnis {
  const warnungen: string[] = []
  zeilen = zeilen.filter((z) => z.some((c) => String(c ?? '').trim() !== ''))
  if (!zeilen.length) return { eintraege: [], meta: {}, warnungen: ['Die Datei enthält keine Zeilen.'] }

  let map: Record<string, number>
  let daten: unknown[][]
  if (typ === 'bel2' && istVdds(zeilen)) {
    const name = vddsDateiname(dateiname)
    const kzv = name ? kzvNachNr(name.kzv) : undefined
    const r = vddsAuswerten(zeilen, { nurPraxis: kzv?.nurPraxis })
    return {
      eintraege: r.eintraege,
      meta: kzv && name ? { name: `BEL II ${kzv.name} (${kzv.kurz})`, gueltigAb: name.gueltigAb, kzv: kzv.nr } : {},
      warnungen: kzv && name ? [...r.warnungen, `Dateiname: KZV ${kzv.name}, gültig ab ${name.gueltigAb.split('-').reverse().join('.')}.`] : r.warnungen,
    }
  } else {
    const kopfIndex = zeilen.findIndex((z) => Object.keys(spaltenZuordnen(z.map(String))).includes('nr'))
    if (kopfIndex < 0) {
      return {
        eintraege: [], meta: {},
        warnungen: ['Keine Kopfzeile mit einer Spalte „Nr“ gefunden. Erwartet werden z. B. die Spalten: Nr; Text; Punkte bzw. Preis.'],
      }
    }
    map = spaltenZuordnen(zeilen[kopfIndex].map(String))
    daten = zeilen.slice(kopfIndex + 1)
    const pflicht: Record<ListenTyp, string[]> = {
      bema: ['punkte'], goz: ['punkte'], bel2: [], beb: ['preis'], festzuschuss: [],
    }
    for (const f of pflicht[typ]) if (map[f] === undefined) warnungen.push(`Spalte „${f}“ nicht gefunden.`)
    if (typ === 'bel2' && map.gewerbe === undefined && map.preis === undefined) warnungen.push('Weder Spalte „Gewerbe“ noch „Preis“ gefunden.')
    if (typ === 'festzuschuss' && map.b100 === undefined && map.honorar === undefined) warnungen.push('Spalte „100%“ bzw. „Honorar“/„MuL“ nicht gefunden.')
  }

  const eintraege: EintragNachTyp[ListenTyp][] = []
  let ungueltig = 0
  for (const z of daten) {
    const e = zeileZuEintrag(typ, z, map)
    if (!e) continue
    const werte = Object.values(e).filter((v) => typeof v === 'number') as number[]
    if (werte.some((v) => Number.isNaN(v))) {
      ungueltig++
      continue
    }
    eintraege.push(e)
  }
  if (ungueltig) warnungen.push(`${ungueltig} Zeile(n) mit ungültigen Zahlen wurden übersprungen.`)
  return { eintraege, meta: {}, warnungen }
}

export async function dateiImportieren(typ: ListenTyp, datei: File): Promise<ImportErgebnis> {
  const endung = datei.name.split('.').pop()?.toLowerCase() ?? ''
  const buf = await datei.arrayBuffer()

  if (endung === 'json') {
    const daten = JSON.parse(dekodieren(buf))
    const roh: unknown[] = Array.isArray(daten) ? daten : daten.eintraege
    if (!Array.isArray(roh)) return { eintraege: [], meta: {}, warnungen: ['JSON enthält kein Feld „eintraege“.'] }
    if (!Array.isArray(daten) && daten.typ && daten.typ !== typ) {
      return { eintraege: [], meta: {}, warnungen: [`Die Datei ist eine Liste vom Typ „${daten.typ}“, erwartet wird „${typ}“.`] }
    }
    const kopf = Object.keys((roh[0] as object) ?? {})
    const flach = roh.map((e) => {
      const o = e as Record<string, unknown>
      const b = (o.betraege ?? {}) as Record<string, unknown>
      return kopf.map((k) => o[k]).concat([b['60'], b['70'], b['75'], b['100']])
    })
    const ergebnis = tabelleAuswerten(typ, [[...kopf, '60', '70', '75', '100'], ...flach])
    if (!Array.isArray(daten)) {
      ergebnis.meta = { name: daten.name, gueltigAb: daten.gueltigAb, punktwert: daten.punktwert, quelle: daten.quelle, kzv: daten.kzv }
    }
    return ergebnis
  }

  if (endung === 'xlsx' || endung === 'xls' || endung === 'ods') {
    const wb = XLSX.read(buf, { type: 'array' })
    const blatt = wb.Sheets[wb.SheetNames[0]]
    const zeilen = XLSX.utils.sheet_to_json<unknown[]>(blatt, { header: 1, raw: true, defval: '' })
    return tabelleAuswerten(typ, zeilen)
  }

  return tabelleAuswerten(typ, csvZeilen(dekodieren(buf)), datei.name)
}

export function alsCsv(liste: Preisliste): string {
  const esc = (v: unknown) => {
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '')
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const zeilen: unknown[][] = []
  switch (liste.typ) {
    case 'bema':
    case 'goz':
      zeilen.push(['Nr', 'Text', 'Punkte'])
      for (const e of liste.eintraege as EintragNachTyp['goz'][]) zeilen.push([e.nr, e.text, e.punkte])
      break
    case 'bel2':
      zeilen.push(['Nr', 'Text', 'Gewerbe', 'Praxis'])
      for (const e of liste.eintraege as EintragNachTyp['bel2'][]) zeilen.push([e.nr, e.text, e.gewerbe, e.praxis])
      break
    case 'beb':
      zeilen.push(['Nr', 'Text', 'Preis'])
      for (const e of liste.eintraege as EintragNachTyp['beb'][]) zeilen.push([e.nr, e.text, e.preis])
      break
    case 'festzuschuss':
      zeilen.push(['Befund', 'Text', 'Honorar', 'MuL', '60%', '70%', '75%', '100%'])
      for (const e of liste.eintraege as EintragNachTyp['festzuschuss'][])
        zeilen.push([e.nr, e.text, e.honorar, e.mul, e.betraege['60'], e.betraege['70'], e.betraege['75'], e.betraege['100']])
      break
  }
  return '\uFEFF' + zeilen.map((z) => z.map(esc).join(';')).join('\r\n')
}

export function herunterladen(dateiname: string, inhalt: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([inhalt], { type: mime }))
  const a = Object.assign(document.createElement('a'), { href: url, download: dateiname })
  a.click()
  URL.revokeObjectURL(url)
}

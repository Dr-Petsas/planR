/**
 * Korrektur am offenen Plan: erst sagen, was sich ändern würde, und „Soll ich das anpassen?“
 * Schreiben passiert woanders, und nur nach Ja.
 */
export interface ZahnZahl {
  zahn: string
  anzahl: number
}

export interface ArbeitStand {
  implantZaehne: string[]
  systemName: string
  goz9050: ZahnZahl[]
  /** Zähne, an denen 9050 neben 9010 oder 9040 nicht dazukommt */
  gesperrt9050: string[]
  kannSystem: boolean
  kann9050: boolean
  /** gesetzte System-ID, damit „Straumann“ nicht noch einmal vorgeschlagen wird */
  systemId?: string
  /** freigegeben: nichts schreiben */
  gesperrt?: boolean
  leistungen?: string
}

export type ArbeitTun =
  | { art: 'system'; systemId: string }
  | { art: '9050'; anzahl: number }
  | { art: 'beides'; systemId: string; anzahl: number }

export type ArbeitErgebnis =
  | { art: 'fremd' }
  | { art: 'antwort'; text: string }
  | { art: 'vorschlag'; text: string; tun: ArbeitTun }

export const ANPASSEN = 'Soll ich das anpassen?'
const REGEL = 'GOZ 9050 geht üblich zweimal je Implantat, einmal für die Abformung und einmal für die Eingliederung, höchstens dreimal und nur einmal je Sitzung, und nicht neben 9010 oder 9040.'
const LEISTUNGEN = 'Ich beantworte die Regel zu GOZ 9050. Geschrieben wird nur, was dieser Plan selbst kann, und erst nach Ihrer Bestätigung.'

const SYSTEME: readonly (readonly [string, RegExp, string])[] = [
  ['medentis-icx', /medentis|medendis|\bicx\b/, 'medentis ICX'],
  ['straumann-bl', /strau ?mann?/, 'Straumann'],
  ['nobel-active', /nobel/, 'Nobel Biocare'],
  ['astra-ev', /astra/, 'Astra Tech'],
  ['ankylos', /ankylos|ankilos/, 'Ankylos'],
  ['xive', /\bxive\b|\bxi ve\b/, 'Xive'],
  ['camlog', /camlog|kamlog|conelog|konelog/, 'Camlog'],
  ['zimmer-tsv', /biomet|zimmer/, 'Zimmer Biomet'],
  ['biohorizons', /bio ?horizon/, 'BioHorizons'],
  ['bego-semados', /\bbego\b|semados/, 'BEGO'],
  ['bredent-copasky', /bredent|copa ?sky/, 'bredent'],
  ['champions-revolution', /champions?\b/, 'Champions'],
  ['mis-c1', /\bmis\b/, 'MIS'],
  ['neoss-proactive', /neoss/, 'Neoss'],
  ['osstem-tsiii', /osstem|ostem/, 'Osstem'],
  ['megagen-anyridge', /mega ?gen|any ?ridge/, 'MegaGen'],
  ['thommen-element', /thommen|thomen/, 'Thommen'],
  ['sic-invent', /sic ?(?:invent|ace|max)/, 'SIC invent'],
  ['dentaurum-tiologic', /dentaurum|tio ?logic/, 'Dentaurum'],
  ['implantdirect-legacy', /implant ?direct/, 'Implant Direct'],
]

const VERNEINT_DAVOR = /(?:\bstatt|\banstatt|\banstelle|\bnicht|\bkein\w*|\bohne|\bweg von)\s+(?:(?:dem|der|den|das|des|mit|im|in|von|vom|einem|einer|einen|eine)\s+)?$/

/** Letzte nicht verneinte Systemnennung. „Camlog statt Straumann“ bleibt Camlog. */
export function systemAusText(text: string): { id: string; name: string } | null {
  const t = ` ${text.toLowerCase().replace(/[‐–—-]/g, ' ').replace(/\s+/g, ' ')} `
  const treffer: { id: string; name: string; von: number; bis: number }[] = []
  for (const [id, re, name] of SYSTEME) {
    for (const m of t.matchAll(new RegExp(re.source, 'gi'))) {
      const von = m.index ?? 0
      treffer.push({ id, name, von, bis: von + m[0].length })
    }
  }
  const gueltig = treffer.filter((x) => !VERNEINT_DAVOR.test(t.slice(Math.max(0, x.von - 24), x.von)))
  const letzte = gueltig.sort((a, b) => b.von - a.von)[0]
  return letzte ? { id: letzte.id, name: letzte.name } : null
}

const wortzahl = (n: number) => (n === 1 ? 'einmal' : n === 2 ? 'zweimal' : n === 3 ? 'dreimal' : `${n}-mal`)

function anzahlGesagt(text: string): number | null {
  const t = text.toLowerCase()
  if (/zwei\s*mal|zweimal/.test(t)) return 2
  if (/drei\s*mal|dreimal/.test(t)) return 3
  if (/ein\s*mal|einmal/.test(t)) return 1
  const m = t.match(/(\d+)\s*(?:mal|×|x\b)/) ?? t.match(/(?:×|x)\s*(\d+)/) ?? t.match(/auf\s*(\d+)\b/)
  const n = m ? Number(m[1]) : 0
  return n > 0 && n < 20 ? n : null
}

function summe(stand: ArbeitStand, zahn: string): number {
  return stand.goz9050.reduce((s, p) => (p.zahn.split(/[^0-9]+/).includes(zahn) ? s + p.anzahl : s), 0)
}

function lage(stand: ArbeitStand, ziel: number): { zahn: string; anzahl: number; grund: 'fehlt' | 'anders' | 'gesperrt' }[] {
  const zeilen: { zahn: string; anzahl: number; grund: 'fehlt' | 'anders' | 'gesperrt' }[] = []
  for (const zahn of stand.implantZaehne) {
    const anzahl = summe(stand, zahn)
    if (stand.gesperrt9050.includes(zahn)) zeilen.push({ zahn, anzahl, grund: 'gesperrt' })
    else if (anzahl === 0) zeilen.push({ zahn, anzahl, grund: 'fehlt' })
    else if (anzahl !== ziel) zeilen.push({ zahn, anzahl, grund: 'anders' })
  }
  return zeilen
}

function lageSatz(zeilen: { zahn: string; anzahl: number; grund: 'fehlt' | 'anders' | 'gesperrt' }[]): string {
  const teile = zeilen.map((x) => x.grund === 'fehlt'
    ? `an ${x.zahn} fehlt sie`
    : x.grund === 'gesperrt'
      ? `an ${x.zahn} steht 9010 oder 9040, daneben geht 9050 nicht`
      : `an ${x.zahn} steht sie ${wortzahl(x.anzahl)}`)
  if (!teile.length) return ''
  return `${teile[0].charAt(0).toUpperCase()}${teile[0].slice(1)}${teile.length > 1 ? `, ${teile.slice(1).join(', ')}` : ''}.`
}

function mitFrage(teile: string[]): string {
  const kern = teile.map((t) => t.replace(ANPASSEN, '').trim()).filter(Boolean)
  return `${kern.join(' ')} ${ANPASSEN}`
}

function willSystem(text: string): boolean {
  return /implantatsystem|implantat[-\s]?system/i.test(text)
    || (/\bsystem\b/i.test(text) && /änder|aender|wechsel|nehm|nimm|setz|stell/i.test(text))
}

function will9050(text: string): boolean {
  return /9050/.test(text)
}

function regelFrage(text: string): boolean {
  return /geht|üblich|ueblich|darf|kann man|ist das|in der regel/i.test(text) || /\?\s*$/.test(text)
}

/**
 * Versteht eine Korrektur. `systemAus` kommt vom Plan (dieselbe Systemliste wie die Auswahl).
 * Ohne Treffer: fremd, damit die Zeile nichts erfindet.
 */
export function arbeitVerstehen(
  text: string,
  stand: ArbeitStand,
  systemAus: (text: string) => { id: string; name: string } | null = systemAusText,
): ArbeitErgebnis {
  const t = text.trim()
  if (!t) return { art: 'fremd' }
  if (/was kannst du|welche funktion/i.test(t)) {
    return { art: 'antwort', text: stand.leistungen || LEISTUNGEN }
  }
  const system = willSystem(t)
  const nr = will9050(t)
  if (!system && !nr) return { art: 'fremd' }
  if (stand.gesperrt && (system || (nr && !regelFrage(t)))) {
    return { art: 'antwort', text: 'Dieser Plan ist freigegeben. Ich ändere ihn nicht.' }
  }
  const implantate = stand.implantZaehne.length > 0
  const ziel = anzahlGesagt(t)
  const genannt = system ? systemAus(t) : null

  if (nr && regelFrage(t) && !system) {
    const kopf = ziel === 2 || ziel === null
      ? `Ja, das ist üblich. ${REGEL}`
      : ziel > 3
        ? `Nein. ${REGEL}`
        : `Möglich sind bis zu dreimal, üblich sind zweimal. ${REGEL}`
    if (!implantate) return { art: 'antwort', text: `${kopf} In diesem Plan sind keine Implantate, ich trage 9050 nicht ein.` }
    const offen = lage(stand, 2).filter((x) => x.grund !== 'gesperrt')
    const dicht = lage(stand, 2).filter((x) => x.grund === 'gesperrt')
    const satz = lageSatz([...offen, ...dicht])
    if (!offen.length) {
      return { art: 'antwort', text: `${kopf} ${satz || 'Im Plan steht sie schon zweimal je Implantat.'}`.replace(/\s+/g, ' ').trim() }
    }
    if (!stand.kann9050 || stand.gesperrt) {
      return { art: 'antwort', text: `${kopf} ${satz} Die Anzahl schreibe ich in diesem Plan nicht.`.replace(/\s+/g, ' ').trim() }
    }
    return { art: 'vorschlag', text: mitFrage([kopf, satz]), tun: { art: '9050', anzahl: 2 } }
  }

  if (system && !implantate) {
    return { art: 'antwort', text: 'In diesem Plan sind keine Implantate. Ein Implantatsystem trage ich nicht ein.' }
  }
  if (system && !stand.kannSystem) {
    return { art: 'antwort', text: 'Das Implantatsystem sehe ich, ändern kann ich es in diesem Plan nicht.' }
  }
  if (system && !genannt) {
    return { art: 'antwort', text: 'Welches Implantatsystem soll ich eintragen? Zum Beispiel Straumann, Camlog oder medentis ICX.' }
  }
  if (system && genannt) {
    const gleich = stand.systemId === genannt.id || stand.systemName.toLowerCase() === genannt.name.toLowerCase()
    const systemSatz = gleich
      ? `Das Implantatsystem ist schon ${genannt.name}.`
      : `Implantatsystem ${genannt.name}${stand.systemName ? ` statt ${stand.systemName}` : ''}.`
    const offen = lage(stand, 2).filter((x) => x.grund !== 'gesperrt')
    const schon = stand.kann9050 && !offen.length ? 'GOZ 9050 steht schon zweimal je Implantat.' : ''
    if (stand.kann9050 && offen.length && !stand.gesperrt) {
      return {
        art: 'vorschlag',
        text: mitFrage([systemSatz, 'GOZ 9050 geht üblich zweimal je Implantat.', lageSatz(offen)]),
        tun: { art: 'beides', systemId: genannt.id, anzahl: 2 },
      }
    }
    if (gleich) return { art: 'antwort', text: `${systemSatz} ${schon}`.trim() }
    return { art: 'vorschlag', text: mitFrage([systemSatz, schon]), tun: { art: 'system', systemId: genannt.id } }
  }

  if (nr && ziel && !regelFrage(t)) {
    if (!implantate) return { art: 'antwort', text: `${REGEL} In diesem Plan sind keine Implantate.` }
    if (!stand.kann9050) return { art: 'antwort', text: `${REGEL} Die Anzahl schreibe ich in diesem Plan nicht.` }
    if (ziel > 3) return { art: 'antwort', text: `GOZ 9050 setze ich nicht auf ${wortzahl(ziel)}. ${REGEL}` }
    return { art: 'vorschlag', text: mitFrage([`GOZ 9050 auf ${wortzahl(ziel)} je Implantat setzen.`]), tun: { art: '9050', anzahl: ziel } }
  }
  return { art: 'fremd' }
}

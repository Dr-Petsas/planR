/** Was Clara in der linken Spalte zum Anklicken oder Korrigieren zeigt. */

export const OK = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const UK = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']

/** eHKP-Kürzel, die im Schema angeklickt werden können. */
export const SCHEMA_CODES: [string, string][] = [
  ['', 'vorhanden'],
  ['f', 'fehlt'],
  ['k', 'überkront'],
  ['kw', 'Krone erneuerungsbedürftig'],
  ['pw', 'Teildefekt'],
  ['ww', 'weitgehend zerstört'],
  ['x', 'nicht erhaltungswürdig'],
  ['b', 'Brückenglied'],
  ['i', 'Implantat vorhanden'],
  ['t', 'Teleskop vorhanden'],
]

const WORT: [string, string][] = [
  ['f', 'fehlt'],
  ['f', 'fehlen'],
  ['x', 'nicht erhaltungswürdig'],
  ['ww', 'weitgehend zerstört'],
  ['pw', 'mit teildefekt'],
  ['pw', 'teildefekt'],
  ['k', 'überkront'],
  ['kw', 'krone erneuerungsbedürftig'],
  ['b', 'brückenglied'],
  ['i', 'implantat vorhanden'],
  ['i', 'implantat'],
  ['t', 'teleskop vorhanden'],
  ['t', 'teleskop'],
]

export type KastenGruppe = { frage: string; punkte: string[]; mehrere?: boolean }

export type Kasten = {
  art: 'befund' | 'wahl'
  titel: string
  hinweis?: string
  text?: string
  gruppen?: KastenGruppe[]
}

const ZAHN = /^[1-4][1-8]$/

function reiheVon(zahn: string): string[] | null {
  if (OK.includes(zahn)) return OK
  if (UK.includes(zahn)) return UK
  return null
}

function bereich(von: string, bis: string): string[] {
  const reihe = reiheVon(von)
  if (!reihe || !reihe.includes(bis)) return [von, bis].filter((z) => ZAHN.test(z))
  const a = reihe.indexOf(von)
  const b = reihe.indexOf(bis)
  const [vonIndex, bisIndex] = a < b ? [a, b] : [b, a]
  return reihe.slice(vonIndex, bisIndex + 1)
}

function zaehneAus(liste: string): string[] {
  const teile = liste.split(/\s+und\s+|,\s*/i).map((t) => t.trim()).filter(Boolean)
  const aus: string[] = []
  for (const teil of teile) {
    const bis = teil.match(/^([1-4][1-8])\s+bis\s+([1-4][1-8])$/i)
    if (bis) aus.push(...bereich(bis[1], bis[2]))
    else if (ZAHN.test(teil)) aus.push(teil)
  }
  return aus
}

function codeVon(klausel: string): { code: string; liste: string } | null {
  const roh = klausel.trim().replace(/\.$/, '')
  const tief = roh.toLowerCase()
  if (/^alle zähne fehlen|^alle zaehne fehlen/.test(tief)) return { code: 'f', liste: '*' }
  if (/^alle zähne vorhanden|^alle zaehne vorhanden/.test(tief)) return { code: '', liste: '*' }
  let m = tief.match(/^es fehl(?:t|en)\s+(.+)$/)
  if (m) return { code: 'f', liste: m[1] }
  m = tief.match(/^vorhanden:\s*(.+)$/)
  if (m) return { code: '', liste: m[1] }
  m = tief.match(/^befund\s+([a-z0-9()]+):\s*(.+)$/)
  if (m) return { code: m[1], liste: m[2] }
  for (const [code, wort] of WORT) {
    if (tief.startsWith(`${wort}:`)) return { code, liste: roh.slice(wort.length + 1) }
    const ist = tief.match(new RegExp(`^(.+?)\\s+(?:ist|sind)\\s+${wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    if (ist) return { code, liste: ist[1] }
  }
  m = tief.match(/^([1-4][1-8].*?)\s+fehlt$/)
  if (m) return { code: 'f', liste: m[1] }
  return null
}

function klauseln(text: string): string[] {
  const aus: string[] = []
  for (const stueck of text.split(';')) {
    let rest = stueck.trim().replace(/\.$/, '')
    while (rest) {
      const komma = rest.match(/^(.*?),\s+(.*)$/)
      if (komma && codeVon(komma[1]) && /^[1-4][1-8]\b/.test(komma[2]) && /\b(fehlt|ist|sind)\b/i.test(komma[2])) {
        aus.push(komma[1])
        rest = komma[2].trim()
        continue
      }
      if (codeVon(rest)) aus.push(rest)
      break
    }
  }
  return aus
}

function kieferZaehne(name: string): string[] | null {
  const tief = name.toLowerCase()
  if (tief.startsWith('ober')) return OK
  if (tief.startsWith('unter')) return UK
  return null
}

/** Befundsatz -> Kürzel je Zahn. Leere Rückgabe, wenn kein Zahn darin steht. */
export function schemaVon(text: string): Record<string, string> {
  const schema: Record<string, string> = {}
  const bloecke = text.split(/(?=Oberkiefer:|Unterkiefer:)/i).map((t) => t.trim()).filter(Boolean)
  const teile = bloecke.length ? bloecke : [text]
  for (const block of teile) {
    const kopf = block.match(/^(Oberkiefer|Unterkiefer):\s*/i)
    const kiefer = kopf ? kieferZaehne(kopf[1]) : null
    const rest = kopf ? block.slice(kopf[0].length) : block
    for (const klausel of klauseln(rest)) {
      const fund = codeVon(klausel)
      if (!fund) continue
      const ziele = fund.liste === '*' ? (kiefer || []) : zaehneAus(fund.liste)
      for (const zahn of ziele) schema[zahn] = fund.code
    }
  }
  return schema
}

const SAGEN: Record<string, string> = {
  '': 'ist vorhanden',
  f: 'fehlt',
  k: 'ist überkront',
  kw: 'braucht eine neue Krone',
  pw: 'hat einen Teildefekt',
  ww: 'ist weitgehend zerstört',
  x: 'ist nicht erhaltungswürdig',
  b: 'ist ein Brückenglied',
  i: 'ist ein Implantat',
  t: 'hat ein Teleskop',
}

/** Übernehmen nach dem Schema: unverändert ein Ja, sonst nur die geänderten Zähne. */
export function schemaSatz(vorher: Record<string, string>, nachher: Record<string, string>): string {
  const zaehne = [...new Set([...Object.keys(vorher), ...Object.keys(nachher)])].sort()
  const teile = zaehne.filter((z) => (vorher[z] || '') !== (nachher[z] || '')).map((z) => {
    const code = nachher[z] || ''
    return `${z} ${SAGEN[code] || `hat den Befund ${code}`}`
  })
  return teile.length ? teile.join(', ') : 'Ja, der Befund stimmt so.'
}

/** Übernehmen wird der nächste Satz an Clara. null = es fehlt noch eine Angabe. */
export function kastenSatz(kasten: Kasten, text: string, gewaehlt: string[][]): string | null {
  const teile: string[] = []
  if (kasten.art === 'befund') {
    const nachher = text.trim()
    if (!nachher) return null
    const vorher = (kasten.text || '').trim()
    teile.push(nachher === vorher ? 'Ja, der Befund stimmt so.' : nachher)
  }
  const gruppen = kasten.gruppen || []
  for (let i = 0; i < gruppen.length; i++) {
    const wahl = (gewaehlt[i] || []).map((s) => s.trim()).filter(Boolean)
    if (!wahl.length) return null
    teile.push(gruppen[i].mehrere ? wahl.join(', ') : wahl[0])
  }
  return teile.length ? teile.join(' ') : null
}

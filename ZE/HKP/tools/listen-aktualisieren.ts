/**
 * Aktualisierungsdienst für die Preislisten (täglich als geplante Aufgabe, manuell: npm run listen).
 *
 * - BEL II: CSV-Dateien (VDDS) der 17 KZVen von deren Veröffentlichungsseiten → src/data/bel/
 * - Festzuschüsse + ZE-Punktwert: PDF des GKV-Spitzenverbands → src/data/fz/, src/data/bema/
 * - BEMA-Kurzfassung (KZBV) und GOZ (gesetze-im-internet.de): nur Änderungsmeldung
 *
 * Neue Listen werden plausibilisiert und nur bei bestandener Prüfung übernommen, sonst landen sie zur
 * Sichtung in _quellen/updates/. Der Stand geht nach public/ und dist/listen-status.json; bei neuen
 * Listen wird die App neu gebaut (öffentliche Seite). Option --kein-build unterdrückt den Build.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { KZVEN, type Kzv } from '../src/data/kzv.ts'
import { csvZeilen, dekodieren, istVdds, vddsAuswerten, vddsDateiname, type VddsEintrag } from '../src/store/vdds.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'src', 'data')
const UPDATES = join(ROOT, '_quellen', 'updates')
const ZUSTAND = join(ROOT, 'tools', 'listen-zustand.json')
const HEUTE = new Date().toISOString().slice(0, 10)
const JAHR = Number(HEUTE.slice(0, 4))
const UA = 'Mozilla/5.0 (HKP-Rechner; Preislisten-Aktualisierung)'

type Status = 'aktuell' | 'neu' | 'warnung' | 'fehler' | 'manuell'
interface StatusQuelle { id: string; typ: string; name: string; status: Status; meldung: string; url?: string; gueltigAb?: string }
interface Liste { id: string; typ: string; name: string; gueltigAb: string; kzv?: string; punktwert?: number; quelle?: string; hinweis?: string; abgerufen?: string; eintraege: any[] }
interface Zustand { hashes: Record<string, string>; goz?: string }

const log = (...t: unknown[]) => console.log(new Date().toISOString(), ...t)
const datumDe = (iso: string) => iso.split('-').reverse().join('.')
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex')
const json = (o: unknown) => JSON.stringify(o, null, 1) + '\n'

function lesen<T>(datei: string, standard: T): T {
  try { return JSON.parse(readFileSync(datei, 'utf8')) as T } catch { return standard }
}

async function holen(url: string): Promise<{ ok: boolean; status: number; buf: Uint8Array; typ: string }> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30000) })
    const buf = new Uint8Array(await r.arrayBuffer())
    return { ok: r.ok, status: r.status, buf, typ: r.headers.get('content-type') ?? '' }
  } catch (e) {
    return { ok: false, status: 0, buf: new Uint8Array(), typ: String((e as Error).message) }
  }
}

function listenIm(ordner: string): Liste[] {
  const pfad = join(DATA, ordner)
  if (!existsSync(pfad)) return []
  return readdirSync(pfad).filter((f) => f.endsWith('.json')).map((f) => lesen<Liste>(join(pfad, f), null as never)).filter(Boolean)
}

const median = (z: number[]) => {
  const s = [...z].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN
}

// ---------------------------------------------------------------- BEL II

interface Kandidat { url: string; gueltigAb: string; datei: string }

function linksAus(html: string, basis: string): { url: string; text: string }[] {
  const erg: { url: string; text: string }[] = []
  const re = /<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    try {
      const href = m[2].replace(/&amp;/g, '&')
      erg.push({ url: new URL(href, basis).href, text: m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() })
    } catch { /* ungültiger Link */ }
  }
  return erg
}

async function belKandidaten(k: Kzv): Promise<Kandidat[]> {
  const gefunden = new Map<string, Kandidat>()
  /** Manche Server liefern für unbekannte Dateinamen die aktuelle Datei aus – gleicher Inhalt zählt nur einmal (frühester Name). */
  const inhalte = new Set<string>()
  const muster = new RegExp(`${k.nr}la(\\d{2})(\\d{2})`, 'i')
  for (const seite of [k.seite, ...(k.weitereSeiten ?? [])]) {
    const r = await holen(seite)
    if (!r.ok) continue
    const html = new TextDecoder().decode(r.buf)
    const base = /<base\b[^>]*href\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]
    for (const l of linksAus(html, base ? new URL(base, seite).href : seite)) {
      if (/\.(pdf|xlsx?|zip)(\?|$)/i.test(l.url)) continue
      const m = muster.exec(l.url) ?? muster.exec(l.text)
      const info = m && vddsDateiname(m[0])
      if (info && !gefunden.has(info.gueltigAb)) gefunden.set(info.gueltigAb, { url: l.url, gueltigAb: info.gueltigAb, datei: m[0] })
    }
  }
  for (const c of gefunden.values()) {
    const r = await holen(c.url)
    if (r.ok) inhalte.add(sha(r.buf))
  }
  for (const vorlage of k.muster ?? []) {
    const proben: [number, string][] = [
      ...['01', '02', '03', '04', '07', '10'].map((mm) => [JAHR, mm] as [number, string]),
      [JAHR + 1, '01'], [JAHR + 1, '02'],
    ]
    for (const [j, mm] of proben) {
      const gueltigAb = `${j}-${mm}-01`
      if (gefunden.has(gueltigAb)) continue
      const url = vorlage.replace('{MM}', mm).replace('{JJ}', String(j).slice(2)).replace('{JJJJ}', String(j))
      const r = await holen(url)
      if (!r.ok || !istVdds(csvZeilen(dekodieren(r.buf)))) continue
      const h = sha(r.buf)
      if (inhalte.has(h)) continue
      inhalte.add(h)
      gefunden.set(gueltigAb, { url, gueltigAb, datei: `${k.nr}la${mm}${String(j).slice(2)}` })
    }
  }
  const alle = [...gefunden.values()].sort((a, b) => a.gueltigAb.localeCompare(b.gueltigAb))
  const aktuell = alle.filter((c) => c.gueltigAb <= HEUTE).pop()
  const ab = aktuell && aktuell.gueltigAb < `${JAHR}-01-01` ? aktuell.gueltigAb : `${JAHR}-01-01`
  return alle.filter((c) => c.gueltigAb >= ab)
}

const belId = (k: Kzv, gueltigAb: string) => `bel2-${k.slug}-${gueltigAb.slice(0, 4)}${gueltigAb.slice(5, 7) === '01' ? '' : `-${gueltigAb.slice(5, 7)}`}`

interface BelNeu { k: Kzv; liste: Liste; hash: string; warnungen: string[] }

/** Zahnersatz-Positionen (ohne Aufbissbehelfe 4xxx, UKPS, KFO 7xxx/8xxx – deren Preise streuen regional stärker) */
const istZe = (x: VddsEintrag) => (x.nr < '4000' || x.nr >= '9000') && !/UKPS|KFO/i.test(x.text)

/** Praxis ≈ 95 % Gewerbe; ZE-Preise weichen von den anderen KZVen desselben Jahres höchstens ±12 % ab (± 5 % um den Bundesmittelpreis) */
function belPruefen(neu: Liste, vergleich: Liste[], nurPraxis: boolean): string[] {
  const fehler: string[] = []
  const e = neu.eintraege as VddsEintrag[]
  if (e.length < 100) fehler.push(`nur ${e.length} Positionen`)
  for (const nr of nurPraxis ? ['0010', '1021'] : ['0010', '1021', '9330']) if (!e.some((x) => x.nr === nr)) fehler.push(`Position ${nr} fehlt`)
  if (!nurPraxis) {
    const q = median(e.filter((x) => x.gewerbe > 0 && x.praxis > 0).map((x) => x.praxis / x.gewerbe))
    if (!(q > 0.93 && q < 0.97)) fehler.push(`Praxis/Gewerbe-Verhältnis ${q.toFixed(3)} statt ≈ 0,95`)
  }
  const andere = vergleich.filter((l) => l.kzv !== neu.kzv && l.gueltigAb.slice(0, 4) === neu.gueltigAb.slice(0, 4))
  if (andere.length >= 2) {
    let gesamt = 0
    let ausreisser = 0
    for (const x of e) {
      if (!(x.gewerbe > 0) || !istZe(x)) continue
      const m = median(andere.map((l) => (l.eintraege as VddsEintrag[]).find((y) => y.nr === x.nr)?.gewerbe ?? 0).filter((v) => v > 0))
      if (!(m > 0)) continue
      gesamt++
      if (Math.abs(x.gewerbe / m - 1) > 0.12) ausreisser++
    }
    if (gesamt && ausreisser / gesamt > 0.05) fehler.push(`${ausreisser} von ${gesamt} ZE-Preisen weichen über 12 % vom Median der anderen KZVen ab`)
  }
  return fehler
}

async function belAktualisieren(zustand: Zustand, status: StatusQuelle[]): Promise<number> {
  const vorhanden = listenIm('bel')
  const ergebnisse = await Promise.all(KZVEN.map(async (k) => {
    const eigene = vorhanden.filter((l) => l.kzv === k.nr).sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb))
    const basis: StatusQuelle = { id: `bel-${k.slug}`, typ: 'bel2', name: `BEL II ${k.name}`, status: 'aktuell', meldung: '', url: k.seite, gueltigAb: eigene[0]?.gueltigAb }
    if (k.login) {
      return { neu: [] as BelNeu[], status: { ...basis, status: (eigene.length ? 'aktuell' : 'manuell') as Status, meldung: eigene.length ? 'Liste vorhanden (manuell importiert).' : 'Liste nur im Mitgliederbereich der KZV – CSV dort herunterladen und unter „Preislisten“ importieren.' } }
    }
    const kandidaten = await belKandidaten(k)
    if (!kandidaten.length) {
      return { neu: [], status: { ...basis, status: (eigene.length ? 'warnung' : 'fehler') as Status, meldung: `Keine CSV-Datei auf der KZV-Seite gefunden${eigene.length ? ` – weiter gilt die Liste ab ${datumDe(eigene[0].gueltigAb)}` : ''}. Seite prüfen.` } }
    }
    const neu: BelNeu[] = []
    const meldungen: string[] = []
    for (const c of kandidaten) {
      const r = await holen(c.url)
      if (!r.ok) { meldungen.push(`${c.datei}: HTTP ${r.status}`); continue }
      const zeilen = csvZeilen(dekodieren(r.buf))
      if (!istVdds(zeilen)) { meldungen.push(`${c.datei}: kein VDDS-CSV (evtl. Login-Seite)`); continue }
      const id = belId(k, c.gueltigAb)
      const hash = sha(r.buf)
      if (zustand.hashes[id] === hash && existsSync(join(DATA, 'bel', `${id}.json`))) continue
      const { eintraege, warnungen } = vddsAuswerten(zeilen, { nurPraxis: k.nurPraxis })
      const alt = vorhanden.find((l) => l.id === id)
      if (alt && JSON.stringify(alt.eintraege) === JSON.stringify(eintraege)) { zustand.hashes[id] = hash; continue }
      neu.push({
        k, hash, warnungen,
        liste: {
          id, kzv: k.nr, typ: 'bel2', name: `BEL II ${k.name} (${k.kurz})`, gueltigAb: c.gueltigAb, quelle: c.url, abgerufen: HEUTE,
          ...(warnungen.some((w) => w.includes('nur Praxislaborpreise')) ? { hinweis: 'Die KZV veröffentlicht als CSV nur Praxislaborpreise; Gewerbepreise = Praxispreis ÷ 0,95.' } : {}),
          eintraege,
        },
      })
    }
    const letzte = kandidaten[kandidaten.length - 1]
    return { neu, status: { ...basis, gueltigAb: letzte.gueltigAb, meldung: meldungen.join(' · ') || `Aktuell: ${kandidaten.map((c) => c.datei + '.csv').join(', ')}`, status: (meldungen.length ? 'warnung' : 'aktuell') as Status } }
  }))

  const vergleich = [...vorhanden, ...ergebnisse.flatMap((e) => e.neu.map((n) => n.liste))]
  let geschrieben = 0
  mkdirSync(join(DATA, 'bel'), { recursive: true })
  for (const e of ergebnisse) {
    for (const n of e.neu) {
      const fehler = belPruefen(n.liste, vergleich, !!n.liste.hinweis)
      if (fehler.length) {
        mkdirSync(UPDATES, { recursive: true })
        writeFileSync(join(UPDATES, `${n.liste.id}.json`), json(n.liste))
        e.status.status = 'warnung'
        e.status.meldung = `Neue Liste ab ${datumDe(n.liste.gueltigAb)} nicht übernommen (${fehler.join('; ')}) – zur Prüfung in _quellen/updates/${n.liste.id}.json`
        log('BEL abgelehnt', n.liste.id, fehler.join('; '))
        continue
      }
      writeFileSync(join(DATA, 'bel', `${n.liste.id}.json`), json(n.liste))
      zustand.hashes[n.liste.id] = n.hash
      geschrieben++
      e.status.status = 'neu'
      e.status.meldung = `Neu eingespielt: ${n.liste.eintraege.length} Positionen ab ${datumDe(n.liste.gueltigAb)} (${HEUTE.split('-').reverse().join('.')}).`
      log('BEL neu', n.liste.id, n.liste.eintraege.length)
    }
    status.push(e.status)
  }
  return geschrieben
}

// ---------------------------------------------------------------- Festzuschüsse + ZE-Punktwert

const fzUrl = (j: number) => `https://www.gkv-spitzenverband.de/media/dokumente/krankenversicherung_1/zahnaerztliche_versorgung/rili_g_ba/${j}-01-01-FZ-Betraege.pdf`

function pdfText(buf: Uint8Array): string {
  const datei = join(tmpdir(), `hkp-fz-${process.pid}.pdf`)
  writeFileSync(datei, buf)
  return execFileSync('python', [join(ROOT, 'tools', 'pdftext.py'), 'text', datei], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
}

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

/** Gleiche Logik wie _quellen/convert.py (Festzuschüsse 2026) */
export function fzParsen(txt: string) {
  const zeilen = txt.split(/\r?\n/).map((l) => l.trim())
  const betrag = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2})`
  const reihe = new RegExp(String.raw`(?:^|\s)` + Array(7).fill(betrag).join(String.raw`\s+`) + String.raw`\s*$`)
  const eintraege: any[] = []
  let cur: any = null
  for (const l of zeilen) {
    const kopf = /^(\d\.\d{1,2}(?:\.\d)?)\s+(.*)$/.exec(l)
    const b = reihe.exec(l)
    if (kopf && !/^\d\.\d+\s+(\d|EUR)/.test(l)) {
      cur = { nr: kopf[1], text: kopf[2] }
      if (b) cur.text = l.slice(kopf[1].length, b.index).trim()
    } else if (cur && !b && !/^(Festzuschuss|Zahnersatz-Punktwert|BEL II|Befunde|60%)/.test(l)) {
      if (!cur.betraege) cur.text += ' ' + l
    }
    if (cur && b && !cur.betraege) {
      const v = b.slice(1).map(num)
      cur.honorar = v[0]
      cur.mul = v[1]
      cur.betraege = { '100': v[2], '60': v[3], '70': v[4], '75': v[5] }
      cur.text = cur.text.replace(/\s+/g, ' ').trim().split(' Bei gleichzeitigem Vorliegen')[0]
      eintraege.push(cur)
      cur = null
    }
  }
  const pw = /Zahnersatz-Punktwert\s+(\d,\d{2,4})\s*EUR\s*\(ab\s*(\d{2})\.(\d{2})\.(\d{4})\)/.exec(txt)
  return { eintraege, punktwert: pw ? num(pw[1]) : undefined, punktwertAb: pw ? `${pw[4]}-${pw[3]}-${pw[2]}` : undefined }
}

function fzPruefen(neu: any[], alt: Liste | undefined): string[] {
  const fehler: string[] = []
  if (neu.length < 40) fehler.push(`nur ${neu.length} Befunde erkannt`)
  const d = (a: number, b: number) => Math.abs(a - b) > 0.021
  for (const e of neu) {
    const b = e.betraege
    if (d(e.honorar + e.mul, b['100'])) fehler.push(`${e.nr}: Honorar + MuL ≠ 100 %`)
    for (const p of ['60', '70', '75']) if (d(b[p], b['100'] * Number(p) / 100)) fehler.push(`${e.nr}: ${p} % passt nicht zu 100 %`)
  }
  if (alt) {
    const nrAlt = alt.eintraege.map((e) => e.nr).sort().join()
    if (nrAlt !== neu.map((e) => e.nr).sort().join()) fehler.push('Befund-Nummern weichen vom Vorjahr ab (Richtlinie geändert?)')
    for (const e of neu) {
      const a = alt.eintraege.find((x) => x.nr === e.nr)
      if (a && !(e.betraege['100'] / a.betraege['100'] > 0.97 && e.betraege['100'] / a.betraege['100'] < 1.15)) fehler.push(`${e.nr}: Änderung zum Vorjahr unplausibel`)
    }
  }
  return fehler.slice(0, 8)
}

async function fzAktualisieren(status: StatusQuelle[]): Promise<number> {
  const fz = listenIm('fz').sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb))
  const bema = listenIm('bema').sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb))
  let geschrieben = 0
  const meldungen: string[] = []
  let st: Status = 'aktuell'
  for (const j of [JAHR, JAHR + 1]) {
    if (fz.some((l) => l.gueltigAb.startsWith(String(j)))) continue
    const r = await holen(fzUrl(j))
    if (!r.ok || !String.fromCharCode(...r.buf.slice(0, 4)).startsWith('%PDF')) {
      if (j === JAHR) { st = 'warnung'; meldungen.push(`Festzuschüsse ${j} nicht gefunden – es gelten noch die Beträge ab ${datumDe(fz[0]?.gueltigAb ?? '')}.`) }
      else meldungen.push(`Festzuschüsse ${j} noch nicht veröffentlicht (G-BA-Beschluss bis 30.11., Veröffentlichung meist im Dezember).`)
      continue
    }
    const { eintraege, punktwert, punktwertAb } = fzParsen(pdfText(r.buf))
    const alt = fz.find((l) => l.gueltigAb < `${j}-01-01`)
    const fehler = fzPruefen(eintraege, alt)
    if (!punktwert) fehler.push('ZE-Punktwert nicht gefunden')
    const id = `fz-${j}`
    const liste: Liste = {
      id, typ: 'festzuschuss', name: `Festzuschüsse ab 01.01.${j} (G-BA / GKV-SV)`, gueltigAb: `${j}-01-01`, quelle: fzUrl(j), abgerufen: HEUTE, eintraege,
    }
    if (fehler.length) {
      mkdirSync(UPDATES, { recursive: true })
      writeFileSync(join(UPDATES, `${id}.json`), json(liste))
      st = 'warnung'
      meldungen.push(`Festzuschüsse ${j} gefunden, aber nicht übernommen (${fehler.join('; ')}) – zur Prüfung in _quellen/updates/${id}.json`)
      continue
    }
    mkdirSync(join(DATA, 'fz'), { recursive: true })
    writeFileSync(join(DATA, 'fz', `${id}.json`), json(liste))
    geschrieben++
    st = 'neu'
    meldungen.push(`Festzuschüsse ab 01.01.${j} neu eingespielt (${eintraege.length} Befunde), ZE-Punktwert ${String(punktwert).replace('.', ',')} €.`)
    log('FZ neu', id)
    if (punktwert && punktwertAb && !bema.some((l) => l.gueltigAb === punktwertAb) && bema[0]) {
      const neu: Liste = {
        ...bema[0], id: `bema-${j}`, name: `BEMA Teil 5 - Zahnersatz (Punktwert ab ${datumDe(punktwertAb)})`, gueltigAb: punktwertAb, punktwert,
        quelle: fzUrl(j), abgerufen: HEUTE,
        hinweis: `Punktzahlen aus „${bema[0].name}“ übernommen, ZE-Punktwert aus der Festzuschussliste ${j}. Änderungen des BEMA prüfen.`,
      }
      writeFileSync(join(DATA, 'bema', `${neu.id}.json`), json(neu))
      geschrieben++
      log('BEMA neu', neu.id, punktwert)
    }
  }
  const aktuell = listenIm('fz').sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb)).find((l) => l.gueltigAb <= HEUTE)
  status.push({
    id: 'fz', typ: 'festzuschuss', name: 'Festzuschüsse (bundeseinheitlich)', status: st, gueltigAb: aktuell?.gueltigAb,
    url: 'https://www.kzbv.de/zahnaerzte/rechtsgrundlagen/festzuschuesse/festzuschussbetraege/',
    meldung: meldungen.join(' ') || `Aktuell (ab ${datumDe(aktuell?.gueltigAb ?? '')}).`,
  })
  return geschrieben
}

async function bemaPruefen(status: StatusQuelle[]) {
  const bema = listenIm('bema').sort((a, b) => b.gueltigAb.localeCompare(a.gueltigAb))
  const stand = bema.find((l) => /KZBV_BEMA_Kurzfassung_(\d{4}-\d{2}-\d{2})/.test(l.quelle ?? ''))
  const bisher = /KZBV_BEMA_Kurzfassung_(\d{4}-\d{2}-\d{2})/.exec(stand?.quelle ?? '')?.[1] ?? ''
  const termine = [JAHR, JAHR + 1].flatMap((j) => ['01-01', '04-01', '07-01', '10-01'].map((t) => `${j}-${t}`)).filter((d) => d > bisher)
  let neuer = ''
  for (const d of termine) {
    const url = `https://www.kzbv.de/wp-content/uploads/KZBV_BEMA_Kurzfassung_${d}.pdf`
    const r = await holen(url)
    if (r.ok && String.fromCharCode(...r.buf.slice(0, 4)) === '%PDF') neuer = url
  }
  status.push({
    id: 'bema', typ: 'bema', name: 'BEMA Teil 5 / ZE-Punktwert (bundeseinheitlich)', gueltigAb: bema.find((l) => l.gueltigAb <= HEUTE)?.gueltigAb,
    status: neuer ? 'manuell' : 'aktuell', url: neuer || stand?.quelle,
    meldung: neuer
      ? `Neue BEMA-Kurzfassung der KZBV veröffentlicht – Punktzahlen der Teil-5-Positionen prüfen und ggf. Liste anpassen.`
      : `Punktwert ${String(bema[0]?.punktwert ?? '').replace('.', ',')} € (ab ${datumDe(bema[0]?.gueltigAb ?? '')}); der neue Punktwert kommt mit der Festzuschussliste.`,
  })
}

async function gozPruefen(zustand: Zustand, status: StatusQuelle[]) {
  const url = 'https://www.gesetze-im-internet.de/goz_1987/xml.zip'
  const r = await holen(url)
  let st: Status = 'aktuell'
  let meldung = 'Gebührenverzeichnis unverändert (Punktwert 5,62421 Cent).'
  if (!r.ok) { st = 'fehler'; meldung = `GOZ nicht abrufbar (HTTP ${r.status}).` }
  else {
    const datei = join(tmpdir(), `hkp-goz-${process.pid}.zip`)
    writeFileSync(datei, r.buf)
    const hash = execFileSync('python', [join(ROOT, 'tools', 'pdftext.py'), 'zipxml', datei], { encoding: 'utf8' }).trim()
    if (!zustand.goz) zustand.goz = hash
    else if (zustand.goz !== hash) {
      st = 'manuell'
      meldung = 'Der GOZ-Text bei gesetze-im-internet.de hat sich geändert – Änderung prüfen (Gebührenverzeichnis/Punktwert), danach „node tools/listen-aktualisieren.ts --goz-bestaetigen“.'
      if (process.argv.includes('--goz-bestaetigen')) { zustand.goz = hash; st = 'aktuell'; meldung = 'Änderung bestätigt.' }
    }
  }
  status.push({ id: 'goz', typ: 'goz', name: 'GOZ (Bundesrecht)', status: st, meldung, url: 'https://www.gesetze-im-internet.de/goz_1987/', gueltigAb: '2012-01-01' })
}

// ---------------------------------------------------------------- Ablauf

async function main() {
  log('Preislisten-Aktualisierung startet')
  const zustand = lesen<Zustand>(ZUSTAND, { hashes: {} })
  const status: StatusQuelle[] = []
  let neu = 0
  neu += await fzAktualisieren(status)
  await bemaPruefen(status)
  neu += await belAktualisieren(zustand, status)
  await gozPruefen(zustand, status)
  status.push({
    id: 'beb', typ: 'beb', name: 'BEB (Privat-Labor)', status: 'manuell', url: 'https://www.vdzi.net/',
    meldung: 'Keine amtlichen Preise – die BEB-Preise legt jedes Labor selbst fest. Preisliste bzw. Labor-XML des eigenen Labors einlesen.',
  })

  writeFileSync(ZUSTAND, json(zustand))
  const ergebnis = json({ geprueftAm: new Date().toISOString(), quellen: status })
  writeFileSync(join(ROOT, 'public', 'listen-status.json'), ergebnis)
  if (existsSync(join(ROOT, 'dist'))) writeFileSync(join(ROOT, 'dist', 'listen-status.json'), ergebnis)
  for (const s of status) log(s.status.padEnd(8), s.name, '–', s.meldung)

  if (neu && !process.argv.includes('--kein-build')) {
    log(`${neu} neue Liste(n) – App wird neu gebaut`)
    const b = spawnSync('npm run build', { cwd: ROOT, shell: true, encoding: 'utf8' })
    log(b.status === 0 ? 'Build fertig' : `Build fehlgeschlagen:\n${b.stdout}\n${b.stderr}`)
  }
  log('fertig')
}

if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase()) await main()

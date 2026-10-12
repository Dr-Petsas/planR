/**
 * Monatsrechnung für PlanR-Kunden ohne MAS: Grundgebühr des Pakets + 1,59 € je Plan, der im Monat neu angelegt wurde.
 *
 * Zählwerk je Mandant: Jeder Plan (HKP aus dem MAS-Register, Pläne der anderen Planer) wird beim ersten Sehen mit
 * seinem Anlagedatum eingetragen und danach nie wieder gezählt. Was beim Anlegen des Zählwerks schon da war, ist
 * Altbestand und wird nie berechnet. Verworfene HKP-Entwürfe zählen nicht.
 * Rechnungen sind unveränderliche Schnappschüsse; die Ansicht (HTML zum Drucken/als PDF speichern) entsteht daraus.
 */
import { PAKETE, PRO_PLAN, type Paket } from './src/paket.ts'

export const UST_SATZ = 19
/** Einzug frühestens einen Kalendertag nach der Rechnung (verkürzte Vorabankündigung); wir lassen Luft */
export const EINZUG_TAGE = 5

export interface ZaehlPlan { kuerzel: string; art: string; modul: string; nummer: string; erstmals: string; altbestand?: boolean; verworfen?: boolean }
export interface Zaehlwerk {
  seit: string
  plaene: Record<string, ZaehlPlan>
  /** Monate (JJJJ-MM), in denen der Mandant als PlanR-Kunde ohne MAS gesehen wurde, mit dem Paket */
  monate: Record<string, { paket: Paket }>
}
export interface Gesehen { modul: string; kuerzel: string; art: string; nummer: string; datum: string; verworfen?: boolean }

export const leeresZaehlwerk = (jetzt: Date): Zaehlwerk => ({ seit: jetzt.toISOString(), plaene: {}, monate: {} })
export const monatVon = (iso: string) => iso.slice(0, 7)
const gueltigesDatum = (s: string) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : '')

/** Neue Pläne eintragen; beim allerersten Lauf ist alles Vorhandene Altbestand. Gibt zurück, ob sich etwas geändert hat. */
export function zaehlwerkAktualisieren(z: Zaehlwerk, gesehen: Gesehen[], jetzt: Date, erster = false): boolean {
  let geaendert = false
  for (const g of gesehen) {
    if (!g.modul || !g.nummer) continue
    const schluessel = `${g.modul}:${g.nummer}`
    const alt = z.plaene[schluessel]
    if (alt) {
      if (!!alt.verworfen !== !!g.verworfen) { alt.verworfen = g.verworfen || undefined; geaendert = true }
      continue
    }
    // Anlagedatum nie in der Zukunft und nie vor dem Zählwerk (sonst rutscht ein neuer Plan in einen alten Monat)
    let erstmals = gueltigesDatum(g.datum) || jetzt.toISOString()
    if (erstmals > jetzt.toISOString()) erstmals = jetzt.toISOString()
    if (!erster && erstmals < z.seit) erstmals = jetzt.toISOString()
    z.plaene[schluessel] = { kuerzel: g.kuerzel, art: g.art, modul: g.modul, nummer: g.nummer, erstmals, ...(erster ? { altbestand: true } : {}), ...(g.verworfen ? { verworfen: true } : {}) }
    geaendert = true
  }
  return geaendert
}

export function monatMerken(z: Zaehlwerk, monat: string, paket: Paket): boolean {
  if (z.monate[monat]?.paket === paket) return false
  z.monate[monat] = { paket }
  return true
}

/** Abrechenbare Pläne eines Monats, älteste zuerst */
export const planeImMonat = (z: Zaehlwerk, monat: string) =>
  Object.values(z.plaene).filter((p) => !p.altbestand && !p.verworfen && monatVon(p.erstmals) === monat).sort((a, b) => a.erstmals.localeCompare(b.erstmals))

const tageImMonat = (monat: string) => new Date(Date.UTC(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)), 0)).getUTCDate()
const cent = (euro: number) => Math.round(euro * 100)

export interface Posten { text: string; menge: number; einzelCent: number; summeCent: number }
export interface Abrechnung { monat: string; paket: Paket; posten: Posten[]; plaene: ZaehlPlan[]; nettoCent: number; ustCent: number; bruttoCent: number }

/** Grundgebühr (im ersten Monat anteilig ab Beginn des Zählwerks) + Pläne */
export function abrechnen(z: Zaehlwerk, monat: string, paket: Paket): Abrechnung {
  const plaene = planeImMonat(z, monat)
  const grund = cent(PAKETE[paket].monat)
  const tage = tageImMonat(monat)
  const ersterTag = monatVon(z.seit) === monat ? Number(z.seit.slice(8, 10)) : 1
  const genutzt = tage - ersterTag + 1
  const posten: Posten[] = [
    genutzt < tage
      ? { text: `${PAKETE[paket].name}, Grundgebühr anteilig (${genutzt} von ${tage} Tagen)`, menge: 1, einzelCent: Math.round((grund * genutzt) / tage), summeCent: Math.round((grund * genutzt) / tage) }
      : { text: `${PAKETE[paket].name}, Grundgebühr`, menge: 1, einzelCent: grund, summeCent: grund },
  ]
  if (plaene.length) posten.push({ text: 'Pläne (HKP und weitere Planer), im Monat neu angelegt', menge: plaene.length, einzelCent: cent(PRO_PLAN), summeCent: plaene.length * cent(PRO_PLAN) })
  const nettoCent = posten.reduce((s, p) => s + p.summeCent, 0)
  const ustCent = Math.round((nettoCent * UST_SATZ) / 100)
  return { monat, paket, posten, plaene, nettoCent, ustCent, bruttoCent: nettoCent + ustCent }
}

export interface Aussteller { name: string; anschrift: string[]; ustId: string; steuernummer: string; register: string; glaeubigerId: string; email: string; telefon: string }
export interface Empfaenger { praxis: string; zuHaenden: string; strasse: string; plzOrt: string; ustId: string; email: string; mandatsreferenz: string; iban: string }

export interface Rechnung extends Abrechnung {
  nummer: string
  datum: string
  einzug: string
  mandant: string
  clientId: string
  buchung: string
  aussteller: Aussteller
  empfaenger: Empfaenger
  erstellt: string
}

/** Eine Rechnung ist nur mit Steuernummer oder USt-IdNr. des Ausstellers vollständig (§ 14 Abs. 4 UStG) */
export const ausstellerVollstaendig = (a: Aussteller) => !!(a.ustId || a.steuernummer)

/** Fortlaufend je Jahr: PR-2026-0001 */
export function naechsteNummer(lauf: Record<string, number>, jahr: string): { nummer: string; lauf: Record<string, number> } {
  const n = (lauf[jahr] ?? 0) + 1
  return { nummer: `PR-${jahr}-${String(n).padStart(4, '0')}`, lauf: { ...lauf, [jahr]: n } }
}

export function rechnungErstellen(a: Abrechnung, o: { nummer: string; jetzt: Date; mandant: string; clientId: string; buchung: string; aussteller: Aussteller; empfaenger: Empfaenger }): Rechnung {
  const einzug = new Date(o.jetzt.getTime() + EINZUG_TAGE * 86_400_000)
  return {
    ...a, nummer: o.nummer, datum: o.jetzt.toISOString().slice(0, 10), einzug: einzug.toISOString().slice(0, 10),
    mandant: o.mandant, clientId: o.clientId, buchung: o.buchung, aussteller: o.aussteller, empfaenger: o.empfaenger, erstellt: o.jetzt.toISOString(),
  }
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export const monatsname = (monat: string) => `${MONATE[Number(monat.slice(5, 7)) - 1]} ${monat.slice(0, 4)}`
export const euroText = (c: number) => `${(c / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const datumDe = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.')
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Druckansicht (Browser: Drucken → Als PDF speichern) */
export function rechnungHtml(r: Rechnung): string {
  const a = r.aussteller, e = r.empfaenger
  const zeilen = r.posten.map((p) => `<tr><td>${esc(p.text)}</td><td class="z">${p.menge}</td><td class="z">${euroText(p.einzelCent)}</td><td class="z">${euroText(p.summeCent)}</td></tr>`).join('')
  const anlage = r.plaene.map((p) => `<tr><td>${datumDe(p.erstmals)}</td><td>${esc(p.kuerzel)} ${esc(p.art)}</td><td>${esc(p.nummer)}</td></tr>`).join('')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ${esc(r.nummer)}</title><style>
    body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d2a30;max-width:780px;margin:32px auto;padding:0 24px}
    .kopf{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.abs{font-size:11px;color:#667;border-bottom:1px solid #ccd;padding-bottom:2px;margin:40px 0 6px}
    h1{font-size:22px;margin:36px 0 4px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:7px 6px;border-bottom:1px solid #e3e8ea;text-align:left;vertical-align:top}
    th{font-size:12px;color:#667}.z{text-align:right;white-space:nowrap}.summe td{border:0;padding:3px 6px}.summe .b td{font-weight:700;border-top:2px solid #1d2a30}
    .klein{font-size:12px;color:#556}.fuss{margin-top:40px;padding-top:10px;border-top:1px solid #ccd;font-size:11px;color:#667;display:flex;gap:24px;flex-wrap:wrap}
    .druck{position:fixed;top:12px;right:12px}@media print{.druck{display:none}body{margin:0}}
  </style></head><body>
  <button class="druck" onclick="print()">Drucken / als PDF speichern</button>
  <div class="kopf"><div><b>${esc(a.name)}</b><br>${a.anschrift.map(esc).join('<br>')}</div><div class="klein" style="text-align:right">Rechnungsnummer <b>${esc(r.nummer)}</b><br>Rechnungsdatum ${datumDe(r.datum)}<br>Leistungszeitraum ${monatsname(r.monat)}</div></div>
  <p class="abs">${esc(a.name)} · ${a.anschrift.map(esc).join(' · ')}</p>
  <p>${esc(e.praxis)}${e.zuHaenden ? `<br>${esc(e.zuHaenden)}` : ''}<br>${esc(e.strasse)}<br>${esc(e.plzOrt)}${e.ustId ? `<br>USt-IdNr. ${esc(e.ustId)}` : ''}</p>
  <h1>Rechnung ${esc(r.nummer)}</h1>
  <p class="klein">PlanR – ${monatsname(r.monat)}</p>
  <table><thead><tr><th>Leistung</th><th class="z">Menge</th><th class="z">Einzelpreis</th><th class="z">Betrag</th></tr></thead><tbody>${zeilen}</tbody></table>
  <table class="summe"><tr><td></td><td class="z">Summe netto</td><td class="z" style="width:110px">${euroText(r.nettoCent)}</td></tr>
    <tr><td></td><td class="z">zzgl. ${UST_SATZ} % USt.</td><td class="z">${euroText(r.ustCent)}</td></tr>
    <tr class="b"><td></td><td class="z">Rechnungsbetrag</td><td class="z">${euroText(r.bruttoCent)}</td></tr></table>
  <p>Den Rechnungsbetrag ziehen wir am <b>${datumDe(r.einzug)}</b> per SEPA-Lastschrift von Ihrem Konto ${esc(e.iban)} ein
    (Mandatsreferenz ${esc(e.mandatsreferenz)}${a.glaeubigerId ? `, Gläubiger-ID ${esc(a.glaeubigerId)}` : ''}). Diese Rechnung ist zugleich die Vorabankündigung des Einzugs.</p>
  ${r.plaene.length ? `<h2 style="font-size:15px;margin-top:28px">Anlage: berechnete Pläne</h2><table><thead><tr><th>Angelegt</th><th>Plan</th><th>Nummer</th></tr></thead><tbody>${anlage}</tbody></table>` : ''}
  <div class="fuss"><span>${esc(a.name)}<br>${a.register.split(' · ').map(esc).join('<br>')}</span><span>${a.ustId ? `USt-IdNr. ${esc(a.ustId)}<br>` : ''}${a.steuernummer ? `Steuernummer ${esc(a.steuernummer)}` : ''}</span><span>${esc(a.telefon)}<br>${esc(a.email)}</span></div>
  </body></html>`
}

/**
 * Kostenvoranschlag per E-Mail: Anrede und Text fürs Anschreiben, Dateiname des PDFs und der Mail-Entwurf
 * fürs Mailprogramm (.eml mit „X-Unsent“, Outlook öffnet ihn als neue Mail mit Anhang).
 * Mit Pickadoc MAS sendet Nadine über das Praxis-Postfach (PlanR /api/versand).
 */
import { patientName, type Patient, type Praxis } from './stammdaten'

export const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

/** „Sehr geehrte Frau Dr. Meier,“ · „Sehr geehrter Herr Meier,“ · ohne Anrede „Guten Tag Kim Meier,“ */
export function anredeZeile(p: Pick<Patient, 'anrede' | 'titel' | 'vorname' | 'name'>): string {
  const name = [p.titel?.trim(), p.name.trim()].filter(Boolean).join(' ')
  if (p.anrede === 'Frau' && p.name.trim()) return `Sehr geehrte Frau ${name},`
  if (p.anrede === 'Herr' && p.name.trim()) return `Sehr geehrter Herr ${name},`
  const voll = [p.titel?.trim(), patientName(p)].filter(Boolean).join(' ')
  return voll ? `Guten Tag ${voll},` : 'Guten Tag,'
}

export interface Anschreiben {
  patient: Patient
  praxis: Praxis
  nummer: string
  betrag: number
  /** wofür, z. B. „Schienentherapie“ (steht in Betreff und Text) */
  thema: string
  /** Planart für den Versandstatus der Übersicht, z. B. „hkp“ */
  modul?: string
}

export function mailEntwurf(a: Anschreiben): { betreff: string; text: string } {
  const praxis = a.praxis.name.trim()
  const kontakt = [a.praxis.telefon && `telefonisch unter ${a.praxis.telefon}`, a.praxis.email && `per E-Mail an ${a.praxis.email}`].filter(Boolean).join(' oder ')
  const text = [
    anredeZeile(a.patient),
    '',
    `anbei erhalten Sie Ihren Kostenvoranschlag für die geplante Behandlung (${a.thema}, Nr. ${a.nummer}) über voraussichtlich ${euro(a.betrag)}.`,
    '',
    'Bitte lesen Sie ihn in Ruhe durch. Wenn Sie einverstanden sind, unterschreiben Sie ihn bitte und bringen ihn zu Ihrem nächsten Termin mit oder senden ihn uns unterschrieben zurück. Ihre private Krankenversicherung oder Beihilfe können Sie vorab um eine Kostenzusage bitten.',
    '',
    `Bei Fragen sind wir gern für Sie da${kontakt ? ` – ${kontakt}` : ''}.`,
    '',
    'Mit freundlichen Grüßen',
    a.praxis.zahnarzt.trim() || praxis,
    ...(a.praxis.zahnarzt.trim() && praxis ? [praxis] : []),
  ].join('\n')
  return { betreff: `Ihr Kostenvoranschlag ${a.thema}${praxis ? ` – ${praxis}` : ''}`, text }
}

/** „Kostenvoranschlag PKB-2026-001 Meier.pdf“ – nur Zeichen, die jedes Mailprogramm verträgt */
export function pdfDateiname(nummer: string, p: Pick<Patient, 'name'>): string {
  const sauber = (s: string) => s.replace(/[ÄÖÜäöüß]/g, (c) => ({ Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] ?? c)
    .replace(/[^\w .-]/g, '').replace(/\s+/g, ' ').trim()
  return `${['Kostenvoranschlag', sauber(nummer), sauber(p.name)].filter(Boolean).join(' ').slice(0, 100)}.pdf`
}

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const zeilen76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n')
const kopfwort = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)

/** Mail-Entwurf (RFC 822) mit Text und PDF-Anhang; Outlook und Apple Mail öffnen ihn zum Senden. */
export function emlEntwurf(m: { an: string; betreff: string; text: string; pdfBase64: string; dateiname: string }): string {
  const grenze = `planr-${Math.random().toString(36).slice(2)}`
  return [
    'X-Unsent: 1',
    `To: ${m.an.replace(/[\r\n]/g, '')}`,
    `Subject: ${kopfwort(m.betreff.replace(/[\r\n]/g, ' '))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${grenze}"`,
    '',
    `--${grenze}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    zeilen76(b64(m.text.replace(/\r?\n/g, '\r\n'))),
    `--${grenze}`,
    `Content-Type: application/pdf; name="${m.dateiname}"`,
    `Content-Disposition: attachment; filename="${m.dateiname}"`,
    'Content-Transfer-Encoding: base64',
    '',
    zeilen76(m.pdfBase64),
    `--${grenze}--`,
    '',
  ].join('\r\n')
}

/** mailto-Link (ohne Anhang) – Ausweg für Mailprogramme, die keine .eml-Entwürfe öffnen */
export const mailtoLink = (an: string, betreff: string, text: string) =>
  `mailto:${encodeURI(an)}?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(text)}`

/** PlanR-Server: im Server unter /planer/…, über den Tunnel planr.pickadoc-tunnel.com, lokal Port 5189 */
export const versandAdresse = (pfad = '') => `${typeof location === 'undefined' ? 'http://127.0.0.1:5189'
  : location.pathname.startsWith('/planer/') ? location.origin
  : location.hostname.endsWith('.pickadoc-tunnel.com') ? 'https://planr.pickadoc-tunnel.com'
  : `http://${location.hostname}:5189`}/api/versand${pfad}`

/**
 * Superuser-Eingang: eine Zeile je Kunde, Stammdaten, hochgeladene Pläne und ob ein Login da ist.
 * Die IBAN geht nur maskiert raus.
 */
import type { Buchung } from './buchung.ts'
import { ibanVerdeckt } from './buchung.ts'
import { PAKETE, SERVER } from './src/paket.ts'
import { kzvNachNr } from './src/data/kzv.ts'
import { pvsVon } from './src/einstellungen.ts'
import type { ProbeStand, ZahnarztKontakt } from './probeEingang.ts'

export interface ProbeKurz {
  id: string
  zeit: string
  dateiname: string
  kontakt: ZahnarztKontakt
  stand?: ProbeStand | null
}

export interface KundePlan {
  id: string
  dateiname: string
  zeit: string
  stand: ProbeStand | null
}

export interface KundeLogin {
  email: string
  vorhanden: boolean
}

export interface StammZeile { label: string; wert: string }

export interface KundeZeile {
  id: string
  name: string
  login: KundeLogin | null
  stammdaten: StammZeile[]
  plaene: KundePlan[]
}

const klein = (s: string) => s.trim().toLowerCase()
const zeile = (label: string, wert: string): StammZeile | null => {
  const w = wert.replace(/\s+/g, ' ').trim()
  return w ? { label, wert: w } : null
}

function person(b: Buchung) {
  return [b.inhaber?.titel, b.inhaber?.vorname, b.inhaber?.nachname].filter(Boolean).join(' ')
}

function mailsVonBuchung(b: Buchung) {
  return [b.inhaber?.email, b.praxis?.email, b.pickadocKonto, ...(b.benutzer ?? [])].map(klein).filter((m) => m.includes('@'))
}

function planVon(p: ProbeKurz): KundePlan {
  return { id: p.id, dateiname: p.dateiname, zeit: p.zeit, stand: p.stand ?? null }
}

function stammdaten(b: Buchung): StammZeile[] {
  const kzv = kzvNachNr(b.kzv?.nr ?? '')
  const pvs = pvsVon(b.pvs?.id ?? '')
  const paket = PAKETE[b.paket]
  return [
    zeile('Praxis', b.praxis?.name ?? ''),
    zeile('Rechtsform', b.praxis?.rechtsform ?? ''),
    zeile('Straße', b.praxis?.strasse ?? ''),
    zeile('Ort', [b.praxis?.plz, b.praxis?.ort].filter(Boolean).join(' ')),
    zeile('Telefon', b.praxis?.telefon ?? ''),
    zeile('E-Mail Praxis', b.praxis?.email ?? ''),
    zeile('Website', b.praxis?.website ?? ''),
    zeile('USt-IdNr.', b.praxis?.ustId ?? ''),
    zeile('Inhaber', [b.inhaber?.anrede, person(b)].filter(Boolean).join(' ')),
    zeile('E-Mail Inhaber', b.inhaber?.email ?? ''),
    zeile('Mobil', b.inhaber?.mobil ?? ''),
    zeile('KZV', kzv ? `${kzv.name} (${kzv.nr})` : (b.kzv?.nr ?? '')),
    zeile('Abrechnungsnummer', b.kzv?.abrechnungsnr ?? ''),
    zeile('Zahnärzte', b.kzv?.zahnaerzte ? String(b.kzv.zahnaerzte) : ''),
    zeile('Praxen', b.kzv?.praxen ? String(b.kzv.praxen) : ''),
    zeile('Eigenlabor', b.kzv ? (b.kzv.eigenlabor ? 'ja' : 'nein') : ''),
    zeile('PVS', pvs ? `${pvs.name} · ${pvs.hersteller}` : (b.pvs?.id ?? '')),
    zeile('PVS-Version', b.pvs?.version ?? ''),
    zeile('Server', b.pvs?.server ? (SERVER[b.pvs.server] ?? b.pvs.server) : ''),
    zeile('IT-Kontakt', b.pvs?.it ?? ''),
    zeile('Paket', paket ? `${paket.name}, ${paket.monat} € im Monat` : (b.paket ?? '')),
    zeile('Dokumentation', b.doku ? 'ja' : ''),
    zeile('Testabo', b.testabo ? `${b.testabo.status}, ${b.testabo.erstellt ?? 0} Pläne, bis ${b.testabo.bis?.slice(0, 10) ?? ''}` : ''),
    zeile('Pickadoc-Konto', b.pickadocKonto ?? ''),
    zeile('Benutzer', (b.benutzer ?? []).join(', ')),
    zeile('SEPA-Inhaber', b.sepa?.inhaber ?? ''),
    zeile('IBAN', b.sepa?.iban ? ibanVerdeckt(b.sepa.iban) : ''),
    zeile('BIC', b.sepa?.bic ?? ''),
    zeile('Bank', b.sepa?.bank ?? ''),
    zeile('Mandat', b.sepa?.mandatsreferenz ?? ''),
    zeile('Unterschrift', b.sepa?.unterschrift ?? ''),
    zeile('Hinweis', b.hinweis ?? ''),
    zeile('Eingang', b.eingang?.slice(0, 16).replace('T', ' ') ?? ''),
  ].filter((z): z is StammZeile => !!z)
}

function loginFuer(emails: string[], bekannt: Set<string>): KundeLogin | null {
  const email = emails.find((m) => m.includes('@')) ?? ''
  if (!email) return null
  const treffer = emails.find((m) => bekannt.has(m))
  return { email: treffer || email, vorhanden: !!treffer }
}

/** Buchungen zuerst, danach Probe-Uploads, die zu keiner Buchung passen. */
export function kundenBauen(buchungen: Buchung[], plaene: ProbeKurz[], logins: string[]): KundeZeile[] {
  const bekannt = new Set(logins.map(klein).filter((m) => m.includes('@')))
  const verwendet = new Set<string>()
  const ausBuchung: KundeZeile[] = buchungen.map((b) => {
    const mails = new Set(mailsVonBuchung(b))
    const eigene = plaene.filter((p) => {
      const mail = klein(p.kontakt?.email ?? '')
      return mail.includes('@') && mails.has(mail)
    })
    for (const p of eigene) verwendet.add(p.id)
    return {
      id: b.id,
      name: person(b) || b.praxis?.name || b.inhaber?.email || 'Kunde',
      login: loginFuer([...mails], bekannt),
      stammdaten: stammdaten(b),
      plaene: eigene.map(planVon),
    }
  })
  const rest = new Map<string, ProbeKurz[]>()
  for (const p of plaene) {
    if (verwendet.has(p.id)) continue
    const schluessel = klein(p.kontakt?.email ?? '') || klein(p.kontakt?.name ?? '') || p.id
    const liste = rest.get(schluessel) ?? []
    liste.push(p)
    rest.set(schluessel, liste)
  }
  const ausProbe: KundeZeile[] = [...rest.values()].map((gruppe) => {
    const erst = gruppe[0]
    const k = erst.kontakt
    const email = klein(k.email ?? '')
    return {
      id: `probe-${erst.id}`,
      name: k.name || k.praxis || k.email || 'Unbekannter Upload',
      login: email.includes('@') ? loginFuer([email], bekannt) : null,
      stammdaten: [
        zeile('Praxis', k.praxis),
        zeile('Anschrift', k.anschrift),
        zeile('Telefon', k.telefon),
        zeile('E-Mail', k.email),
      ].filter((z): z is StammZeile => !!z),
      plaene: gruppe.map(planVon),
    }
  })
  return [...ausBuchung, ...ausProbe].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

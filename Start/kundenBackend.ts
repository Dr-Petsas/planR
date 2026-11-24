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
import { BETREIBER, probeEmail } from './probeEingang.ts'
import { istGesperrt, type Sperre } from './kundenKonto.ts'

export interface ProbeKurz {
  id: string
  zeit: string
  dateiname: string
  kontakt: ZahnarztKontakt
  stand?: ProbeStand | null
  /** Konto, dem der Upload zugeordnet ist */
  login?: string
}

/** Pläne und Umsatz einer Buchung; null = nicht bekannt (z. B. Abrechnung über Pickadoc MAS) */
export interface KundeZahlen { plaene: number | null; umsatzCent: number | null }

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
  /** kunde = gebucht · probe = Upload aus der Probe · mas = Pickadoc-Anmeldung ohne PlanR-Buchung */
  art: 'kunde' | 'probe' | 'mas'
  /** In PlanR angelegte Pläne */
  plaeneAnzahl: number | null
  /** Netto im laufenden Monat, in Cent */
  umsatzCent: number | null
  name: string
  login: KundeLogin | null
  stammdaten: StammZeile[]
  plaene: KundePlan[]
  /** Pickadoc-Mandant, falls die Zeile einen hat. Daran schaltet der Pickadoc-Superuser MAS. */
  clientId: string | null
  /** PlanR-Konto der Buchung: vom Superuser zu öffnen, gesperrt? (setzt der Server, kundenKonto.ts) */
  konto?: { email: string; zugang: boolean; gesperrt: boolean } | null
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
export function kundenBauen(buchungen: Buchung[], plaene: ProbeKurz[], logins: string[], zahlen: Record<string, KundeZahlen> = {}): KundeZeile[] {
  const bekannt = new Set(logins.map(klein).filter((m) => m.includes('@')))
  const verwendet = new Set<string>()
  // Dieselbe Praxis hat das Formular zweimal abgeschickt: eine Zeile je Anmeldung, die Buchung mit dem Konto zählt.
  const jeLogin = new Map<string, Buchung>()
  for (const b of buchungen) {
    const schluessel = klein(b.inhaber?.email ?? '') || b.id
    const alt = jeLogin.get(schluessel)
    if (!alt || (!alt.konto?.clientId && b.konto?.clientId)) jeLogin.set(schluessel, b)
  }
  const ausBuchung: KundeZeile[] = [...jeLogin.values()].map((b) => {
    const mails = new Set(mailsVonBuchung(b))
    const eigene = plaene.filter((p) => {
      if (verwendet.has(p.id)) return false
      const zugeordnet = klein(p.login ?? '')
      if (zugeordnet.includes('@')) return mails.has(zugeordnet)
      const mail = klein(p.kontakt?.email ?? '')
      return mail.includes('@') && mails.has(mail)
    })
    for (const p of eigene) verwendet.add(p.id)
    const z = zahlen[b.id]
    return {
      id: b.id,
      // Ein Zugang aus der Probe bleibt eine Probe, bis daraus ein reguläres Abo wird.
      art: b.quelle === 'probe' && b.testabo?.status !== 'abo' ? 'probe' as const : 'kunde' as const,
      plaeneAnzahl: z?.plaene ?? (b.testabo ? b.testabo.erstellt ?? 0 : null),
      umsatzCent: z?.umsatzCent ?? (b.testabo && b.testabo.status !== 'abo' ? 0 : null),
      name: person(b) || b.praxis?.name || b.inhaber?.email || 'Kunde',
      login: loginFuer([...mails], bekannt),
      stammdaten: stammdaten(b),
      plaene: eigene.map(planVon),
      clientId: b.konto?.clientId || null,
    }
  })
  const rest = new Map<string, ProbeKurz[]>()
  for (const p of plaene) {
    if (verwendet.has(p.id)) continue
    const schluessel = klein(p.login ?? '') || klein(p.kontakt?.email ?? '') || klein(p.kontakt?.name ?? '') || p.id
    const liste = rest.get(schluessel) ?? []
    liste.push(p)
    rest.set(schluessel, liste)
  }
  const ausProbe: KundeZeile[] = [...rest.values()].map((gruppe) => {
    const erst = gruppe[0]
    const k = erst.kontakt
    const email = klein(erst.login ?? '') || klein(k.email ?? '')
    return {
      id: `probe-${erst.id}`,
      art: 'probe' as const,
      plaeneAnzahl: null,
      umsatzCent: null,
      name: k.name || k.praxis || k.email || 'Unbekannter Upload',
      login: email.includes('@') ? loginFuer([email], bekannt) : { email: probeEmail(k.name || k.praxis || erst.dateiname), vorhanden: false },
      stammdaten: [
        zeile('Praxis', k.praxis),
        zeile('Anschrift', k.anschrift),
        zeile('Telefon', k.telefon),
        zeile('E-Mail', k.email),
      ].filter((z): z is StammZeile => !!z),
      plaene: gruppe.map(planVon),
      clientId: null,
    }
  })
  return [...ausBuchung, ...ausProbe].sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export interface MasBenutzer {
  email: string
  name: string
  clientId: string
  role: string
  zuletzt: string
}

const rolleText = (role: string) => role === 'doctor' ? 'Arzt' : role === 'admin' ? 'Admin' : role

/**
 * Pickadoc-Anmeldungen, die PlanR über MAS öffnen und keine eigene Buchungszeile haben.
 * Steht die Adresse schon an einer Buchung, bleibt sie bei den Kunden.
 */
export function masKonten(buchungen: Buchung[], benutzer: MasBenutzer[], sperren: Sperre[] = []): KundeZeile[] {
  const belegt = new Set(buchungen.flatMap(mailsVonBuchung))
  const jeEmail = new Map<string, MasBenutzer>()
  for (const b of benutzer) {
    const email = klein(b.email)
    if (!email.includes('@') || email === BETREIBER || belegt.has(email) || !b.clientId) continue
    const alt = jeEmail.get(email)
    if (!alt || b.zuletzt > alt.zuletzt) jeEmail.set(email, { ...b, email })
  }
  return [...jeEmail.values()].map((b) => ({
    id: `mas-${b.email}`,
    art: 'mas' as const,
    plaeneAnzahl: null,
    umsatzCent: null,
    name: b.name.trim() || b.email,
    login: { email: b.email, vorhanden: true },
    stammdaten: [
      zeile('Zugang', 'Pickadoc / MAS'),
      zeile('Rolle', rolleText(b.role)),
      zeile('Praxis-Kennung', b.clientId),
      zeile('Zuletzt', b.zuletzt.slice(0, 16).replace('T', ' ')),
    ].filter((z): z is StammZeile => !!z),
    plaene: [],
    clientId: b.clientId,
    konto: { email: b.email, zugang: true, gesperrt: istGesperrt(sperren, { email: b.email, clientId: b.clientId }) },
  })).sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

const istProbeBuchung = (b: Buchung) => b.quelle === 'probe' && b.testabo?.status !== 'abo'

/**
 * Ein Probe-Interessent aus der Liste. Hochgeladene Pläne und, falls vorhanden, die Probe-Buchung.
 * Eine echte Kundenbuchung bleibt. Das Pickadoc-Konto ist hier nicht beteiligt.
 */
export function probeLoeschen(buchungen: Buchung[], plaene: ProbeKurz[], id: string): { email: string; buchungIds: string[]; planIds: string[] } | null {
  const zeile = kundenBauen(buchungen, plaene, []).find((k) => k.id === id)
  if (!zeile || zeile.art !== 'probe') return null
  const planIds = zeile.plaene.map((p) => p.id)
  const email = (zeile.login?.email ?? '').trim().toLowerCase()
  if (!buchungen.some((b) => b.id === id)) return { email, buchungIds: [], planIds }
  const eigene = buchungen.filter((b) => b.id === id || (email.includes('@') && klein(b.inhaber?.email ?? '') === email))
  if (eigene.some((b) => !istProbeBuchung(b))) return null
  return { email, buchungIds: eigene.map((b) => b.id), planIds }
}

/**
 * Buchung von PlanR über planr.pickadoc.de:
 * Stammdaten, KZV, Praxissystem, Zugänge und SEPA-Lastschriftmandat. Die Freischaltung macht Pickadoc
 * nach der Info-Mail an info@pickadoc.de (Praxis in Pickadoc anlegen, Abo planr setzen).
 */
import { randomBytes } from 'node:crypto'
import { KZVEN } from './src/data/kzv.ts'
import { pvsVon } from './src/einstellungen.ts'
import { DOKU_MONAT, EINRICHTUNG, PAKETE, PRO_PLAN, RECHTSFORMEN, SERVER, TESTABO_PLAENE, TESTABO_TAGE, ibanGueltig, ibanNorm, type Paket } from './src/paket.ts'

export { DOKU_MONAT, EINRICHTUNG, PAKETE, PRO_PLAN, RECHTSFORMEN, SERVER, TESTABO_PLAENE, TESTABO_TAGE, ibanGueltig, ibanNorm, type Paket }

export const GLAEUBIGER = { name: 'Pickadoc GmbH', anschrift: 'Medical Center · c/o Dr. Petsas · Luise-Rainer-Str. 6–10 · 40235 Düsseldorf' }

export interface Buchung {
  id: string
  eingang: string
  paket: Paket
  praxis: { name: string; rechtsform: string; strasse: string; plz: string; ort: string; telefon: string; email: string; website: string; ustId: string }
  inhaber: { anrede: string; titel: string; vorname: string; nachname: string; email: string; mobil: string }
  kzv: { nr: string; abrechnungsnr: string; zahnaerzte: number; praxen: number; eigenlabor: boolean }
  pvs: { id: string; version: string; server: keyof typeof SERVER; it: string }
  pickadocKonto: string
  benutzer: string[]
  sepa: { inhaber: string; anschrift: string; iban: string; bic: string; bank: string; mandatsreferenz: string; unterschrift: string }
  hinweis: string
  /** Upgrade Dokumentation per Sprache, 89 € im Monat, kein Preis je Eintrag */
  doku: boolean
  /** Pickadoc-Konto: sofort angelegt, schon vorhanden (Freischaltung von Hand) oder Anlage fehlgeschlagen */
  konto?: { status: 'angelegt' | 'vorhanden' | 'manuell'; clientId?: string; uid?: string }
  /** Testabo PlanR inklusive Sprachupgrade: Zeitraum und der Vermerk im Mini-Backend */
  testabo?: TestaboVermerk
  /** probe = Zugang aus der öffentlichen Probe; Stammdaten, KZV und Praxissystem fehlen noch */
  quelle?: 'probe'
}

/** Zugang aus der Probe: Testabo auf die E-Mail-Adresse, der Rest kommt aus dem Praxisstempel oder später. */
export function probeBuchung(
  email: string,
  wer: { titel: string; vorname: string; nachname: string; praxis: string },
  kontakt: { telefon?: string; anschrift?: string },
  jetzt = new Date(),
): Buchung | null {
  const adresse = text(email, 200).toLowerCase()
  if (!EMAIL_RE.test(adresse)) return null
  return {
    id: `B-${jetzt.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`,
    eingang: jetzt.toISOString(),
    paket: 'planr_clara',
    doku: true,
    praxis: { name: text(wer.praxis, 160), rechtsform: '', strasse: text(kontakt.anschrift, 120), plz: '', ort: '', telefon: text(kontakt.telefon, 40), email: adresse, website: '', ustId: '' },
    inhaber: { anrede: '', titel: text(wer.titel, 40), vorname: text(wer.vorname, 80), nachname: text(wer.nachname, 80), email: adresse, mobil: '' },
    kzv: { nr: '', abrechnungsnr: '', zahnaerzte: 1, praxen: 1, eigenlabor: false },
    pvs: { id: '', version: '', server: 'unbekannt', it: '' },
    pickadocKonto: '',
    benutzer: [],
    sepa: { inhaber: '', anschrift: '', iban: '', bic: '', bank: '', mandatsreferenz: '', unterschrift: '' },
    hinweis: 'Zugang aus der PlanR-Probe. AGB, Datenschutzhinweise und Auftragsverarbeitung online bestätigt.',
    testabo: testaboAnlegen(jetzt),
    quelle: 'probe',
  }
}

export interface TestaboVermerk {
  von: string
  bis: string
  /** laeuft = Test, beendet = Frist um, abo = reguläres Abo abgeschlossen */
  status: 'laeuft' | 'beendet' | 'abo'
  /** Angelegte Pläne in diesem Testabo, auch wenn einer später gelöscht wird */
  erstellt: number
  vermerk: string
}

type Roh = Record<string, unknown>
const obj = (x: unknown): Roh => (x && typeof x === 'object' && !Array.isArray(x) ? x as Roh : {})
const text = (x: unknown, max = 120) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const tagText = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })

export function testaboAnlegen(jetzt = new Date()): TestaboVermerk {
  const von = jetzt.toISOString()
  const bis = new Date(jetzt.getTime() + TESTABO_TAGE * 24 * 60 * 60 * 1000).toISOString()
  return {
    von, bis, status: 'laeuft',
    erstellt: 0,
    vermerk: `Testabo PlanR inkl. Sprachupgrade vom ${tagText(von)} bis ${tagText(bis)}. Keine Lastschrift. Höchstens ${TESTABO_PLAENE} Pläne.`,
  }
}

const testVermerk = (t: TestaboVermerk, erstellt = t.erstellt ?? 0) =>
  `Testabo PlanR inkl. Sprachupgrade vom ${tagText(t.von)} bis ${tagText(t.bis)}. Keine Lastschrift. ${erstellt} von ${TESTABO_PLAENE} Plänen erstellt.`

export const testaboVoll = (b: Buchung | null | undefined) =>
  !!b?.testabo && b.testabo.status === 'laeuft' && (b.testabo.erstellt ?? 0) >= TESTABO_PLAENE

/** Zählt einen neu angelegten Plan. Negative Werte nehmen eine gescheiterte Anlage zurück. */
export function testaboDazu(b: Buchung, n: number): Buchung {
  if (!b.testabo || b.testabo.status !== 'laeuft' || n === 0) return b
  const erstellt = Math.max(0, (b.testabo.erstellt ?? 0) + n)
  return { ...b, testabo: { ...b.testabo, erstellt, vermerk: testVermerk(b.testabo, erstellt) } }
}

/** SEPA und Zustimmung auf eine laufende Testabo-Buchung: daraus wird das reguläre Abo. */
export function aboAbschlussPruefen(b: Buchung, roh: unknown, jetzt = new Date()): { ok: true; buchung: Buchung } | { ok: false; fehler: Record<string, string> } {
  if (!b.testabo || b.testabo.status !== 'laeuft') return { ok: false, fehler: { testabo: 'Es läuft kein Testabo.' } }
  const r = obj(roh)
  const s = obj(r.sepa)
  const z = obj(r.zustimmung)
  const f: Record<string, string> = {}
  const sepa = {
    inhaber: text(s.inhaber, 140),
    anschrift: text(s.anschrift, 200) || `${b.praxis.strasse}, ${b.praxis.plz} ${b.praxis.ort}`,
    iban: ibanNorm(String(s.iban ?? '')).slice(0, 34),
    bic: text(s.bic, 11).toUpperCase().replace(/\s/g, ''),
    bank: text(s.bank, 80),
    mandatsreferenz: neueMandatsreferenz(jetzt),
    unterschrift: text(s.unterschrift, 140),
  }
  if (!sepa.inhaber) f['sepa.inhaber'] = 'Bitte den Kontoinhaber angeben.'
  if (!ibanGueltig(sepa.iban)) f['sepa.iban'] = 'Die IBAN ist nicht gültig – bitte prüfen.'
  if (sepa.bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(sepa.bic)) f['sepa.bic'] = 'Die BIC hat 8 oder 11 Stellen.'
  if (s.mandat !== true) f['sepa.mandat'] = 'Bitte das SEPA-Lastschriftmandat erteilen.'
  if (sepa.unterschrift.length < 3) f['sepa.unterschrift'] = 'Bitte zur Bestätigung Vor- und Nachnamen eintippen.'
  if (z.agb !== true) f['zustimmung.agb'] = 'Bitte den AGB zustimmen.'
  if (z.datenschutz !== true) f['zustimmung.datenschutz'] = 'Bitte die Datenschutzhinweise bestätigen.'
  if (z.avv !== true) f['zustimmung.avv'] = 'Ohne Auftragsverarbeitung darf PlanR keine Patientendaten verarbeiten.'
  if (Object.keys(f).length) return { ok: false, fehler: f }
  return {
    ok: true,
    buchung: {
      ...b,
      sepa,
      testabo: {
        ...b.testabo,
        status: 'abo',
        vermerk: `Reguläres Abo abgeschlossen am ${tagText(jetzt.toISOString())}. ${testVermerk(b.testabo)}. Mandat ${sepa.mandatsreferenz}.`,
      },
    },
  }
}

/** Abgelaufene Testabos bekommen den Abschluss-Vermerk. Die Liste bleibt sonst gleich. */
export function testaboAbschliessen(liste: Buchung[], jetzt = new Date()): { liste: Buchung[]; geaendert: boolean } {
  let geaendert = false
  const neu = liste.map((b) => {
    if (!b.testabo || b.testabo.status !== 'laeuft') return b
    if (new Date(b.testabo.bis).getTime() > jetzt.getTime()) return b
    geaendert = true
    return {
      ...b,
      testabo: {
        ...b.testabo,
        status: 'beendet' as const,
        vermerk: `Testabo beendet am ${tagText(b.testabo.bis)}. PlanR inkl. Sprachupgrade. Keine Lastschrift erfolgt.`,
      },
    }
  })
  return { liste: neu, geaendert }
}

export const ibanGruppiert = (iban: string) => ibanNorm(iban).replace(/(.{4})/g, '$1 ').trim()
export const ibanVerdeckt = (iban: string) => { const i = ibanNorm(iban); return `${i.slice(0, 4)} •••• •••• ${i.slice(-4)}` }

/** Höchstens 35 Zeichen aus dem SEPA-Zeichensatz */
export function neueMandatsreferenz(jetzt = new Date()): string {
  const tag = jetzt.toISOString().slice(0, 10).replace(/-/g, '')
  return `PLANR-${tag}-${randomBytes(4).toString('hex').toUpperCase()}`
}

/** Prüft die Eingaben des Buchungsformulars. Fehler je Feld (Schlüssel wie im Formular), sonst die Buchung. */
export function buchungPruefen(roh: unknown, jetzt = new Date()): { ok: true; buchung: Buchung; passwort: string } | { ok: false; fehler: Record<string, string> } {
  const r = obj(roh)
  const p = obj(r.praxis), i = obj(r.inhaber), k = obj(r.kzv), v = obj(r.pvs), s = obj(r.sepa), z = obj(r.zustimmung)
  const f: Record<string, string> = {}
  const pflicht = (wert: string, feld: string, name: string) => { if (!wert) f[feld] = `Bitte ${name} angeben.` }

  const testabo = r.testabo === true
  const paket = testabo ? 'planr_clara' : (Object.keys(PAKETE) as Paket[]).find((x) => x === r.paket)
  if (!paket) f.paket = 'Bitte ein Paket wählen.'

  const praxis = {
    name: text(p.name, 160), rechtsform: text(p.rechtsform, 40), strasse: text(p.strasse), plz: text(p.plz, 5), ort: text(p.ort),
    telefon: text(p.telefon, 40), email: text(p.email, 200).toLowerCase(), website: text(p.website, 200), ustId: text(p.ustId, 20).toUpperCase().replace(/\s/g, ''),
  }
  pflicht(praxis.name, 'praxis.name', 'den Praxisnamen')
  if (!RECHTSFORMEN.includes(praxis.rechtsform as typeof RECHTSFORMEN[number])) f['praxis.rechtsform'] = 'Bitte die Rechtsform wählen.'
  pflicht(praxis.strasse, 'praxis.strasse', 'Straße und Hausnummer')
  if (!/^\d{5}$/.test(praxis.plz)) f['praxis.plz'] = 'Bitte eine fünfstellige Postleitzahl angeben.'
  pflicht(praxis.ort, 'praxis.ort', 'den Ort')
  if (praxis.telefon.replace(/\D/g, '').length < 6) f['praxis.telefon'] = 'Bitte eine Telefonnummer angeben.'
  if (!EMAIL_RE.test(praxis.email)) f['praxis.email'] = 'Bitte eine gültige E-Mail-Adresse für Rechnungen angeben.'
  if (praxis.ustId && !/^DE\d{9}$/.test(praxis.ustId)) f['praxis.ustId'] = 'Die USt-IdNr. hat die Form DE123456789.'

  const inhaber = {
    anrede: text(i.anrede, 10), titel: text(i.titel, 40), vorname: text(i.vorname, 80), nachname: text(i.nachname, 80),
    email: text(i.email, 200).toLowerCase(), mobil: text(i.mobil, 40),
  }
  if (!['Frau', 'Herr', 'Divers'].includes(inhaber.anrede)) f['inhaber.anrede'] = 'Bitte die Anrede wählen.'
  pflicht(inhaber.vorname, 'inhaber.vorname', 'den Vornamen')
  pflicht(inhaber.nachname, 'inhaber.nachname', 'den Nachnamen')
  if (!EMAIL_RE.test(inhaber.email)) f['inhaber.email'] = 'Bitte die E-Mail-Adresse für die Anmeldung angeben.'
  // Das Passwort geht nur an die Kontoanlage und wird nirgends gespeichert.
  const passwort = String(r.passwort ?? '')
  if (passwort.length < 8 || passwort.length > 128) f.passwort = 'Das Passwort braucht mindestens 8 Zeichen.'

  const kzv = {
    nr: text(k.nr, 2), abrechnungsnr: text(k.abrechnungsnr, 12).replace(/\s/g, ''),
    zahnaerzte: Math.trunc(Number(k.zahnaerzte)), praxen: Math.trunc(Number(k.praxen) || 1), eigenlabor: k.eigenlabor === true,
  }
  if (!KZVEN.some((x) => x.nr === kzv.nr)) f['kzv.nr'] = 'Bitte den KZV-Bereich wählen.'
  if (!/^\d{4,12}$/.test(kzv.abrechnungsnr)) f['kzv.abrechnungsnr'] = 'Bitte die KZV-Abrechnungsnummer angeben (nur Ziffern).'
  if (!(kzv.zahnaerzte >= 1 && kzv.zahnaerzte <= 200)) f['kzv.zahnaerzte'] = 'Bitte die Zahl der Zahnärztinnen und Zahnärzte angeben.'
  if (!(kzv.praxen >= 1 && kzv.praxen <= 20)) f['kzv.praxen'] = 'Bitte die Zahl der Praxen angeben.'

  const pvs = {
    id: text(v.id, 30), version: text(v.version, 40),
    server: (Object.keys(SERVER) as (keyof typeof SERVER)[]).find((x) => x === v.server) ?? 'unbekannt', it: text(v.it, 160),
  }
  if (!pvsVon(pvs.id)) f['pvs.id'] = 'Bitte das Praxisverwaltungssystem wählen.'

  const pickadocKonto = text(r.pickadocKonto, 200).toLowerCase()
  if (pickadocKonto && !EMAIL_RE.test(pickadocKonto)) f.pickadocKonto = 'Bitte die E-Mail-Adresse des Pickadoc-Kontos prüfen.'
  const benutzerRoh = Array.isArray(r.benutzer) ? r.benutzer : String(r.benutzer ?? '').split(/[\s,;]+/)
  const benutzer = [...new Set(benutzerRoh.map((x) => text(x, 200).toLowerCase()).filter(Boolean))].slice(0, 30)
  const falsch = benutzer.find((x) => !EMAIL_RE.test(x))
  if (falsch) f.benutzer = `„${falsch}“ ist keine gültige E-Mail-Adresse.`

  const sepa = testabo
    ? { inhaber: '', anschrift: '', iban: '', bic: '', bank: '', mandatsreferenz: '', unterschrift: '' }
    : {
      inhaber: text(s.inhaber, 140), anschrift: text(s.anschrift, 200) || `${praxis.strasse}, ${praxis.plz} ${praxis.ort}`,
      iban: ibanNorm(String(s.iban ?? '')).slice(0, 34), bic: text(s.bic, 11).toUpperCase().replace(/\s/g, ''), bank: text(s.bank, 80),
      mandatsreferenz: neueMandatsreferenz(jetzt), unterschrift: text(s.unterschrift, 140),
    }
  if (!testabo) {
    pflicht(sepa.inhaber, 'sepa.inhaber', 'den Kontoinhaber')
    if (!ibanGueltig(sepa.iban)) f['sepa.iban'] = 'Die IBAN ist nicht gültig – bitte prüfen.'
    if (sepa.bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(sepa.bic)) f['sepa.bic'] = 'Die BIC hat 8 oder 11 Stellen.'
    if (s.mandat !== true) f['sepa.mandat'] = 'Bitte das SEPA-Lastschriftmandat erteilen.'
    if (sepa.unterschrift.length < 3) f['sepa.unterschrift'] = 'Bitte zur Bestätigung Vor- und Nachnamen eintippen.'
  }

  if (z.agb !== true) f['zustimmung.agb'] = 'Bitte den AGB zustimmen.'
  if (z.datenschutz !== true) f['zustimmung.datenschutz'] = 'Bitte die Datenschutzhinweise bestätigen.'
  if (z.avv !== true) f['zustimmung.avv'] = 'Ohne Auftragsverarbeitung darf PlanR keine Patientendaten verarbeiten.'

  if (Object.keys(f).length || !paket) return { ok: false, fehler: f }
  return {
    ok: true,
    passwort,
    buchung: {
      id: `B-${jetzt.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex').toUpperCase()}`,
      eingang: jetzt.toISOString(), paket, doku: testabo || r.doku === true, praxis, inhaber, kzv, pvs, pickadocKonto, benutzer, sepa, hinweis: text(r.hinweis, 1000),
      ...(testabo ? { testabo: testaboAnlegen(jetzt) } : {}),
    },
  }
}

const euro = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const kzvName = (nr: string) => { const k = KZVEN.find((x) => x.nr === nr); return k ? `${k.kurz} (${k.name}, Nr. ${k.nr})` : nr }
const wer = (b: Buchung) => [b.inhaber.titel, b.inhaber.vorname, b.inhaber.nachname].filter(Boolean).join(' ')
export const preisText = (p: Paket) => `${PAKETE[p].name}: ${euro(PAKETE[p].monat)} im Monat + ${euro(PRO_PLAN)} je Plan, netto zzgl. USt., jederzeit zum Monatsende kündbar. PlanR ist ein Produkt der Pickadoc GmbH`

/** Wortlaut des Mandats; dieselbe Fassung zeigt das Formular und bekommt die Praxis per Mail. */
export function mandatText(b: Pick<Buchung, 'praxis' | 'sepa'>, glaeubigerId: string, ibanAnzeige = ibanGruppiert(b.sepa.iban)): string {
  return [
    'SEPA-Lastschriftmandat (wiederkehrende Zahlungen, SEPA-Basislastschrift)',
    '',
    `Zahlungsempfänger: ${GLAEUBIGER.name}, ${GLAEUBIGER.anschrift}`,
    `Gläubiger-Identifikationsnummer: ${glaeubigerId || 'wird mit der ersten Rechnung mitgeteilt'}`,
    `Mandatsreferenz: ${b.sepa.mandatsreferenz}`,
    '',
    `Ich ermächtige / Wir ermächtigen die ${GLAEUBIGER.name}, Zahlungen von meinem / unserem Konto mittels Lastschrift einzuziehen. Zugleich weise ich mein / weisen wir unser Kreditinstitut an, die von der ${GLAEUBIGER.name} auf mein / unser Konto gezogenen Lastschriften einzulösen.`,
    'Hinweis: Ich kann / Wir können innerhalb von acht Wochen, beginnend mit dem Belastungsdatum, die Erstattung des belasteten Betrages verlangen. Es gelten dabei die mit meinem / unserem Kreditinstitut vereinbarten Bedingungen.',
    `Die ${GLAEUBIGER.name} kündigt jeden Einzug mit der Rechnung an (Vorabankündigung); die Frist wird auf einen Kalendertag vor Belastung verkürzt.`,
    '',
    `Kontoinhaber: ${b.sepa.inhaber}`,
    `Anschrift: ${b.sepa.anschrift}`,
    `IBAN: ${ibanAnzeige}${b.sepa.bic ? ` · BIC: ${b.sepa.bic}` : ''}${b.sepa.bank ? ` · ${b.sepa.bank}` : ''}`,
    `Für: ${b.praxis.name}, ${b.praxis.strasse}, ${b.praxis.plz} ${b.praxis.ort}`,
  ].join('\n')
}

/** Info-Mail an Pickadoc: alles für die Freischaltung, vollständige IBAN */
export function infoMail(b: Buchung, glaeubigerId: string): { betreff: string; text: string } {
  const pvs = pvsVon(b.pvs.id)
  const zeilen = [
    `Neue PlanR-Buchung ${b.id} vom ${new Date(b.eingang).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
    '',
    `PAKET: ${preisText(b.paket)}`,
    '',
    'PRAXIS',
    `  ${b.praxis.name} (${b.praxis.rechtsform})`,
    `  ${b.praxis.strasse}, ${b.praxis.plz} ${b.praxis.ort}`,
    `  Telefon ${b.praxis.telefon} · Rechnungen an ${b.praxis.email}`,
    ...(b.praxis.website ? [`  Website ${b.praxis.website}`] : []),
    ...(b.praxis.ustId ? [`  USt-IdNr. ${b.praxis.ustId}`] : []),
    '',
    'INHABER / ANSPRECHPARTNER',
    `  ${b.inhaber.anrede} ${wer(b)}`,
    `  Anmeldung (Praxis-Admin): ${b.inhaber.email}${b.inhaber.mobil ? ` · Mobil ${b.inhaber.mobil}` : ''}`,
    ...(b.benutzer.length ? [`  Weitere Benutzer: ${b.benutzer.join(', ')}`] : []),
    ...(b.pickadocKonto ? [`  Hat schon ein Pickadoc-Konto: ${b.pickadocKonto}`] : []),
    '',
    'KZV UND PRAXIS',
    `  KZV-Bereich: ${kzvName(b.kzv.nr)}`,
    `  KZV-Abrechnungsnummer: ${b.kzv.abrechnungsnr}`,
    `  Zahnärztinnen/Zahnärzte: ${b.kzv.zahnaerzte} · Praxen auf dem PVS-Server: ${b.kzv.praxen} · Eigenlabor: ${b.kzv.eigenlabor ? 'ja' : 'nein'}`,
    '',
    'PRAXISSYSTEM',
    `  ${pvs ? `${pvs.name} (${pvs.hersteller})` : b.pvs.id}${b.pvs.version ? `, Version ${b.pvs.version}` : ''} – Anbindung ${pvs?.bereit ? 'verfügbar' : 'in Vorbereitung'}`,
    `  Bridge-Rechner: ${SERVER[b.pvs.server]}`,
    ...(b.pvs.it ? [`  IT-Betreuung: ${b.pvs.it}`] : []),
    '',
    ...(b.testabo?.status === 'laeuft' ? [
      'TESTABO',
      `  ${b.testabo.vermerk}`,
      '  Enthalten: PlanR mit Sprachsteuerung und die KI-Sprachdokumentation.',
      '  Keine Lastschrift in der Testzeit. Danach endet der Zugang.',
    ] : [
      'SEPA-LASTSCHRIFTMANDAT (erteilt online, bestätigt mit dem Namen „' + b.sepa.unterschrift + '“)',
      ...mandatText(b, glaeubigerId).split('\n').map((z) => `  ${z}`),
    ]),
    '',
    'ZUSTIMMUNG: AGB, Datenschutzhinweise und Auftragsverarbeitung (Art. 28 DSGVO) bestätigt.',
    ...(b.hinweis ? ['', 'NACHRICHT DER PRAXIS', `  ${b.hinweis}`] : []),
    '',
    ...(b.konto?.status === 'angelegt' ? [
      'FREISCHALTUNG: automatisch erledigt',
      `  Praxis in Pickadoc angelegt (clientId ${b.konto.clientId}), Admin-Konto ${b.inhaber.email} mit selbst gewähltem Passwort,`,
      `  subscriptions.planr = { enabled: true, sprachsteuerung: ${PAKETE[b.paket].sprachsteuerung}, doku: ${b.doku === true} }. Die Praxis kann sich sofort anmelden.`,
      `  Bitte nur prüfen: Buchung plausibel? ${b.testabo?.status === 'laeuft' ? `Testabo bis ${tagText(b.testabo.bis)}. Kein SEPA-Mandat.` : `SEPA-Mandat ${b.sepa.mandatsreferenz} ins Lastschriftverfahren übernehmen.`}`,
    ] : [
      `ZU TUN FÜR DIE FREISCHALTUNG (${b.konto?.status === 'vorhanden' ? 'für diese E-Mail gibt es schon ein Pickadoc-Konto' : 'automatische Anlage hat nicht geklappt'})`,
      `  1. Praxis in Pickadoc finden bzw. anlegen; Konto ${b.inhaber.email} als Admin.`,
      `  2. Billing: subscriptions.planr = { enabled: true, sprachsteuerung: ${PAKETE[b.paket].sprachsteuerung}, doku: ${b.doku === true}${b.testabo?.status === 'laeuft' ? `, testaboBis: ${b.testabo.bis}` : ''} }${b.testabo?.status === 'laeuft' ? '. Kein SEPA-Mandat.' : `, SEPA-Mandat ${b.sepa.mandatsreferenz} hinterlegen.`}`,
      `  3. ${b.konto?.status === 'vorhanden' ? 'Der Praxis Bescheid geben: Anmeldung mit dem bestehenden Pickadoc-Passwort.' : 'Passwort-Mail an die Praxis auslösen (PlanR-Anmeldung → „Passwort vergessen“).'}`,
    ]),
  ]
  return {
    betreff: b.testabo?.status === 'laeuft'
      ? `PlanR-Testabo: ${b.praxis.name} (${b.id})`
      : b.testabo?.status === 'abo'
        ? `PlanR-Abo: ${b.praxis.name} (${b.id})`
        : `PlanR-Buchung: ${b.praxis.name} – ${PAKETE[b.paket].name} (${b.id})`,
    text: zeilen.join('\n'),
  }
}

/** Mail an die Praxis: nur Zugangsdaten und der erste Plan. Keine Freischaltung, keine Bridge. */
export function kundenMail(b: Buchung, _glaeubigerId: string, basis = 'https://planr.pickadoc.de'): { betreff: string; text: string } {
  const anrede = b.inhaber.anrede === 'Frau' ? `Sehr geehrte Frau ${[b.inhaber.titel, b.inhaber.nachname].filter(Boolean).join(' ')}`
    : b.inhaber.anrede === 'Herr' ? `Sehr geehrter Herr ${[b.inhaber.titel, b.inhaber.nachname].filter(Boolean).join(' ')}` : `Guten Tag ${wer(b)}`
  if (b.konto?.status === 'manuell') {
    return {
      betreff: `Ihre PlanR-Buchung ${b.id}`,
      text: [
        `${anrede},`,
        '',
        'Die Buchung ist eingegangen. Das Konto konnte gerade nicht angelegt werden.',
        'Bitte die Buchung noch einmal abschicken oder anrufen: 0211 3029 3035.',
        '',
        'Freundliche Grüße',
        'Ihr PlanR-Team der Pickadoc GmbH',
        GLAEUBIGER.anschrift,
      ].join('\n'),
    }
  }
  const passwort = 'das Passwort aus der Registrierung.'
  const text = [
    `${anrede},`,
    '',
    'Ihr PlanR-Zugang:',
    `Anmeldung: ${basis}`,
    `E-Mail: ${b.inhaber.email}`,
    `Passwort: ${passwort}`,
    '',
    'Erster Plan: Nach der Anmeldung einen Patienten suchen und den Befund sagen. PlanR schreibt den Heil- und Kostenplan.',
    '',
    'Freundliche Grüße',
    'Ihr PlanR-Team der Pickadoc GmbH',
    GLAEUBIGER.anschrift,
  ].join('\n')
  return {
    betreff: b.testabo?.status === 'laeuft' ? `Ihr PlanR-Zugang ${b.id}` : `Ihr PlanR-Zugang ${b.id}`,
    text,
  }
}

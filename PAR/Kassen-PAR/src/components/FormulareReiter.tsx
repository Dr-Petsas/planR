import { useState, type ReactNode } from 'react'
import { aitZaehne, cptZaehne, befundFuer, initialBefund, letzterBefund, subgingivalZaehne, zaehneAus } from '../engine/strecke'
import type { Antragskopf, DiagnoseErgebnis, Einstellungen, ParFall } from '../types'
import { Antragsbox, Fi, Seite, Unterschrift, Versichertenfeld, X } from './Formteile'

type FormId = 'zusatz' | '5d' | '5e' | 'mit8'

const FORMULARE: { id: FormId; label: string }[] = [
  { id: 'zusatz', label: 'Zusatzseite Wechsel' },
  { id: '5d', label: '5d Verlängerung UPT' },
  { id: '5e', label: '5e § 22a SGB V' },
  { id: 'mit8', label: 'MIT 8 CPT' },
]

interface Props {
  fall: ParFall; setFall: (f: ParFall) => void
  einst: Einstellungen; setEinst: (e: Einstellungen) => void
  diag: DiagnoseErgebnis
}

/**
 * Eingabe-Helfer der Zusatzformulare: jedes Feld speichert unter seinem
 * Schluessel in `fall.zusatz.werte`; ohne Eintrag steht der Vorschlag aus dem Fall.
 */
interface Ein {
  wert: (key: string, vorschlag?: string) => string
  an: (key: string, vorschlag: boolean) => boolean
  feld: (key: string, vorschlag?: string, opt?: { type?: 'text' | 'date'; breite?: string; mono?: boolean }) => ReactNode
  text: (key: string, vorschlag?: string) => ReactNode
  kreuz: (key: string, vorschlag: boolean) => ReactNode
  /** Kreuz einer Auswahlgruppe: setzt `wert`, erneuter Klick leert die Gruppe. */
  wahl: (key: string, wert: string, vorschlag: string) => ReactNode
  antrag: (pre: string, vorschlag: Partial<Antragskopf>, art: Antragskopf['artBehandlungsplan']) => {
    a: Antragskopf; set: (patch: Partial<Antragskopf>) => void
  }
}

const ANTRAG_FELDER = ['antragsnummer', 'antragsnummerUrspruenglich', 'verarbeitungskennzeichen', 'wechselkennzeichen', 'aktenzeichenPVS'] as const

export default function FormulareReiter({ fall, setFall, einst, setEinst, diag }: Props) {
  const [form, setForm] = useState<FormId>(fall.planung.par22a ? '5e' : fall.mitCPT ? 'mit8' : '5d')
  const w = fall.zusatz.werte
  const setWerte = (neu: Record<string, string>) => setFall({ ...fall, zusatz: { ...fall.zusatz, werte: neu } })
  const setW = (key: string, v: string) => setWerte({ ...w, [key]: v })

  const wert: Ein['wert'] = (key, vorschlag = '') => w[key] ?? vorschlag
  const an: Ein['an'] = (key, vorschlag) => (w[key] == null ? vorschlag : w[key] === 'x')
  const ein: Ein = {
    wert,
    an,
    feld: (key, vorschlag = '', opt = {}) => (
      <Fi value={wert(key, vorschlag)} vorschlag={w[key] == null && vorschlag !== ''} onChange={(v) => setW(key, v)}
        type={opt.type} breite={opt.breite} mono={opt.mono} />
    ),
    text: (key, vorschlag = '') => (
      <textarea className={`textbox fi-text${w[key] == null && vorschlag ? ' vorschlag' : ''}`}
        value={wert(key, vorschlag)} onChange={(e) => setW(key, e.target.value)} />
    ),
    kreuz: (key, vorschlag) => {
      const ist = an(key, vorschlag)
      return <X an={ist} onClick={() => setW(key, ist ? '' : 'x')} />
    },
    wahl: (key, v, vorschlag) => {
      const ist = wert(key, vorschlag) === v
      return <X an={ist} onClick={() => setW(key, ist ? '' : v)} />
    },
    antrag: (pre, vorschlag, art) => {
      const a: Antragskopf = { ...fall.antrag, artBehandlungsplan: art }
      for (const k of ANTRAG_FELDER) (a as unknown as Record<string, string>)[k] = w[pre + k] ?? vorschlag[k] ?? ''
      const set = (patch: Partial<Antragskopf>) => {
        const neu = { ...w }
        for (const [k, v] of Object.entries(patch)) neu[pre + k] = String(v)
        setWerte(neu)
      }
      return { a, set }
    },
  }

  const eigene = Object.keys(w).filter((k) => k.startsWith(`${form}.`))
  const zuruecksetzen = () => {
    if (!confirm('Alle Einträge dieses Formulars löschen und wieder die Vorschläge aus dem Fall zeigen?')) return
    setWerte(Object.fromEntries(Object.entries(w).filter(([k]) => !k.startsWith(`${form}.`))))
  }
  const kopf = <Versichertenfeld fall={fall} einst={einst} setFall={setFall} setEinst={setEinst} />

  return (
    <div className="reiter-inhalt">
      <div className="formular-wahl keindruck">
        {FORMULARE.map((f) => (
          <button key={f.id} className={form === f.id ? 'aktiv' : ''} onClick={() => setForm(f.id)}>{f.label}</button>
        ))}
        {eigene.length > 0 && <button onClick={zuruecksetzen}>Einträge zurücksetzen</button>}
        <span className="form-leiste-hilfe">Alles direkt im Formular eintragen. Blau kursiv = Vorschlag aus dem Fall, wird beim Überschreiben zum eigenen Eintrag.</span>
      </div>

      <div className="druck-bereich">
        {form === 'zusatz' && <ZusatzForm fall={fall} ein={ein} kopf={kopf} />}
        {form === '5d' && <F5dForm fall={fall} ein={ein} kopf={kopf} diag={diag} />}
        {form === '5e' && <F5eForm fall={fall} ein={ein} kopf={kopf} />}
        {form === 'mit8' && <Mit8Form fall={fall} ein={ein} kopf={kopf} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Zusatzseite, 5d, 5e, MIT 8
// ---------------------------------------------------------------------------

interface FormProps { fall: ParFall; ein: Ein; kopf: ReactNode }

/** Formularkopf: Versichertenfeld links, rechts Titel und darunter der Antragskopf (im Fluss, keine Ueberlappung). */
function Kopf({ kopf, titel, rechts }: { kopf: ReactNode; titel: ReactNode; rechts?: ReactNode }) {
  return <div className="a4-kopf">{kopf}<div className="a4-kopf-rechts titel-fluss">{titel}{rechts}</div></div>
}

function Linie({ label, wert }: { label: string; wert: ReactNode }) {
  return <div className="linie"><span>{label}</span><span className="linie-wert">{wert}</span></div>
}

const zahl = (n: number) => (n ? String(n) : '')

function ZusatzForm({ fall, ein, kopf }: FormProps) {
  const z = fall.zusatz
  const v = z.vorherLeistungen
  const nr = (k: keyof typeof v, label: string) => <Linie label={`Anzahl Gebührennummer ${label}`} wert={ein.feld(`zusatz.anzahl${k}`, zahl(v[k]), { breite: '20mm' })} />
  return (
    <Seite titel={null}>
      <Kopf kopf={kopf} titel={<h2>Informationen zum<br />Krankenkassenwechsel / Zahnarztwechsel<br /><span className="mono">PAR Zusatzseite</span></h2>} />
      <div className="zusatzseite">
        <Linie label="Antragsnummer" wert={ein.feld('zusatz.antragsnummer', fall.antrag.antragsnummer)} />
        <Linie label="Krankenkassenwechsel / Zahnarztwechsel" wert={ein.feld('zusatz.wechselText', z.wechselText)} />
        <Linie label="Antragsnummer vorherige Krankenkasse" wert={ein.feld('zusatz.antragsnummerVorher', z.wechselAntragsnummerVorher)} />
        <Linie label="Institutionskennzeichen vorherige Krankenkasse" wert={ein.feld('zusatz.ikVorher', z.wechselIkVorher)} />
        <h4>Leistungen (Blatt 2) vorherige Krankenkasse</h4>
        {nr('4', '4')}
        {nr('ATG', 'ATG')}
        {nr('MHU', 'MHU')}
        {nr('AITa', 'AITa')}
        {nr('AITb', 'AITb')}
        {nr('BEVa', 'BEVa')}
        <Linie label="Nummer der zuletzt erbrachten UPT" wert={ein.feld('zusatz.letzteUpt', zahl(z.vorherLetzteUpt), { breite: '20mm' })} />
      </div>
    </Seite>
  )
}

function F5dForm({ fall, ein, kopf, diag }: FormProps & { diag: DiagnoseErgebnis }) {
  const z = fall.zusatz
  const sub = zaehneAus(subgingivalZaehne(letzterBefund(fall)))
  const ersteUpt = fall.termine.filter((t) => t.art === 'upt').sort((a, c) => a.datum.localeCompare(c.datum))[0]
  const { a, set } = ein.antrag('5d.antrag.', {
    antragsnummerUrspruenglich: fall.antrag.antragsnummer, aktenzeichenPVS: fall.antrag.aktenzeichenPVS,
  }, 'upt_verlaengerung')
  const zeitraum = z.verlaengerungUeber6 ? 'laenger' : 'regel'
  return (
    <Seite titel={null}>
      <Kopf kopf={kopf}
        titel={<h2>Antrag auf Verlängerung<br />der Unterstützenden Parodontitistherapie (UPT)<br />gemäß § 13 Abs. 4 PAR-Richtlinie</h2>}
        rechts={<Antragsbox a={a} set={set} art="UPT-Verlängerung" />} />
      <div className="f5d">
        <div className="b1-reihe">Parodontalstatus vom: {ein.feld('5d.parStatusVom', initialBefund(fall).datum, { type: 'date' })}
          <span className="rechts">Grad (Progression) nach PAR-Status:{' '}
            {ein.wahl('5d.grad', 'A', diag.grad)} A {ein.wahl('5d.grad', 'B', diag.grad)} B {ein.wahl('5d.grad', 'C', diag.grad)} C</span></div>
        <div className="b1-reihe">Datum der ersten UPT-Leistung: {ein.feld('5d.ersteUpt', ersteUpt?.datum ?? '', { type: 'date' })}</div>
        <p>An den folgenden Zähnen liegen noch behandlungsbedürftige Parodontien mit Sondierungstiefen ≥ 4 mm und Sondierungsbluten oder mit Sondierungstiefen ≥ 5 mm vor:</p>
        {ein.text('5d.zaehne', sub.join(', '))}
        <div className="b1-reihe kreuz-zeile">{ein.wahl('5d.zeitraum', 'regel', zeitraum)}<span>Es wird eine Verlängerung der UPT um den Regelzeitraum von 6 Monaten beantragt.</span></div>
        <div className="b1-reihe kreuz-zeile">{ein.wahl('5d.zeitraum', 'laenger', zeitraum)}<span>Es wird beantragt, den Verlängerungszeitraum über den Regelzeitraum von 6 Monaten hinaus
          auf insgesamt {ein.feld('5d.monate', z.verlaengerungUeber6 ? String(z.verlaengerungMonateGesamt) : '', { breite: '12mm' })} Monate festzusetzen. Dies wird wie folgt begründet:</span></div>
        {ein.text('5d.begruendung', z.verlaengerungBegruendung)}
        <div className="drei-spalten">
          <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Zahnarztes</b></>} />
          <div><h4>Gutachten</h4>
            <div>{ein.wahl('5d.gutachten', 'ja', '')} Gutachtlich befürwortet</div>
            <div>{ein.wahl('5d.gutachten', 'nein', '')} Gutachtlich nicht befürwortet</div>
            <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Gutachters</b></>} /></div>
          <div><h4>Entscheidung der Krankenkasse</h4><div>Die Kosten für die Verlängerung der UPT</div>
            <div>{ein.wahl('5d.kk', 'ja', '')} werden übernommen</div>
            <div>{ein.wahl('5d.kk', 'nein', '')} werden nicht übernommen</div>
            <Unterschrift text={<>Datum, Unterschrift und Stempel der <b>Krankenkasse</b></>} /></div>
        </div>
      </div>
    </Seite>
  )
}

function F5eForm({ fall, ein, kopf }: FormProps) {
  const z = fall.zusatz
  const ait = aitZaehne(initialBefund(fall))
  const offen = ein.an('5e.narkoseOffen', z.par22aNarkoseOffen)
  const cpt = offen ? cptZaehne(initialBefund(fall)) : { ein: [], mehr: [] }
  const aitA = ait.ein.filter((x) => !cpt.ein.includes(x))
  const aitB = ait.mehr.filter((x) => !cpt.mehr.includes(x))
  const { a, set } = ein.antrag('5e.antrag.', {
    antragsnummer: fall.antrag.antragsnummer, aktenzeichenPVS: fall.antrag.aktenzeichenPVS,
  }, 'initial')
  const zeile = (key: string, nr: string, zaehne: string[] | null, anzahl: number) => (
    <tr>
      <td>{nr}</td>
      <td>{zaehne == null ? <span className="gestrichelt" /> : ein.feld(`5e.${key}.zaehne`, zaehne.join(', '))}</td>
      <td>{ein.feld(`5e.${key}.anzahl`, zahl(anzahl), { breite: '14mm' })}</td>
    </tr>
  )
  return (
    <Seite titel={null}>
      <Kopf kopf={kopf} titel={<h2>Anzeige einer Behandlung von Parodontitis<br />bei anspruchsberechtigten Versicherten<br />nach § 22a SGB V<br />gemäß Abschnitt B V. Ziffer 2<br />der Behandlungsrichtlinie</h2>} />
      <div className="f5e">
        <h3>Begründung</h3>
        <div className="b1-reihe kreuz-zeile">{ein.kreuz('5e.mundhygiene', z.par22aMundhygiene)} Eingeschränkte oder nicht vorhandene Fähigkeit zur Aufrechterhaltung der Mundhygiene</div>
        <div className="b1-reihe kreuz-zeile">{ein.kreuz('5e.kooperation', z.par22aKooperation)} Eingeschränkte oder nicht vorhandene Kooperationsfähigkeit</div>
        <div className="b1-reihe kreuz-zeile">{ein.kreuz('5e.narkoseGeschlossen', z.par22aNarkoseGeschlossen)} Behandlung in Allgemeinnarkose notwendig - geschlossenes Vorgehen</div>
        <div className="b1-reihe kreuz-zeile">{ein.kreuz('5e.narkoseOffen', z.par22aNarkoseOffen)} Ausnahmefall: Behandlung in Allgemeinnarkose notwendig - offenes Vorgehen an Zähnen mit ST ≥ 6 mm (an den Zähnen, bei denen ein offenes Vorgehen erforderlich ist, erfolgt dieses anstelle der AIT)</div>
        <h3>Folgende Leistungen werden angezeigt:</h3>
        <table className="f5e-tab">
          <thead><tr><th>Geb.-Nr.</th><th>Zahnangabe</th><th>Anzahl</th></tr></thead>
          <tbody>
            {zeile('4', '4', null, 1)}
            {zeile('aitA', 'AIT a', aitA, aitA.length)}
            {zeile('aitB', 'AIT b', aitB, aitB.length)}
            {zeile('cptA', 'CPT a', cpt.ein, cpt.ein.length)}
            {zeile('cptB', 'CPT b', cpt.mehr, cpt.mehr.length)}
          </tbody>
        </table>
        <div className="zwei-spalten">
          <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Zahnarztes</b></>} />
          <Antragsbox a={a} set={set} art="§ 22a" />
        </div>
      </div>
    </Seite>
  )
}

function Mit8Form({ fall, ein, kopf }: FormProps) {
  const z = fall.zusatz
  const cpt = cptZaehne(befundFuer(fall, 'beva') ?? initialBefund(fall))
  const datumPlan = initialBefund(fall).datum
  return (
    <Seite titel={null}>
      <div className="a4-kopf">
        {kopf}
        <div className="antragsbox">
          <div><small>Mitteilungsnummer</small>{ein.feld('mit8.mitteilungsnummer', z.mitteilungsnummer)}</div>
          <div><small>Mitteilungsnummer ursprüngliche Mitteilung</small>{ein.feld('mit8.mitteilungsnummerUrspruenglich')}</div>
          <div><small>Antragsnummer ursprünglicher Behandlungsplan</small>{ein.feld('mit8.antragsnummerUrspruenglich', fall.antrag.antragsnummer)}</div>
          <div><small>Verarbeitungskennzeichen</small>{ein.feld('mit8.verarbeitungskennzeichen', fall.antrag.verarbeitungskennzeichen)}</div>
          <div className="antragsbox-fuss">
            <small>Datum Behandlungsplan {ein.feld('mit8.datumPlan', datumPlan, { type: 'date' })}</small>
            <small>Aktenzeichen PVS {ein.feld('mit8.aktenzeichenPVS', fall.antrag.aktenzeichenPVS)}</small>
            <small>logische Version<br /><b className="mono">2.1.0</b></small>
          </div>
        </div>
      </div>
      <div className="mit8">
        <h3>Mitteilung über eine chirurgische Therapie (offenes Vorgehen)<br />gemäß § 12 Abs. 1 der PAR-RL</h3>
        <p>Es werden weitere Maßnahmen im Rahmen der systematischen PAR-Therapie zum Parodontalstatus vom {ein.feld('mit8.parStatusVom', datumPlan, { type: 'date' })} notwendig.</p>
        <p>Überweisung an einen spezialisierten Zahnarzt zur Durchführung der CPT<br />
          {ein.wahl('mit8.ueberweisung', 'ja', z.cptUeberweisung ? 'ja' : 'nein')} ja{' '}
          {ein.wahl('mit8.ueberweisung', 'nein', z.cptUeberweisung ? 'ja' : 'nein')} nein</p>
        <p>Folgende Leistungen werden angezeigt:</p>
        <table className="f5e-tab">
          <thead><tr><th>Geb.-Nr.</th><th>Zahnangabe</th></tr></thead>
          <tbody>
            <tr><td>CPT a</td><td>{ein.feld('mit8.cptA', cpt.ein.join(', '))}</td></tr>
            <tr><td>CPT b</td><td>{ein.feld('mit8.cptB', cpt.mehr.join(', '))}</td></tr>
          </tbody>
        </table>
        <div className="mit8-unterschrift"><Unterschrift text="Datum, Unterschrift und Stempel der Zahnärztin / des Zahnarztes" /></div>
      </div>
    </Seite>
  )
}

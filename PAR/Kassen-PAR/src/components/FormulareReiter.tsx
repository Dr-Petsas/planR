import { useState, type ReactNode } from 'react'
import { aitZaehne, cptZaehne, befundFuer, initialBefund, leistungsblock, letzterBefund, subgingivalZaehne, zaehneAus } from '../engine/strecke'
import { datumDe } from '../engine/termine'
import type { DiagnoseErgebnis, Einstellungen, ParFall, Zusatzformulare } from '../types'
import { Blatt2Chart } from './Blatt2Chart'
import { Feld, Karte, Schalter, TextFeld, ZahlFeld } from './ui'

type FormId = 'blatt1' | 'blatt2' | 'zusatz' | '5d' | '5e' | 'mit8'

const FORMULARE: { id: FormId; label: string }[] = [
  { id: 'blatt1', label: 'Blatt 1' },
  { id: 'blatt2', label: 'Blatt 2' },
  { id: 'zusatz', label: 'Zusatzseite Wechsel' },
  { id: '5d', label: '5d Verlängerung UPT' },
  { id: '5e', label: '5e § 22a SGB V' },
  { id: 'mit8', label: 'MIT 8 CPT' },
]

interface Props { fall: ParFall; setFall: (f: ParFall) => void; einst: Einstellungen; diag: DiagnoseErgebnis }

export default function FormulareReiter({ fall, setFall, einst, diag }: Props) {
  const [form, setForm] = useState<FormId>('blatt1')
  const setZ = (patch: Partial<Zusatzformulare>) => setFall({ ...fall, zusatz: { ...fall.zusatz, ...patch } })
  const z = fall.zusatz

  return (
    <div className="reiter-inhalt">
      <div className="formular-wahl keindruck">
        {FORMULARE.map((f) => (
          <button key={f.id} className={form === f.id ? 'aktiv' : ''} onClick={() => setForm(f.id)}>{f.label}</button>
        ))}
        <button onClick={() => window.print()}>Drucken</button>
      </div>

      {form === 'zusatz' && (
        <Karte titel="Angaben Zusatzseite">
          <div className="feld-raster">
            <TextFeld label="Kassen-/Zahnarztwechsel (Text)" weit value={z.wechselText} onChange={(v) => setZ({ wechselText: v })} />
            <TextFeld label="Antragsnr. vorherige Kasse" value={z.wechselAntragsnummerVorher} onChange={(v) => setZ({ wechselAntragsnummerVorher: v })} />
            <TextFeld label="IK vorherige Kasse" value={z.wechselIkVorher} onChange={(v) => setZ({ wechselIkVorher: v })} />
            {(['4', 'ATG', 'MHU', 'AITa', 'AITb', 'BEVa'] as const).map((k) => (
              <ZahlFeld key={k} label={`Anzahl ${k} (vorher)`} value={z.vorherLeistungen[k]} min={0}
                onChange={(v) => setZ({ vorherLeistungen: { ...z.vorherLeistungen, [k]: v } })} />
            ))}
            <ZahlFeld label="zuletzt erbrachte UPT Nr." value={z.vorherLetzteUpt} min={0} onChange={(v) => setZ({ vorherLetzteUpt: v })} />
          </div>
        </Karte>
      )}
      {form === '5d' && (
        <Karte titel="Angaben 5d">
          <Schalter label="Verlängerung über 6 Monate hinaus" checked={z.verlaengerungUeber6} onChange={(v) => setZ({ verlaengerungUeber6: v })} />
          {z.verlaengerungUeber6 && (
            <div className="feld-raster">
              <ZahlFeld label="insgesamt Monate" value={z.verlaengerungMonateGesamt} min={7} max={24} onChange={(v) => setZ({ verlaengerungMonateGesamt: v })} />
              <TextFeld label="Begründung" weit value={z.verlaengerungBegruendung} onChange={(v) => setZ({ verlaengerungBegruendung: v })} />
            </div>
          )}
        </Karte>
      )}
      {form === '5e' && (
        <Karte titel="Angaben 5e">
          <div className="schalter-reihe">
            <Schalter label="Mundhygiene eingeschränkt" checked={z.par22aMundhygiene} onChange={(v) => setZ({ par22aMundhygiene: v })} />
            <Schalter label="Kooperation eingeschränkt" checked={z.par22aKooperation} onChange={(v) => setZ({ par22aKooperation: v })} />
            <Schalter label="Narkose – geschlossen" checked={z.par22aNarkoseGeschlossen} onChange={(v) => setZ({ par22aNarkoseGeschlossen: v })} />
            <Schalter label="Narkose – offen (ST ≥ 6 mm)" checked={z.par22aNarkoseOffen} onChange={(v) => setZ({ par22aNarkoseOffen: v })} />
          </div>
        </Karte>
      )}
      {form === 'mit8' && (
        <Karte titel="Angaben MIT 8">
          <div className="feld-raster">
            <TextFeld label="Mitteilungsnummer" value={z.mitteilungsnummer} onChange={(v) => setZ({ mitteilungsnummer: v })} />
            <Feld label="Überweisung an Spezialisten">
              <select value={z.cptUeberweisung ? 'ja' : 'nein'} onChange={(e) => setZ({ cptUeberweisung: e.target.value === 'ja' })}>
                <option value="nein">nein</option><option value="ja">ja</option>
              </select>
            </Feld>
          </div>
        </Karte>
      )}

      <div className="druck-bereich">
        {form === 'blatt1' && <Blatt1Druck fall={fall} einst={einst} diag={diag} />}
        {form === 'blatt2' && <Blatt2Druck fall={fall} einst={einst} />}
        {form === 'zusatz' && <ZusatzDruck fall={fall} einst={einst} />}
        {form === '5d' && <F5dDruck fall={fall} einst={einst} diag={diag} />}
        {form === '5e' && <F5eDruck fall={fall} einst={einst} />}
        {form === 'mit8' && <Mit8Druck fall={fall} einst={einst} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

const X = ({ an }: { an: boolean }) => <span className={`kreuz${an ? ' an' : ''}`}>{an ? '✕' : ''}</span>

function Versichertenfeld({ fall, einst }: { fall: ParFall; einst: Einstellungen }) {
  const p = fall.patient
  return (
    <div className="vf">
      <div className="vf-zeile"><small>Krankenkasse bzw. Kostenträger</small><span>{p.kasse}</span></div>
      <div className="vf-zeile hoch"><small>Name, Vorname des Versicherten</small><span>{[p.name, p.vorname].filter(Boolean).join(', ')}</span>
        <small className="vf-geb">geb. am <b>{datumDe(p.geburtsdatum)}</b></small></div>
      <div className="vf-drei">
        <div><small>Kostenträgerkennung</small><span>{p.kostentraegerkennung}</span></div>
        <div><small>Versicherten-Nr.</small><span>{p.versichertennr}</span></div>
        <div><small>Status</small><span></span></div>
      </div>
      <div className="vf-drei">
        <div><small>Abrechnungs-Nr.</small><span>{einst.praxis.abrechnungsNr}</span></div>
        <div><small>Zahnarzt-Nr.</small><span>{einst.praxis.zahnarztNr}</span></div>
        <div><small>Datum</small><span>{datumDe(fall.datum)}</span></div>
      </div>
    </div>
  )
}

function Antragsbox({ fall, art }: { fall: ParFall; art?: string }) {
  const a = fall.antrag
  return (
    <div className="antragsbox">
      <div><small>Antragsnummer</small><span>{a.antragsnummer}</span></div>
      <div><small>Antragsnummer ursprünglicher Behandlungsplan</small><span>{a.antragsnummerUrspruenglich}</span></div>
      <div><small>Verarbeitungskennzeichen</small><span>{a.verarbeitungskennzeichen}</span></div>
      <div><small>Art des Behandlungsplans</small><span>{art ?? artText(a.artBehandlungsplan)}</span></div>
      <div className="antragsbox-fuss">
        <small>Seite</small><small>Wechselkennzeichen <b>{a.wechselkennzeichen === 'kasse' ? 'K' : a.wechselkennzeichen === 'zahnarzt' ? 'Z' : ''}</b></small>
        <small>Akt.-Z. PVS <b>{a.aktenzeichenPVS}</b></small><small>log. Version<br /><b className="mono">{a.logVersion}</b></small>
      </div>
    </div>
  )
}

const artText = (a: ParFall['antrag']['artBehandlungsplan']) =>
  a === 'initial' ? 'PAR' : a === 'bev' ? 'BEV' : a === 'cpt' ? 'CPT' : 'UPT-Verlängerung'

function Seite({ children, titel, unter }: { children: ReactNode; titel: ReactNode; unter?: ReactNode }) {
  return (
    <div className="a4">
      <div className="a4-stand">- Stand: 17.12.2025 -</div>
      <div className="a4-kopf-titel">{titel}{unter}</div>
      {children}
    </div>
  )
}

function Unterschrift({ text }: { text: ReactNode }) {
  return <div className="unterschrift"><small>{text}</small><div className="unterschrift-feld" /></div>
}

// ---------------------------------------------------------------------------
// Blatt 1
// ---------------------------------------------------------------------------

function Blatt1Druck({ fall, einst, diag }: { fall: ParFall; einst: Einstellungen; diag: DiagnoseErgebnis }) {
  const d = fall.diagnose
  const an = fall.anamnese
  const s = diag.stadium
  const ka = d.knochenabbauProzent
  const cal = d.calMax
  return (
    <Seite titel={<h1>PARODONTALSTATUS <small>Blatt 1</small></h1>}>
      <div className="a4-kopf">
        <Versichertenfeld fall={fall} einst={einst} />
        <div className="a4-kopf-rechts">
          <div className="vom">vom <u>{datumDe(initialBefund(fall).datum)}</u></div>
          <Antragsbox fall={fall} />
        </div>
      </div>

      <div className="b1-block zwei">
        <div>
          <h4>Allgemeine und parodontitisspezifische Anamnese</h4>
          <div className="b1-reihe"><X an={an.diabetesMellitus} /> Diabetes mellitus <X an={!!an.sonstiges} /> Sonstiges</div>
          <div className="b1-reihe"><X an={an.tabakkonsum} /> Tabakkonsum</div>
        </div>
        <div>
          <h4>Spezielle Vorgeschichte</h4>
          <div>Frühere PAR-Therapie<br />Angabe des Jahres: ca. <u>{an.fruehereParTherapie ? an.fruehereParJahr : ''}</u></div>
        </div>
      </div>

      <div className="b1-block diagnose">
        <div className="b1-reihe"><h4>Diagnose</h4><X an={d.diagnoseTyp === 'parodontitis'} /> Parodontitis
          <X an={d.diagnoseTyp === 'sonstige_vergroesserung'} /> Andere das Parodont betreffende Zustände: generalisierte gingivale Vergrößerungen</div>
        <div className="b1-reihe"><X an={d.diagnoseTyp === 'systemisch'} /> Parodontitis als Manifestation systemischer Erkrankungen</div>
      </div>

      <div className="b1-block">
        <h4>Stadium <small>(Schweregrad, der Patient wird durch das höchste Stadium charakterisiert)</small></h4>
        <table className="b1-tab">
          <tbody>
            <tr><td></td>{[1, 2, 3, 4].map((i) => <td key={i}><X an={s === i} /> <b>Stadium {['I', 'II', 'III', 'IV'][i - 1]}</b></td>)}</tr>
            <tr>
              <td>Röntg. Knochenabbau (KA)<br />(oder interdentaler CAL)</td>
              <td><X an={ka > 0 && ka < 15} /> &lt; 15 %<br /><X an={cal >= 1 && cal <= 2} /> (1 – 2 mm)</td>
              <td><X an={ka >= 15 && ka <= 33} /> 15 - 33 %<br /><X an={cal >= 3 && cal <= 4} /> (3 – 4 mm)</td>
              <td colSpan={2} className="rechts"><X an={ka > 33} /> &gt; 33 %<br /><X an={cal >= 5} /> (≥5 mm)</td>
            </tr>
            <tr>
              <td>Zahnverlust aufgrund von Parodontitis</td>
              <td></td>
              <td><X an={d.zahnverlustPar === 0} /> Nein</td>
              <td><X an={d.zahnverlustPar >= 1 && d.zahnverlustPar <= 4} /> ≤ 4 Zähne</td>
              <td><X an={d.zahnverlustPar >= 5} /> ≥ 5 Zähne</td>
            </tr>
            <tr>
              <td>Komplexitätsfaktoren (anzukreuzen, auch wenn nur ein Faktor aus der jeweiligen Gruppe vorliegt)</td>
              <td></td>
              <td><X an={false} /> ST = 5 mm, vorwiegend horizontaler KA</td>
              <td><X an={d.st6plus || d.vertikalerKA3 || d.furkationII_III} /> ST ≥ 6 mm, vertikaler KA ≥ 3 mm, FB Grad II oder III</td>
              <td><X an={d.komplexeReha} /> Komplexe Rehabilitation wegen mastikatorischer Dysfunktion erforderlich</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="b1-block">
        <h4>Ausmaß/Verteilung <small>(für das höchste Stadium)</small></h4>
        <div className="b1-reihe">
          <X an={diag.ausmass === 'lokalisiert'} /> Lokalisiert (&lt; 30 % der Zähne)
          <X an={diag.ausmass === 'generalisiert'} /> Generalisiert (≥30 % der Zähne)
          <X an={diag.ausmass === 'molaren-inzisiven'} /> Molaren-Inzisiven-Muster
        </div>
      </div>

      <div className="b1-block">
        <table className="b1-tab">
          <tbody>
            <tr><td><h4>Grad <small>(Progression)</small></h4></td>{(['A', 'B', 'C'] as const).map((g) => <td key={g}><X an={diag.grad === g} /> <b>Grad {g}</b></td>)}</tr>
            <tr><td>Knochenabbauindex (KA (%)/Alter)</td>
              <td><X an={d.alter > 0 && diag.kaIndex < 0.25} /> &lt; 0,25</td>
              <td><X an={diag.kaIndex >= 0.25 && diag.kaIndex <= 1} /> 0,25 - 1,0</td>
              <td><X an={diag.kaIndex > 1} /> &gt; 1,0</td></tr>
            <tr><td>Diabetes</td>
              <td><X an={d.diabetes === 'nein'} /> Kein Diabetes</td>
              <td><X an={d.diabetes === 'hba1c_unter7'} /> HbA 1c &lt; 7,0 %</td>
              <td><X an={d.diabetes === 'hba1c_ab7'} /> HbA 1c≥7,0 %</td></tr>
            <tr><td>Rauchen</td>
              <td><X an={d.raucher === 'nein'} /> Kein Rauchen</td>
              <td><X an={d.raucher === 'unter10'} /> &lt; 10 Zig./Tag</td>
              <td><X an={d.raucher === 'ab10'} /> ≥ 10 Zig./Tag</td></tr>
          </tbody>
        </table>
      </div>

      <div className="b1-fuss">
        <div>
          <h4>Fortsetzung Anamnese Sonstiges</h4>
          <div className="textbox">{an.sonstiges}</div>
        </div>
        <div>
          <h4>Entscheidung der Krankenkasse</h4>
          <div>Die Kosten der vorgesehenen systematischen PAR-Behandlung</div>
          <div className="b1-reihe">werden übernommen <X an={fall.kkEntscheidung === 'uebernommen'} /> werden nicht übernommen <X an={fall.kkEntscheidung === 'nicht_uebernommen'} /></div>
          <Unterschrift text={<>Datum, Unterschrift und Stempel der <b>Krankenkasse</b></>} />
        </div>
      </div>
    </Seite>
  )
}

// ---------------------------------------------------------------------------
// Blatt 2
// ---------------------------------------------------------------------------

function Blatt2Druck({ fall, einst }: { fall: ParFall; einst: Einstellungen }) {
  const b = initialBefund(fall)
  const lb = leistungsblock(fall)
  const zelle = (nr: string, n: number) => <tr><td>{nr}</td><td>{n || ''}</td></tr>
  return (
    <Seite titel={<h1>PARODONTALSTATUS <small>Blatt 2</small></h1>}>
      <div className="a4-kopf">
        <Versichertenfeld fall={fall} einst={einst} />
        <div className="a4-kopf-rechts">
          <div className="vom">vom <u>{datumDe(b.datum)}</u></div>
          <div className="zs-liste"><b>Zahnstatus (ZS)</b><br />1 = Fehlender Zahn<br />2 = nicht erhaltungswürdiger Zahn<br />3 = Krone<br />4 = Brückenpfeiler<br />5 = Ersatz<br />6 = Implantat</div>
        </div>
      </div>
      <div className="b2-chart"><Blatt2Chart befund={b} onChange={() => {}} readOnly /></div>
      <div className="b2-bemerkung"><h4>Bemerkungen:</h4><div>{fall.bemerkung}</div></div>
      <div className="b2-fuss">
        <div>
          <div className="b1-reihe"><h4>Leistungen</h4><X an={!fall.uebernahmefall} /> geplant <X an={fall.uebernahmefall} /> ab Behandlungseinstieg</div>
          <div className="lb-tabellen">
            <table className="lb"><thead><tr><th>Geb.-Nr.</th><th>Anzahl</th></tr></thead>
              <tbody>{zelle('4', lb['4'])}{zelle('ATG', lb.ATG)}{zelle('MHU', lb.MHU)}</tbody></table>
            <table className="lb"><thead><tr><th>Geb.-Nr.</th><th>Anzahl</th></tr></thead>
              <tbody>{zelle('AIT a', lb.AITa)}{zelle('AIT b', lb.AITb)}{zelle('BEV a', lb.BEVa)}</tbody></table>
          </div>
          <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Zahnarztes</b></>} />
        </div>
        <div>
          <h4>Gutachten</h4>
          <div className="b1-reihe"><X an={fall.gutachten === 'befuerwortet'} /> Gutachtlich befürwortet</div>
          <div className="b1-reihe"><X an={fall.gutachten === 'nicht_befuerwortet'} /> Gutachtlich nicht befürwortet<br />(Begründung auf gesondertem Blatt)</div>
          <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Gutachters</b></>} />
        </div>
      </div>
    </Seite>
  )
}

// ---------------------------------------------------------------------------
// Zusatzseite, 5d, 5e, MIT 8
// ---------------------------------------------------------------------------

function Linie({ label, wert }: { label: string; wert: ReactNode }) {
  return <div className="linie"><span>{label}</span><span className="linie-wert">{wert}</span></div>
}

function ZusatzDruck({ fall, einst }: { fall: ParFall; einst: Einstellungen }) {
  const z = fall.zusatz
  const v = z.vorherLeistungen
  return (
    <Seite titel={<h2>Informationen zum<br />Krankenkassenwechsel / Zahnarztwechsel<br /><span className="mono">PAR Zusatzseite</span></h2>}>
      <div className="a4-kopf"><Versichertenfeld fall={fall} einst={einst} /></div>
      <div className="zusatzseite">
        <Linie label="Antragsnummer" wert={fall.antrag.antragsnummer} />
        <Linie label="Krankenkassenwechsel / Zahnarztwechsel" wert={z.wechselText} />
        <Linie label="Antragsnummer vorherige Krankenkasse" wert={z.wechselAntragsnummerVorher} />
        <Linie label="Institutionskennzeichen vorherige Krankenkasse" wert={z.wechselIkVorher} />
        <h4>Leistungen (Blatt 2) vorherige Krankenkasse</h4>
        <Linie label="Anzahl Gebührennummer 4" wert={v['4'] || ''} />
        <Linie label="Anzahl Gebührennummer ATG" wert={v.ATG || ''} />
        <Linie label="Anzahl Gebührennummer MHU" wert={v.MHU || ''} />
        <Linie label="Anzahl Gebührennummer AITa" wert={v.AITa || ''} />
        <Linie label="Anzahl Gebührennummer AITb" wert={v.AITb || ''} />
        <Linie label="Anzahl Gebührennummer BEVa" wert={v.BEVa || ''} />
        <Linie label="Nummer der zuletzt erbrachten UPT" wert={z.vorherLetzteUpt || ''} />
      </div>
    </Seite>
  )
}

function F5dDruck({ fall, einst, diag }: { fall: ParFall; einst: Einstellungen; diag: DiagnoseErgebnis }) {
  const z = fall.zusatz
  const b = letzterBefund(fall)
  const sub = zaehneAus(subgingivalZaehne(b))
  const ersteUpt = fall.termine.filter((t) => t.art === 'upt').sort((a, c) => a.datum.localeCompare(c.datum))[0]
  return (
    <Seite titel={<h2>Antrag auf Verlängerung<br />der Unterstützenden Parodontitistherapie (UPT)<br />gemäß § 13 Abs. 4 PAR-Richtlinie</h2>}>
      <div className="a4-kopf"><Versichertenfeld fall={fall} einst={einst} /><Antragsbox fall={fall} art="UPT-Verlängerung" /></div>
      <div className="f5d">
        <div className="b1-reihe">Parodontalstatus vom: <u>{datumDe(initialBefund(fall).datum)}</u>
          <span className="rechts">Grad (Progression) nach PAR-Status: <X an={diag.grad === 'A'} /> A <X an={diag.grad === 'B'} /> B <X an={diag.grad === 'C'} /> C</span></div>
        <div className="b1-reihe">Datum der ersten UPT-Leistung: <u>{ersteUpt ? datumDe(ersteUpt.datum) : ''}</u></div>
        <p>An den folgenden Zähnen liegen noch behandlungsbedürftige Parodontien mit Sondierungstiefen ≥ 4 mm und Sondierungsbluten oder mit Sondierungstiefen ≥ 5 mm vor:</p>
        <div className="textbox">{sub.join(', ')}</div>
        <div className="b1-reihe"><X an={!z.verlaengerungUeber6} /> Es wird eine Verlängerung der UPT um den Regelzeitraum von 6 Monaten beantragt.</div>
        <div className="b1-reihe"><X an={z.verlaengerungUeber6} /> Es wird beantragt, den Verlängerungszeitraum über den Regelzeitraum von 6 Monaten hinaus
          auf insgesamt <u>{z.verlaengerungUeber6 ? z.verlaengerungMonateGesamt : '____'}</u> Monate festzusetzen. Dies wird wie folgt begründet:</div>
        <div className="textbox">{z.verlaengerungUeber6 ? z.verlaengerungBegruendung : ''}</div>
        <div className="drei-spalten">
          <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Zahnarztes</b></>} />
          <div><h4>Gutachten</h4><div><X an={fall.gutachten === 'befuerwortet'} /> Gutachtlich befürwortet</div><div><X an={fall.gutachten === 'nicht_befuerwortet'} /> Gutachtlich nicht befürwortet</div>
            <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Gutachters</b></>} /></div>
          <div><h4>Entscheidung der Krankenkasse</h4><div>Die Kosten für die Verlängerung der UPT</div>
            <div><X an={fall.kkEntscheidung === 'uebernommen'} /> werden übernommen</div><div><X an={fall.kkEntscheidung === 'nicht_uebernommen'} /> werden nicht übernommen</div>
            <Unterschrift text={<>Datum, Unterschrift und Stempel der <b>Krankenkasse</b></>} /></div>
        </div>
      </div>
    </Seite>
  )
}

function F5eDruck({ fall, einst }: { fall: ParFall; einst: Einstellungen }) {
  const z = fall.zusatz
  const ait = aitZaehne(initialBefund(fall))
  const cpt = z.par22aNarkoseOffen ? cptZaehne(initialBefund(fall)) : { ein: [], mehr: [] }
  const zeile = (nr: string, zaehne: string[] | null, anzahl: number | string) => (
    <tr><td>{nr}</td><td>{zaehne == null ? <span className="gestrichelt" /> : zaehne.join(', ')}</td><td>{anzahl || ''}</td></tr>
  )
  return (
    <Seite titel={<h2>Anzeige einer Behandlung von Parodontitis<br />bei anspruchsberechtigten Versicherten<br />nach § 22a SGB V<br />gemäß Abschnitt B V. Ziffer 2<br />der Behandlungsrichtlinie</h2>}>
      <div className="a4-kopf"><Versichertenfeld fall={fall} einst={einst} /></div>
      <div className="f5e">
        <h3>Begründung</h3>
        <div className="b1-reihe"><X an={z.par22aMundhygiene} /> Eingeschränkte oder nicht vorhandene Fähigkeit zur Aufrechterhaltung der Mundhygiene</div>
        <div className="b1-reihe"><X an={z.par22aKooperation} /> Eingeschränkte oder nicht vorhandene Kooperationsfähigkeit</div>
        <div className="b1-reihe"><X an={z.par22aNarkoseGeschlossen} /> Behandlung in Allgemeinnarkose notwendig - geschlossenes Vorgehen</div>
        <div className="b1-reihe"><X an={z.par22aNarkoseOffen} /> Ausnahmefall: Behandlung in Allgemeinnarkose notwendig - offenes Vorgehen an Zähnen mit ST ≥ 6 mm (an den Zähnen, bei denen ein offenes Vorgehen erforderlich ist, erfolgt dieses anstelle der AIT)</div>
        <h3>Folgende Leistungen werden angezeigt:</h3>
        <table className="f5e-tab">
          <thead><tr><th>Geb.-Nr.</th><th>Zahnangabe</th><th>Anzahl</th></tr></thead>
          <tbody>
            {zeile('4', null, 1)}
            {zeile('AIT a', ait.ein.filter((x) => !cpt.ein.includes(x)), ait.ein.filter((x) => !cpt.ein.includes(x)).length)}
            {zeile('AIT b', ait.mehr.filter((x) => !cpt.mehr.includes(x)), ait.mehr.filter((x) => !cpt.mehr.includes(x)).length)}
            {zeile('CPT a', cpt.ein, cpt.ein.length)}
            {zeile('CPT b', cpt.mehr, cpt.mehr.length)}
          </tbody>
        </table>
        <div className="zwei-spalten">
          <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Zahnarztes</b></>} />
          <Antragsbox fall={fall} art="§ 22a" />
        </div>
      </div>
    </Seite>
  )
}

function Mit8Druck({ fall, einst }: { fall: ParFall; einst: Einstellungen }) {
  const z = fall.zusatz
  const basis = befundFuer(fall, 'beva') ?? initialBefund(fall)
  const cpt = cptZaehne(basis)
  return (
    <Seite titel={null}>
      <div className="a4-kopf">
        <Versichertenfeld fall={fall} einst={einst} />
        <div className="antragsbox">
          <div><small>Mitteilungsnummer</small><span>{z.mitteilungsnummer}</span></div>
          <div><small>Mitteilungsnummer ursprüngliche Mitteilung</small><span></span></div>
          <div><small>Antragsnummer ursprünglicher Behandlungsplan</small><span>{fall.antrag.antragsnummer}</span></div>
          <div><small>Verarbeitungskennzeichen</small><span>{fall.antrag.verarbeitungskennzeichen}</span></div>
          <div className="antragsbox-fuss"><small>Datum Behandlungsplan <b>{datumDe(initialBefund(fall).datum)}</b></small><small>Aktenzeichen PVS <b>{fall.antrag.aktenzeichenPVS}</b></small><small>logische Version<br /><b className="mono">2.1.0</b></small></div>
        </div>
      </div>
      <div className="mit8">
        <h3>Mitteilung über eine chirurgische Therapie (offenes Vorgehen)<br />gemäß § 12 Abs. 1 der PAR-RL</h3>
        <p>Es werden weitere Maßnahmen im Rahmen der systematischen PAR-Therapie zum Parodontalstatus vom <u>{datumDe(initialBefund(fall).datum)}</u> notwendig.</p>
        <p>Überweisung an einen spezialisierten Zahnarzt zur Durchführung der CPT<br /><X an={z.cptUeberweisung} /> ja <X an={!z.cptUeberweisung} /> nein</p>
        <p>Folgende Leistungen werden angezeigt:</p>
        <table className="f5e-tab">
          <thead><tr><th>Geb.-Nr.</th><th>Zahnangabe</th></tr></thead>
          <tbody>
            <tr><td>CPT a</td><td>{cpt.ein.join(', ')}</td></tr>
            <tr><td>CPT b</td><td>{cpt.mehr.join(', ')}</td></tr>
          </tbody>
        </table>
        <div className="mit8-unterschrift"><Unterschrift text="Datum, Unterschrift und Stempel der Zahnärztin / des Zahnarztes" /></div>
      </div>
    </Seite>
  )
}

import type { Einstellungen, Plan, Rechnung, Zeile } from '../types'
import { euro } from '../engine/kb'
import { plzOrt } from '../stammdaten'

interface Props {
  plan: Plan
  einst: Einstellungen
  rechnung: Rechnung
}

const datum = (iso: string) => {
  if (!iso) return ''
  const [j, m, t] = iso.split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}

const Kasten = ({ an }: { an: boolean }) => <span className="ef2-kasten">{an ? '×' : ''}</span>

function Feld({ label, wert, klasse = '' }: { label: string; wert: string; klasse?: string }) {
  return (
    <div className={`ef2-feld ${klasse}`}>
      <span>{label}</span>
      <b>{wert || '\u00a0'}</b>
    </div>
  )
}

function Linien({ text, hoehe }: { text: string; hoehe: number }) {
  return <div className="ef2-linien" style={{ minHeight: hoehe }}>{text || '\u00a0'}</div>
}

function Kosten({ rechnung, laborwer }: { rechnung: Rechnung; laborwer: string }) {
  const block = (titel: string, zeilen: Zeile[], punkte: boolean) => zeilen.length > 0 && (
    <>
      <h3>{titel}</h3>
      <table className="ef2-kosten">
        <thead>
          <tr>
            <th>Nr.</th><th>Leistung</th><th className="r">Anz.</th>
            {punkte && <th className="r">Punkte</th>}<th className="r">Einzel</th><th className="r">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.id}>
              <td className="mono">{z.nr}</td>
              <td>{z.text}</td>
              <td className="r">{z.anzahl}</td>
              {punkte && <td className="r">{z.punkte ?? ''}</td>}
              <td className="r">{euro(z.einzel)}</td>
              <td className="r">{euro(z.summe)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
  return (
    <div className="ef2 ef2-folge">
      <p className="ef2-amt">Kostenaufstellung für die Praxis – nicht Teil des eFormulars 2</p>
      <p className="ef2-hinweis">Labor und Material gehen mit dem elektronischen Beleg an die KZV. Die Beträge sind voraussichtlich.</p>
      {block('Zahnärztliche Leistungen', rechnung.honorar, true)}
      {block(`Labor nach ${rechnung.belListe} (${laborwer})`, rechnung.labor, false)}
      {block('Material', rechnung.material, false)}
      <div className="ef2-summe">
        <div><span>Honorar</span><b>{euro(rechnung.summeHonorar)}</b></div>
        <div><span>Labor</span><b>{euro(rechnung.summeLabor)}</b></div>
        <div><span>Material</span><b>{euro(rechnung.summeMaterial)}</b></div>
        <div className="gesamt"><span>Kassenleistung</span><b>{euro(rechnung.gesamt)}</b></div>
      </div>
      {rechnung.privat.length > 0 && (
        <>
          {block('Privatanteil – Labor ohne BEL-II-Nummer', rechnung.privat, false)}
          <div className="ef2-summe">
            <div className="gesamt"><span>vom Patienten zu tragen</span><b>{euro(rechnung.summePrivat)}</b></div>
          </div>
        </>
      )}
    </div>
  )
}

/** eFormular 2, BMV-Z Anlage 14c, Version 2.1.0 */
function Formular({ plan, einst, rechnung }: Props) {
  const p = einst.praxis
  const pat = plan.patient
  const a = plan.angaben
  const bruch = a.art === 'kieferbruch'
  const name = [pat.name, pat.vorname].filter(Boolean).join(', ')
  const zeilen: (Zeile | null)[] = [...rechnung.honorar]
  while (zeilen.length < 6) zeilen.push(null)

  return (
    <div className="ef2">
      <p className="ef2-amt">Bundesmantelvertrag – Zahnärzte (BMV-Z)</p>
      <h1><b>eFormular 2:</b> Behandlungsplan für Kiefergelenkserkrankungen und Kieferbruch</h1>
      <p className="ef2-version">Version 2.1.0, gültig ab 01.04.2026</p>
      <div className="ef2-rahmen">
        <div className="ef2-stand">Stand: 17.12.2025</div>
        <div className="ef2-kopf">
          <div className="ef2-personal">
            <Feld label="Krankenkasse bzw. Kostenträger" wert={pat.kasse} />
            <div className="ef2-name">
              <Feld label="Name, Vorname des Versicherten" wert={name} />
              <Feld label="geb. am" wert={datum(pat.geburtsdatum)} klasse="ef2-geb" />
            </div>
            <div className="ef2-drei">
              <Feld label="Kostenträgerkennung" wert={pat.kassenNr} />
              <Feld label="Versicherten-Nr." wert={pat.versichertenNr} />
              <Feld label="Status" wert={pat.status} />
            </div>
            <div className="ef2-drei">
              <Feld label="Abrechnungs-Nr." wert={p.abrechnungsNr} />
              <Feld label="Zahnarzt-Nr." wert={p.zahnarztNr} />
              <Feld label="Datum" wert={datum(plan.datum)} />
            </div>
          </div>
          <div className="ef2-art">
            <b>Behandlungsplan für</b>
            <div><Kasten an={a.art === 'kiefergelenk'} /> Kiefergelenkserkrankung</div>
            <div><Kasten an={bruch} /> Kieferbruch</div>
          </div>
        </div>

        <div className="ef2-zeile">
          <span>Angaben über Ort, Zeit und Ursache sowie Art der Verletzung (nur bei Kieferbruch)</span>
          <span className="ef2-unfall">Unfall <Kasten an={a.unfall} /> ja <Kasten an={!a.unfall} /> nein</span>
        </div>
        <Linien text={bruch ? a.verletzung : ''} hoehe={18} />
        <div className="ef2-zeile"><span>Anamnese/Befunde/Diagnose (nur bei Kiefergelenkserkrankungen)</span></div>
        <Linien text={bruch ? '' : a.befund} hoehe={52} />

        <div className="ef2-zeile"><span>Vorgesehene Behandlung</span></div>
        <Linien text={[a.behandlung, plan.bemerkung].filter(Boolean).join('\n')} hoehe={52} />

        <div className="ef2-zeile">
          <span>Stationäre Behandlung</span>
          <span>Voraussichtliche Dauer: von {datum(a.von) || '______'} bis {datum(a.bis) || '______'}</span>
        </div>
        <div className="ef2-zeile ef2-wert"><span>Krankenhaus: {a.stationaer ? a.krankenhaus : ''}</span></div>

        <div className="ef2-leistungen">
          <div className="ef2-zeile"><b>Geplante Leistungen</b></div>
          <div className="ef2-ltabelle kopf">
            <span>BEMA-Nr.</span><span>Anz.</span><span>Interdentalräume (nur bei BEMA-Nr. K4)</span>
          </div>
          {zeilen.map((z, i) => (
            <div className="ef2-ltabelle" key={z?.id ?? `leer-${i}`}>
              <span>{z?.nr ?? ''}</span>
              <span>{z ? z.anzahl : ''}</span>
              <span>{z?.nr === 'K4' ? z.anzahl : ''}</span>
            </div>
          ))}
        </div>

        <div className="ef2-zeile ef2-entscheidung">
          <span>Entscheidung der Krankenkasse (nur bei Kiefergelenkserkrankung)</span>
          <span><Kasten an={false} /> nicht genehmigt <small>(Begründung ggf. auf besonderem Blatt)</small></span>
          <span><Kasten an={false} /> genehmigt</span>
        </div>

        <div className="ef2-fuss">
          <div className="ef2-meta">
            <Feld label="Antragsnummer" wert={a.antragsnummer} />
            <Feld label="Antragsnummer ursprünglicher Behandlungsplan" wert="" />
            <Feld label="Verarbeitungskennzeichen" wert="" />
            <Feld label="Aktenzeichen PVS" wert="" />
            <div className="ef2-seite">
              <Feld label="Seite" wert="1" />
              <Feld label="logische Version" wert="2 . 1 . 0" />
            </div>
          </div>
          <div className="ef2-stempel">
            <span>Datum, Unterschrift und Stempel der Krankenkasse</span>
          </div>
          <div className="ef2-stempel">
            <span>Datum, Unterschrift und Stempel des Zahnarztes</span>
            <b>{[p.name, p.zahnarzt, [p.strasse, plzOrt(p)].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</b>
          </div>
        </div>
      </div>
    </div>
  )
}

function UkpsBlatt({ plan, rechnung }: Props) {
  const pat = plan.patient
  const a = plan.angaben
  const name = [pat.name, pat.vorname].filter(Boolean).join(', ')
  return (
    <div className="ef2">
      <p className="ef2-amt">Bundesmantelvertrag – Zahnärzte (BMV-Z)</p>
      <h1>Unterkieferprotrusionsschiene bei obstruktiver Schlafapnoe</h1>
      <p className="ef2-hinweis">
        Kein eFormular 2 und kein Genehmigungsverfahren. Die Abrechnung geht elektronisch an die KZV.
        Veranlassung eines Vertragsarztes mit Zusatzbezeichnung Schlafmedizin: {a.schlafmedizin ? 'liegt vor' : 'fehlt'}.
      </p>
      <div className="ef2-rahmen">
        <div className="ef2-personal">
          <Feld label="Krankenkasse bzw. Kostenträger" wert={pat.kasse} />
          <div className="ef2-name">
            <Feld label="Name, Vorname des Versicherten" wert={name} />
            <Feld label="geb. am" wert={datum(pat.geburtsdatum)} klasse="ef2-geb" />
          </div>
        </div>
        <div className="ef2-zeile"><span>Anamnese/Befunde/Diagnose</span></div>
        <Linien text={a.befund} hoehe={36} />
        <div className="ef2-zeile"><span>Vorgesehene Behandlung</span></div>
        <Linien text={[a.behandlung, plan.bemerkung].filter(Boolean).join('\n')} hoehe={36} />
        {rechnung.honorar.length === 0 && rechnung.labor.length === 0 && (
          <p className="ef2-hinweis">Noch keine Leistung. Unter „Leistungen“ eine Abrechnungsroute wählen: lateral, oral oder Flosse.</p>
        )}
      </div>
    </div>
  )
}

export default function Dokument(props: Props) {
  const { plan, rechnung } = props
  const laborwer = plan.labor === 'praxis' ? 'Praxislabor' : `gewerbliches Labor${plan.fremdlabor.name ? ` ${plan.fremdlabor.name}` : ''}`
  const ukps = plan.angaben.art === 'ukps'
  return (
    <>
      {ukps ? <UkpsBlatt {...props} /> : <Formular {...props} />}
      <Kosten rechnung={rechnung} laborwer={laborwer} />
    </>
  )
}

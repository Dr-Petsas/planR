import type { Einstellungen, Plan, Rechnung, Zeile } from '../types'
import { ART_NAME } from '../data/katalog'
import { euro, pwText } from '../engine/kb'
import { FORMULAR_NAME } from '../engine/listen'
import { anschrift, patientName, plzOrt } from '../stammdaten'

interface Props {
  plan: Plan
  einst: Einstellungen
  rechnung: Rechnung
}

const datum = (iso: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '—')
const KASSENART = { primaer: 'Primärkasse', ersatz: 'Ersatzkasse' } as const

function Tabelle({ zeilen, mitPunkten }: { zeilen: Zeile[]; mitPunkten: boolean }) {
  return (
    <table className="kv-tabelle kv-leistung">
      <thead>
        <tr>
          <th>Nr.</th><th>Leistung</th><th className="r">Anz.</th>
          {mitPunkten && <th className="r">Punkte</th>}<th className="r">Einzel</th><th className="r">Betrag</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.id}>
            <td className="mono">{z.nr}</td>
            <td>{z.text}</td>
            <td className="r">{z.anzahl}</td>
            {mitPunkten && <td className="r">{z.punkte ?? ''}</td>}
            <td className="r">{euro(z.einzel)}</td>
            <td className="r">{euro(z.summe)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const Kreuz = ({ an, text }: { an: boolean; text: string }) => (
  <div><b className="kv-kreuz">{an ? '×' : ''}</b>{text}</div>
)

export default function Dokument({ plan, einst, rechnung }: Props) {
  const p = einst.praxis
  const pat = plan.patient
  const a = plan.angaben
  const bruch = a.art === 'kieferbruch'
  const leer = !rechnung.honorar.length && !rechnung.labor.length && !rechnung.material.length

  return (
    <div className="kv-blatt">
      <div className="kv-kopf">
        <div className="kv-praxis">
          <div className="kv-praxisname">{p.name}</div>
          {p.zahnarzt && <div>{p.zahnarzt}</div>}
          <div>{[p.strasse, plzOrt(p)].filter(Boolean).join(' · ')}</div>
          <div>{[p.zahnarztNr && `ZA-Nr. ${p.zahnarztNr}`, p.abrechnungsNr && `Abr.-Nr. ${p.abrechnungsNr}`].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="kv-meta">
        <div><span>Versicherte/r</span>{patientName(pat) || '—'}</div>
        <div><span>geboren</span>{datum(pat.geburtsdatum)}</div>
        {anschrift(pat) && <div><span>Anschrift</span>{anschrift(pat)}</div>}
        <div><span>Krankenkasse</span>{[pat.kasse, KASSENART[pat.kassenart]].filter(Boolean).join(' · ') || '—'}</div>
        {pat.versichertenNr && <div><span>Vers.-Nr.</span>{pat.versichertenNr}</div>}
        <div><span>Nr.</span>{plan.nummer}{a.antragsnummer ? ` · Antrag ${a.antragsnummer}` : ''}</div>
        <div><span>Datum</span>{datum(plan.datum)}</div>
      </div>

      <h1>Behandlungsplan {ART_NAME[a.art]}</h1>
      <p className="kv-untertitel">{FORMULAR_NAME} · Abrechnung über die KZV (BEMA Teil 2)</p>

      <div className="kv-felder">
        <Kreuz an={a.art === 'kiefergelenk'} text="Kiefergelenkserkrankung" />
        <Kreuz an={bruch} text="Kieferbruch" />
        <Kreuz an={a.unfall} text="Unfall / Unfallfolgen" />
        <Kreuz an={a.stationaer} text={`stationär${a.stationaer && a.krankenhaus ? `: ${a.krankenhaus}` : ''}${a.stationaer && a.von ? ` (${datum(a.von)}–${datum(a.bis)})` : ''}`} />
      </div>
      {bruch
        ? <p><b>Ort, Zeit, Ursache und Art der Verletzung:</b> {a.verletzung || '—'}</p>
        : <p><b>Anamnese, Befunde, Diagnose:</b> {a.befund || '—'}</p>}
      {a.behandlung && <p><b>Vorgesehene Behandlung:</b> {a.behandlung}</p>}

      {leer ? (
        <p className="leer">Noch keine Leistung geplant.</p>
      ) : (
        <>
          {rechnung.honorar.length > 0 && (
            <>
              <h2>Zahnärztliche Leistungen</h2>
              <Tabelle zeilen={rechnung.honorar} mitPunkten />
            </>
          )}
          {rechnung.labor.length > 0 && (
            <>
              <h2 style={{ marginTop: 12 }}>Labor nach {rechnung.belListe} ({plan.labor === 'praxis' ? 'Praxislabor' : 'gewerbliches Labor'})</h2>
              <Tabelle zeilen={rechnung.labor} mitPunkten={false} />
            </>
          )}
          {rechnung.material.length > 0 && (
            <>
              <h2 style={{ marginTop: 12 }}>Material</h2>
              <Tabelle zeilen={rechnung.material} mitPunkten={false} />
            </>
          )}
          <div className="kv-summe">
            <div><span>Zahnärztliches Honorar (Punktwert KB {pwText(rechnung.punktwertKb)} €)</span><b>{euro(rechnung.summeHonorar)}</b></div>
            <div><span>Laborkosten</span><b>{euro(rechnung.summeLabor)}</b></div>
            <div><span>Materialkosten</span><b>{euro(rechnung.summeMaterial)}</b></div>
            <div className="gesamt"><span>voraussichtliche Kosten (Kassenleistung)</span><b>{euro(rechnung.gesamt)}</b></div>
          </div>
        </>
      )}

      {plan.bemerkung && <p className="kv-bemerkung">{plan.bemerkung}</p>}

      <div className="kv-hinweise">
        {rechnung.genehmigungspflichtig && !a.genehmigungsverzicht && (
          <p>Die Leistungen K1–K4 bedürfen der Genehmigung der Krankenkasse; der Plan wird vor Behandlungsbeginn elektronisch übermittelt.</p>
        )}
        {bruch && <p>Der Behandlungsplan wird der Krankenkasse vor Behandlungsbeginn angezeigt; eine Genehmigung ist nicht erforderlich.</p>}
        <p>Die Kosten trägt die Krankenkasse; abgerechnet wird über die Kassenzahnärztliche Vereinigung. Die Beträge sind voraussichtlich.</p>
      </div>
    </div>
  )
}

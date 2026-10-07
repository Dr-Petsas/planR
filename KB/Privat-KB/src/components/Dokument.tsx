import type { Einstellungen, Plan, Rechnung, Zeile } from '../types'
import { euro, faktorText } from '../engine/kb'
import { anschrift, patientName, plzOrt } from '../stammdaten'

interface Props {
  plan: Plan
  einst: Einstellungen
  rechnung: Rechnung
}

const datum = (iso: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '—')

function gueltigBis(iso: string, monate: number) {
  const d = iso ? new Date(iso) : new Date()
  d.setMonth(d.getMonth() + monate)
  return d.toLocaleDateString('de-DE')
}

function Kopf({ plan, einst }: Omit<Props, 'rechnung'>) {
  const p = einst.praxis
  const pat = plan.patient
  return (
    <>
      <div className="kv-kopf">
        <div className="kv-praxis">
          <div className="kv-praxisname">{p.name}</div>
          {p.zahnarzt && <div>{p.zahnarzt}</div>}
          <div>{[p.strasse, plzOrt(p)].filter(Boolean).join(' · ')}</div>
          <div>{[p.telefon, p.email].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="kv-meta">
        <div><span>Patient/in</span>{patientName(pat) || '—'}</div>
        <div><span>geboren</span>{datum(pat.geburtsdatum)}</div>
        {anschrift(pat) && <div><span>Anschrift</span>{anschrift(pat)}</div>}
        {pat.kasse && <div><span>Versicherung</span>{pat.kasse}</div>}
        <div><span>Nr.</span>{plan.nummer}</div>
        <div><span>Datum</span>{datum(plan.datum)}</div>
      </div>
    </>
  )
}

const Unterschriften = () => (
  <div className="kv-unterschriften">
    <div><span />Ort, Datum, Unterschrift Patient/in</div>
    <div><span />Unterschrift Zahnärztin / Zahnarzt</div>
  </div>
)

function Tabelle({ zeilen, mitFaktor }: { zeilen: Zeile[]; mitFaktor: boolean }) {
  return (
    <table className="kv-tabelle kv-leistung">
      <thead>
        <tr>
          <th>Nr.</th><th>Leistung</th><th className="r">Anz.</th>
          {mitFaktor && <th className="r">Faktor</th>}<th className="r">Einzel</th><th className="r">Betrag</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.id}>
            <td className="mono">{z.nr}</td>
            <td>{z.text}</td>
            <td className="r">{z.anzahl}</td>
            {mitFaktor && <td className="r">{z.faktor ? faktorText(z.faktor) : ''}</td>}
            <td className="r">{euro(z.einzel)}</td>
            <td className="r">{euro(z.summe)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Dokument({ plan, einst, rechnung }: Props) {
  const leer = !rechnung.honorar.length && !rechnung.labor.length
  return (
    <>
      <div className="kv-blatt">
        <Kopf plan={plan} einst={einst} />
        <h1>Kostenvoranschlag Schienentherapie</h1>
        <p className="kv-untertitel">Aufbissbehelfe und Funktionsdiagnostik nach der Gebührenordnung für Zahnärzte (GOZ)</p>
        {plan.diagnose && <p><b>Befund / Diagnose:</b> {plan.diagnose}</p>}

        {leer ? (
          <p className="leer">Noch keine Leistung geplant.</p>
        ) : (
          <>
            {rechnung.honorar.length > 0 && (<><h2>Zahnärztliches Honorar</h2><Tabelle zeilen={rechnung.honorar} mitFaktor /></>)}
            {rechnung.labor.length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>Material- und Laborkosten{einst.laborName ? ` (${einst.laborName})` : ''}</h2>
                <Tabelle zeilen={rechnung.labor} mitFaktor={false} />
              </>
            )}
            <div className="kv-summe">
              <div><span>Honorar nach GOZ</span><b>{euro(rechnung.summeHonorar)}</b></div>
              <div><span>Material- und Laborkosten (§ 9 GOZ)</span><b>{euro(rechnung.summeLabor)}</b></div>
              <div className="gesamt"><span>voraussichtliche Gesamtkosten</span><b>{euro(rechnung.gesamt)}</b></div>
            </div>
          </>
        )}

        {plan.bemerkung && <p className="kv-bemerkung">{plan.bemerkung}</p>}

        <div className="kv-hinweise">
          <p>
            Die Beträge sind voraussichtlich; das endgültige Honorar richtet sich nach dem tatsächlichen Aufwand.
            Material- und Laborkosten werden nach tatsächlichem Anfall berechnet.
          </p>
          {rechnung.begruendung.length > 0 && <p>Für Faktoren über 2,3 erhalten Sie die Begründung mit der Rechnung (§ 10 Abs. 3 GOZ).</p>}
          {rechnung.vereinbarung2.length > 0 && <p>Für Faktoren über 3,5 gilt die gesonderte Vereinbarung nach § 2 GOZ (Blatt 2).</p>}
          <p>
            Gesetzlich Versicherte: Die Leistungen sind privat zu tragen; sie werden nur nach schriftlicher Vereinbarung vor
            Behandlungsbeginn erbracht (§ 8 Abs. 7 BMV-Z). Ob und in welchem Umfang eine private Versicherung oder Beihilfe
            erstattet, richtet sich nach Ihrem Vertrag.
          </p>
          <p>Dieser Kostenvoranschlag gilt bis {gueltigBis(plan.datum, einst.gueltigMonate)}.</p>
        </div>
        <Unterschriften />
      </div>

      {rechnung.vereinbarung2.length > 0 && (
        <div className="kv-blatt kv-blatt-folge">
          <Kopf plan={plan} einst={einst} />
          <h1>Vereinbarung nach § 2 Abs. 1 und 2 GOZ</h1>
          <p className="kv-untertitel">abweichende Höhe der Vergütung</p>
          <Tabelle zeilen={rechnung.vereinbarung2} mitFaktor />
          <p className="kv-erstattung">
            Eine Erstattung der Vergütung durch Erstattungsstellen ist möglicherweise nicht in vollem Umfang gewährleistet.
          </p>
          <Unterschriften />
        </div>
      )}
    </>
  )
}

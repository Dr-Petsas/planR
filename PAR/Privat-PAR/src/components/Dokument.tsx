import type { Einstellungen, Phase, Plan, Rechnung, Zeile } from '../types'
import { PHASE_NAME, VARIANTE_NAME } from '../data/katalog'
import { euro, faktorText } from '../engine/par'
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

function Tabelle({ zeilen }: { zeilen: Zeile[] }) {
  return (
    <table className="kv-tabelle kv-leistung">
      <thead>
        <tr><th>Nr.</th><th>Leistung</th><th className="r">Anz.</th><th className="r">Faktor</th><th className="r">Einzel</th><th className="r">Betrag</th></tr>
      </thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.id}>
            <td className="mono">{z.nr}</td>
            <td>{z.text}{z.analog && <span className="analog-text">{z.analog}</span>}</td>
            <td className="r">{z.anzahl}</td>
            <td className="r">{z.nr === 'Mat.' ? '' : faktorText(z.faktor)}</td>
            <td className="r">{euro(z.einzel)}</td>
            <td className="r">{euro(z.summe)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Dokument({ plan, einst, rechnung }: Props) {
  const phasen = (Object.keys(PHASE_NAME) as Phase[]).filter((p) => rechnung.zeilen.some((z) => z.phase === p))
  return (
    <>
      <div className="kv-blatt">
        <Kopf plan={plan} einst={einst} />
        <h1>Heil- und Kostenplan Parodontitistherapie</h1>
        <p className="kv-untertitel">
          nach der Gebührenordnung für Zahnärzte (GOZ) · Stadium {plan.stadium}, Grad {plan.grad} · Analogbewertung {VARIANTE_NAME[plan.variante]}
        </p>
        {plan.diagnose && <p><b>Befund / Diagnose:</b> {plan.diagnose}</p>}
        {plan.fehlend.length > 0 && <p><b>Fehlende Zähne:</b> {[...plan.fehlend].sort().join(', ')}{plan.cpt.length > 0 && <> · <b>Chirurgische Therapie:</b> {[...plan.cpt].sort().join(', ')}</>}</p>}

        {phasen.map((ph) => (
          <div key={ph}>
            <h2>{PHASE_NAME[ph]}</h2>
            <Tabelle zeilen={rechnung.zeilen.filter((z) => z.phase === ph)} />
          </div>
        ))}

        <div className="kv-summe">
          {phasen.map((ph) => <div key={ph}><span>{PHASE_NAME[ph]}</span><b>{euro(rechnung.summen[ph])}</b></div>)}
          <div className="gesamt"><span>voraussichtliche Gesamtkosten</span><b>{euro(rechnung.gesamt)}</b></div>
        </div>

        {plan.bemerkung && <p className="kv-bemerkung">{plan.bemerkung}</p>}

        <div className="kv-hinweise">
          <p>
            Die Beträge sind voraussichtlich; das endgültige Honorar richtet sich nach dem tatsächlichen Aufwand und dem
            Behandlungsverlauf. Die UPT ist mit {rechnung.uptSitzungen} Sitzungen geplant; Material wird nach Anfall berechnet.
          </p>
          <p>
            Mit „a“ gekennzeichnete Leistungen sind in der GOZ nicht beschrieben und werden nach § 6 Abs. 1 GOZ entsprechend
            einer gleichwertigen Leistung berechnet (Angabe „entsprechend GOZ …“).
          </p>
          {plan.variante === 'aktuell' && (
            <p>Die Analogbewertung folgt der Neubewertung der Bundeszahnärztekammer 2026; private Versicherungen und Beihilfe erstatten unter Umständen nur nach den Beschlüssen des Beratungsforums.</p>
          )}
          {rechnung.begruendung.length > 0 && <p>Für Faktoren über 2,3 erhalten Sie die Begründung mit der Rechnung (§ 10 Abs. 3 GOZ).</p>}
          {rechnung.vereinbarung2.length > 0 && <p>Für Faktoren über 3,5 gilt die gesonderte Vereinbarung nach § 2 GOZ (Folgeblatt).</p>}
          {plan.gkv && (
            <p>
              Vereinbarung nach § 8 Abs. 7 BMV-Z: Ich wünsche ausdrücklich die Behandlung als Privatleistung nach der GOZ, obwohl
              ich gesetzlich versichert bin, und trage die Kosten selbst. Über die Leistungen meiner Krankenkasse
              (Parodontitistherapie nach BEMA Teil 4) wurde ich aufgeklärt.
            </p>
          )}
          <p>Dieser Heil- und Kostenplan gilt bis {gueltigBis(plan.datum, einst.gueltigMonate)}.</p>
        </div>
        <Unterschriften />
      </div>

      {rechnung.vereinbarung2.length > 0 && (
        <div className="kv-blatt kv-blatt-folge">
          <Kopf plan={plan} einst={einst} />
          <h1>Vereinbarung nach § 2 Abs. 1 und 2 GOZ</h1>
          <p className="kv-untertitel">abweichende Höhe der Vergütung</p>
          <Tabelle zeilen={rechnung.vereinbarung2} />
          <p className="kv-erstattung">
            Eine Erstattung der Vergütung durch Erstattungsstellen ist möglicherweise nicht in vollem Umfang gewährleistet.
          </p>
          <Unterschriften />
        </div>
      )}
    </>
  )
}

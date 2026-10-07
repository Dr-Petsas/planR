import { Fragment } from 'react'
import type { Einstellungen, Plan, Rechnung } from '../types'
import { euro, faktorText } from '../engine/mkv'
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
        <div><span>Krankenkasse</span>{pat.kasse || '—'}</div>
        <div><span>Versicherten-Nr.</span>{pat.versichertenNr || '—'}</div>
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

export default function Vereinbarung({ plan, einst, rechnung }: Props) {
  const mkv = rechnung.zaehne.filter((z) => z.kasse)
  const privat = rechnung.zaehne.filter((z) => !z.kasse)
  const privatSumme = privat.reduce((s, z) => s + z.privat, 0)

  return (
    <>
      <div className="kv-blatt">
        <Kopf plan={plan} einst={einst} />
        <h1>Mehrkostenvereinbarung für Füllungen</h1>
        <p className="kv-untertitel">nach § 28 Abs. 2 SGB V</p>

        <p>
          Als gesetzlich Versicherte/r haben Sie Anspruch auf eine zuzahlungsfreie Füllung als Kassenleistung. Sie wünschen
          statt dessen die unten beschriebene aufwendigere Versorgung. Ihre Krankenkasse übernimmt die Kosten der
          vergleichbaren preisgünstigsten plastischen Füllung (BEMA 13a–d); diesen Betrag rechnen wir direkt mit der Kasse
          ab. Die darüber hinausgehenden Mehrkosten tragen Sie selbst; sie werden nach der Gebührenordnung für Zahnärzte
          (GOZ) berechnet.
        </p>

        {mkv.length > 0 ? (
          <table className="kv-tabelle kv-zaehne">
            <thead>
              <tr>
                <th>Zahn</th><th>Nr.</th><th>Leistung</th><th className="r">Faktor</th>
                <th className="r">Honorar</th><th className="r">Kasse</th><th className="r">Mehrkosten</th>
              </tr>
            </thead>
            <tbody>
              {mkv.map((z) => (
                <Fragment key={z.zahn}>
                  {z.zeilen.map((x, i) => (
                    <tr key={`${z.zahn}-${x.nr}-${i}`}>
                      <td>{i === 0 ? z.zahn : ''}</td>
                      <td className="mono">{x.nr}</td>
                      <td>{i === 0 ? z.titel : x.text}</td>
                      <td className="r">{x.faktor ? faktorText(x.faktor) : ''}</td>
                      <td className="r">{euro(x.summe)}</td>
                      <td className="r">{i === 0 ? euro(z.kassenanteil) : ''}</td>
                      <td className="r">{i === z.zeilen.length - 1 ? euro(z.mehrkosten) : ''}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {rechnung.begleit.map((b) => (
                <tr key={b.nr}>
                  <td />
                  <td className="mono">{b.nr}</td>
                  <td>{b.text}</td>
                  <td className="r">{b.faktor ? faktorText(b.faktor) : ''}</td>
                  <td className="r">{euro(b.summe)}</td>
                  <td className="r">—</td>
                  <td className="r">{euro(b.summe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="leer">Noch keine mehrkostenfähige Füllung geplant.</p>
        )}

        {mkv.length > 0 && (
          <div className="kv-summe">
            <div><span>voraussichtliches Honorar nach GOZ (inkl. Labor)</span><b>{euro(rechnung.privat - privatSumme)}</b></div>
            <div><span>abzüglich Kassenanteil</span><b>− {euro(rechnung.kassenanteil)}</b></div>
            <div className="gesamt"><span>voraussichtliche Mehrkosten</span><b>{euro(rechnung.mehrkosten - privatSumme)}</b></div>
          </div>
        )}

        {privat.length > 0 && (
          <div className="kv-vereinbarung">
            <h2>Private Vereinbarung nach § 8 Abs. 7 BMV-Z</h2>
            <p>
              Für {privat.map((z) => `Zahn ${z.zahn}`).join(', ')} wünschen Sie den Austausch einer intakten Füllung. Dafür gilt
              die Mehrkostenregelung nicht (§ 28 Abs. 2 Satz 5 SGB V); die Leistung ist vollständig privat zu tragen:{' '}
              <b>{euro(privatSumme)}</b>.
            </p>
          </div>
        )}

        {plan.bemerkung && <p className="kv-bemerkung">{plan.bemerkung}</p>}

        <div className="kv-hinweise">
          <p>
            Die Beträge sind voraussichtlich; das endgültige Honorar richtet sich nach dem tatsächlichen Aufwand.
            Laborkosten werden nach tatsächlichem Anfall berechnet.
          </p>
          {rechnung.vereinbarung2.length > 0 && <p>Für Faktoren über 3,5 gilt die gesonderte Vereinbarung nach § 2 GOZ (Blatt 2).</p>}
          <p>Diese Vereinbarung gilt bis {gueltigBis(plan.datum, einst.gueltigMonate)} und muss vor Behandlungsbeginn unterschrieben vorliegen.</p>
        </div>
        <Unterschriften />
      </div>

      {rechnung.vereinbarung2.length > 0 && (
        <div className="kv-blatt kv-blatt-folge">
          <Kopf plan={plan} einst={einst} />
          <h1>Vereinbarung nach § 2 Abs. 1 und 2 GOZ</h1>
          <p className="kv-untertitel">abweichende Höhe der Vergütung</p>
          <table className="kv-tabelle">
            <thead>
              <tr><th>Zahn</th><th>Nr.</th><th>Leistung</th><th className="r">Faktor</th><th className="r">Betrag</th></tr>
            </thead>
            <tbody>
              {rechnung.vereinbarung2.map((x, i) => (
                <tr key={`${x.nr}-${i}`}>
                  <td>{x.zahn ?? ''}</td>
                  <td className="mono">{x.nr}</td>
                  <td>{x.text}</td>
                  <td className="r">{x.faktor ? faktorText(x.faktor) : ''}</td>
                  <td className="r">{euro(x.summe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="kv-erstattung">
            Eine Erstattung der Vergütung durch Erstattungsstellen ist möglicherweise nicht in vollem Umfang gewährleistet.
          </p>
          <Unterschriften />
        </div>
      )}
    </>
  )
}

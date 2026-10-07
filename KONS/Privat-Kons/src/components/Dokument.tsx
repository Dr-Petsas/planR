import { Fragment } from 'react'
import type { Einstellungen, Plan, Rechnung, Vereinbarungsart, Zeile } from '../types'
import { euro, faktorText } from '../engine/kons'
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

const TITEL: Record<Vereinbarungsart, { h1: string; unter: string; text: string }> = {
  pkv: {
    h1: 'Kostenvoranschlag',
    unter: 'konservierende Behandlung nach der Gebührenordnung für Zahnärzte (GOZ)',
    text: 'Für die geplante Behandlung rechnen wir voraussichtlich mit den folgenden Kosten. Bitte reichen Sie den Kostenvoranschlag vor Behandlungsbeginn bei Ihrer Versicherung bzw. Beihilfestelle ein.',
  },
  gkvPrivat: {
    h1: 'Vereinbarung einer privaten Behandlung',
    unter: 'nach § 8 Abs. 7 BMV-Z',
    text: 'Ich bin gesetzlich versichert und wurde darüber aufgeklärt, dass mir für die nachstehend aufgeführte Behandlung eine Versorgung als Kassenleistung zusteht. Ich wünsche ausdrücklich, privat nach der GOZ behandelt zu werden. Mir ist bekannt, dass meine Krankenkasse für diese Behandlung keine Kosten übernimmt und ich die Vergütung selbst trage.',
  },
  gkvZusatz: {
    h1: 'Vereinbarung über private Zusatzleistungen',
    unter: 'nach § 8 Abs. 7 BMV-Z',
    text: 'Die Grundbehandlung erfolgt als Kassenleistung und wird mit Ihrer Krankenkasse abgerechnet. Zusätzlich wünschen Sie die folgenden Leistungen. Sie sind nicht Bestandteil der vertragszahnärztlichen Versorgung, werden privat nach der GOZ berechnet und von Ihnen selbst getragen.',
  },
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
        <div><span>{plan.vereinbarung === 'pkv' ? 'Versicherung' : 'Krankenkasse'}</span>{pat.kasse || '—'}</div>
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

function Zeilen({ zeilen, zahnTitel }: { zeilen: Zeile[]; zahnTitel?: string }) {
  return (
    <>
      {zeilen.map((x, i) => (
        <tr key={`${x.zahn}-${x.nr}-${i}`}>
          <td>{i === 0 ? x.zahn ?? '' : ''}</td>
          <td className="mono">{x.nr}</td>
          <td>{i === 0 && zahnTitel ? <><b>{zahnTitel}</b><br />{x.text}</> : x.text}</td>
          <td className="r">{x.anzahl}</td>
          <td className="r">{x.faktor ? faktorText(x.faktor) : ''}</td>
          <td className="r">{euro(x.summe)}</td>
        </tr>
      ))}
    </>
  )
}

export default function Dokument({ plan, einst, rechnung }: Props) {
  const t = TITEL[plan.vereinbarung]
  const zaehne = rechnung.zaehne.filter((z) => !z.ausgeschlossen && z.zeilen.length)
  const leer = !zaehne.length && !rechnung.begleit.length && !rechnung.frei.length

  return (
    <>
      <div className="kv-blatt">
        <Kopf plan={plan} einst={einst} />
        <h1>{t.h1}</h1>
        <p className="kv-untertitel">{t.unter}</p>
        <p>{t.text}</p>

        {leer ? (
          <p className="leer">Noch keine Leistungen geplant.</p>
        ) : (
          <table className="kv-tabelle kv-zaehne">
            <thead>
              <tr><th>Zahn</th><th>Nr.</th><th>Leistung</th><th className="r">Anz.</th><th className="r">Faktor</th><th className="r">Betrag</th></tr>
            </thead>
            <tbody>
              {zaehne.map((z) => <Fragment key={z.zahn}><Zeilen zeilen={z.zeilen} zahnTitel={z.titel} /></Fragment>)}
              {rechnung.begleit.length > 0 && <Zeilen zeilen={rechnung.begleit} zahnTitel="Je Kieferhälfte, Kiefer und Behandlungstag" />}
              {rechnung.frei.length > 0 && <Zeilen zeilen={rechnung.frei} zahnTitel="Weitere Leistungen" />}
            </tbody>
          </table>
        )}

        {!leer && (
          <div className="kv-summe">
            <div className="gesamt"><span>voraussichtlicher Gesamtbetrag</span><b>{euro(rechnung.summe)}</b></div>
          </div>
        )}

        {plan.bemerkung && <p className="kv-bemerkung">{plan.bemerkung}</p>}

        <div className="kv-hinweise">
          <p>Die Beträge sind voraussichtlich; das endgültige Honorar richtet sich nach dem tatsächlichen Aufwand. Material und Laborkosten werden nach tatsächlichem Anfall berechnet.</p>
          {rechnung.hinweise.map((h) => <p key={h}>{h}</p>)}
          {rechnung.vereinbarung2.length > 0 && <p>Für Faktoren über 3,5 gilt die gesonderte Vereinbarung nach § 2 GOZ (Blatt 2).</p>}
          <p>Gültig bis {gueltigBis(plan.datum, einst.gueltigMonate)}.{plan.vereinbarung !== 'pkv' && ' Die Vereinbarung muss vor Behandlungsbeginn unterschrieben vorliegen.'}</p>
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
                  <td>{x.zahn ?? ''}</td><td className="mono">{x.nr}</td><td>{x.text}</td>
                  <td className="r">{x.faktor ? faktorText(x.faktor) : ''}</td><td className="r">{euro(x.einzel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="kv-erstattung">Eine Erstattung der Vergütung durch Erstattungsstellen ist möglicherweise nicht in vollem Umfang gewährleistet.</p>
          <Unterschriften />
        </div>
      )}
    </>
  )
}

import type { Einstellungen, Plan } from '../types'
import { plzOrt, praxisZeile } from '../stammdaten'
import { BEB_NAME, euro, type Kalkulation, type Zeile } from '../engine/berechnung'
import { ALLE_ZAEHNE, BEFUND_KUERZEL, PLANUNG_KUERZEL } from '../engine/zahnschema'

interface Props {
  plan: Plan
  einst: Einstellungen
  kalk: Kalkulation
}

const datum = (iso: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('de-DE') : '')
const faktorText = (f?: number) => (f ?? 0).toFixed(1).replace('.', ',')

function gueltigBis(iso: string, monate: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setMonth(d.getMonth() + monate)
  return d.toLocaleDateString('de-DE')
}

export function Kostenvoranschlag({ plan, einst, kalk }: Props) {
  const { praxis, patient } = { praxis: einst.praxis, patient: plan.patient }
  const versorgt = ALLE_ZAEHNE.filter((z) => plan.zaehne[z]?.TP || plan.zaehne[z]?.B)
  const begruendungen = kalk.honorar.filter((z) => z.begruendung)

  const zeilen = (liste: Zeile[], goz: boolean) => liste.map((z) => (
    <tr key={z.id}>
      <td className="mono">{goz ? z.nr : z.ebene === 'MAT' ? '' : z.eigen ?? z.nr}</td>
      <td>{z.zahn}</td>
      <td>{z.text}</td>
      <td className="r">{z.anzahl.toLocaleString('de-DE')}</td>
      {goz && <td className="r">{faktorText(z.faktor)}</td>}
      <td className="r">{euro(z.einzel)}</td>
      <td className="r">{euro(z.betrag)}</td>
    </tr>
  ))

  return (
    <article className="kv-blatt">
      <header className="kv-kopf">
        <div className="kv-praxis">
          <div className="kv-praxisname">{praxis.name || 'Zahnarztpraxis'}</div>
          {praxis.zahnarzt && <div>{praxis.zahnarzt}</div>}
          <div>{[praxis.strasse, plzOrt(praxis)].filter(Boolean).join(' · ')}</div>
          <div>{[praxis.telefon && `Tel. ${praxis.telefon}`, praxis.email].filter(Boolean).join(' · ')}</div>
        </div>
      </header>

      <div className="kv-adresse">
        <div className="kv-absender">{praxisZeile(praxis)}</div>
        <div>{patient.anrede}</div>
        <div>{[patient.vorname, patient.name].filter(Boolean).join(' ') || '(Patient)'}</div>
        <div>{patient.strasse}</div>
        <div>{plzOrt(patient)}</div>
      </div>

      <div className="kv-meta">
        <div><span>Datum</span>{datum(plan.datum)}</div>
        <div><span>Nummer</span>{plan.nummer}</div>
        {patient.geburtsdatum && <div><span>geb. am</span>{datum(patient.geburtsdatum)}</div>}
        <div><span>gültig bis</span>{gueltigBis(plan.datum, einst.gueltigMonate)}</div>
      </div>

      <h1>Kostenvoranschlag Zahnersatz</h1>
      <p className="kv-untertitel">Privatbehandlung nach der Gebührenordnung für Zahnärzte (GOZ)</p>

      <p>
        {patient.anrede ? `Guten Tag ${patient.anrede} ${patient.name},` : 'Sehr geehrte Patientin, sehr geehrter Patient,'}
        <br />
        für die besprochene Versorgung erhalten Sie nachfolgend die voraussichtlichen Kosten. Die Behandlung erfolgt als Privatleistung.
      </p>

      {versorgt.length > 0 && (
        <section>
          <h2>Befund und geplante Versorgung</h2>
          <table className="kv-tabelle kv-zaehne">
            <thead><tr><th>Zahn</th><th>Befund</th><th>Geplante Versorgung</th></tr></thead>
            <tbody>
              {versorgt.map((z) => {
                const b = plan.zaehne[z]?.B ?? ''
                const tp = plan.zaehne[z]?.TP ?? ''
                return (
                  <tr key={z}>
                    <td className="mono">{z}</td>
                    <td>{b ? BEFUND_KUERZEL[b] ?? b : '–'}</td>
                    <td>{tp ? PLANUNG_KUERZEL[tp] ?? tp : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2>1. Zahnärztliches Honorar</h2>
        <table className="kv-tabelle">
          <thead><tr><th>GOZ</th><th>Zahn</th><th>Leistung</th><th className="r">Anz.</th><th className="r">Faktor</th><th className="r">Einzel</th><th className="r">Betrag</th></tr></thead>
          <tbody>{zeilen(kalk.honorar, true)}</tbody>
          <tfoot><tr><td colSpan={6}>Summe Honorar</td><td className="r">{euro(kalk.summeHonorar)}</td></tr></tfoot>
        </table>
      </section>

      {kalk.labor.length > 0 && (
        <section>
          <h2>2. Zahntechnische Leistungen (geschätzt)</h2>
          <table className="kv-tabelle">
            <thead><tr><th>BEB</th><th>Zahn</th><th>Leistung</th><th className="r">Anz.</th><th className="r">Einzel</th><th className="r">Betrag</th></tr></thead>
            <tbody>{zeilen(kalk.labor, false)}</tbody>
            <tfoot>
              <tr><td colSpan={5}>Summe Labor netto</td><td className="r">{euro(kalk.summeLaborNetto)}</td></tr>
              <tr><td colSpan={5}>zzgl. {einst.mwst} % MwSt.</td><td className="r">{euro(kalk.mwst)}</td></tr>
            </tfoot>
          </table>
        </section>
      )}

      {kalk.material.length > 0 && (
        <section>
          <h2>{kalk.labor.length ? 3 : 2}. Material und Implantatteile</h2>
          <table className="kv-tabelle">
            <thead><tr><th /><th>Zahn</th><th>Material</th><th className="r">Anz.</th><th className="r">Einzel</th><th className="r">Betrag</th></tr></thead>
            <tbody>{zeilen(kalk.material, false)}</tbody>
            <tfoot><tr><td colSpan={5}>Summe Material</td><td className="r">{euro(kalk.summeMaterial)}</td></tr></tfoot>
          </table>
        </section>
      )}

      <section className="kv-summe">
        <div><span>Zahnärztliches Honorar</span><span>{euro(kalk.summeHonorar)}</span></div>
        {kalk.labor.length > 0 && <div><span>Zahntechnische Leistungen inkl. MwSt.</span><span>{euro(kalk.summeLaborNetto + kalk.mwst)}</span></div>}
        {kalk.material.length > 0 && <div><span>Material</span><span>{euro(kalk.summeMaterial)}</span></div>}
        <div className="gesamt"><span>Voraussichtliche Gesamtkosten</span><span>{euro(kalk.gesamt)}</span></div>
      </section>

      {begruendungen.length > 0 && (
        <section className="kv-begruendung">
          <h2>Begründungen für Faktoren über 2,3 (§ 10 Abs. 3 GOZ)</h2>
          {begruendungen.map((z) => <p key={z.id}><b>GOZ {z.nr}{z.zahn && ` (${z.zahn})`}, Faktor {faktorText(z.faktor)}:</b> {z.begruendung}</p>)}
        </section>
      )}

      {plan.bemerkung && <section><h2>Bemerkungen</h2><p className="kv-bemerkung">{plan.bemerkung}</p></section>}

      <section className="kv-hinweise">
        <p>Dieser Kostenvoranschlag beruht auf dem heutigen Befund. Die tatsächlichen Kosten können abweichen, wenn sich im Verlauf der Behandlung ein anderer Aufwand ergibt. Die zahntechnischen Leistungen sind geschätzt (Grundlage: {BEB_NAME}{plan.regler.laborAufschlag ? `, ${plan.regler.laborAufschlag > 0 ? '+' : ''}${plan.regler.laborAufschlag} %` : ''}); berechnet werden die tatsächlich entstandenen Kosten nach § 9 GOZ. Überschreiten diese die Schätzung um mehr als 20 %, werden Sie vorher informiert.</p>
        <p>Ob und in welcher Höhe Ihre private Krankenversicherung, Beihilfe oder Zusatzversicherung die Kosten erstattet, richtet sich nach Ihrem Vertrag. Eine Erstattung kann nicht zugesichert werden; bitte reichen Sie diesen Kostenvoranschlag vor Behandlungsbeginn dort ein.</p>
        <p>Der Kostenvoranschlag ist gültig bis {gueltigBis(plan.datum, einst.gueltigMonate)}.</p>
      </section>

      <footer className="kv-unterschriften">
        <div><span />Ort, Datum, Unterschrift Zahnärztin / Zahnarzt</div>
        <div><span />Ich bin mit der geplanten Behandlung einverstanden.<br />Ort, Datum, Unterschrift Patient/in</div>
      </footer>
    </article>
  )
}

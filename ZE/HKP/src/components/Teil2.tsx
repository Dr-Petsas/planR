import { Fragment } from 'react'
import type { HkpPlan } from '../types'
import type { Ergebnis } from '../engine/berechnung'
import { euro, euroGanz } from '../format'

export function Teil2({ plan, ergebnis }: { plan: HkpPlan; ergebnis: Ergebnis }) {
  const s = ergebnis.summen
  const goz = ergebnis.positionen.filter((p) => p.ebene === 'GOZ')
  const pflicht = ergebnis.versorgungsart !== 'regel'
  const stufe = plan.zuschuss.haertefall ? '100' : plan.zuschuss.bonus

  return (
    <div className="formular teil2">
      <div className="formular-kopf">
        <div>
          <strong>{plan.patient.name || '—'}, {plan.patient.vorname}</strong>
          <div className="klein">geb. {plan.patient.geburtsdatum || '—'} · {plan.patient.kasse || 'Krankenkasse'}</div>
        </div>
        <div className="titel-block">
          <h2>Heil- und Kostenplan <span>Teil 2</span></h2>
          <p>Anlage zum Heil- und Kostenplan vom {plan.verwaltung.ausstellungsdatum || '—'}</p>
        </div>
      </div>

      {!pflicht && (
        <p className="hinweis info">
          Für eine reine Regelversorgung ist Teil 2 nicht erforderlich. Er wird bei gleich- oder andersartiger Versorgung verpflichtend.
        </p>
      )}

      <section className="abschnitt">
        <h3>Gebührenaufstellung nach GOZ (voraussichtlich)</h3>
        <table className="tabelle">
          <thead>
            <tr><th>Zahn/Gebiet</th><th>GOZ-Nr.</th><th>Leistungsbeschreibung</th><th className="r">Anzahl</th><th className="r">Faktor</th><th className="r">Betrag (gerundet)</th></tr>
          </thead>
          <tbody>
            {goz.length === 0 && <tr><td colSpan={6} className="leer">Keine GOZ-Leistungen geplant.</td></tr>}
            {goz.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td>{p.zahn}</td><td>{p.nr}</td><td>{p.bezeichnung}{p.nachtraeglich ? ' (nachträglich)' : ''}</td>
                  <td className="r">{p.anzahl}</td><td className="r">{String(p.faktor ?? '').replace('.', ',')}</td>
                  <td className="r">{euroGanz(p.betrag)}</td>
                </tr>
                {p.faktorBegruendung && (
                  <tr className="teil2-begruendung"><td /><td /><td colSpan={4}>Begründung (§ 10 Abs. 3 GOZ): {p.faktorBegruendung}</td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      <div className="zwei-spalten">
        <section className="abschnitt">
          <h3>Voraussichtliche Kosten</h3>
          <table className="kosten-uebersicht">
            <tbody>
              <tr><td>Zahnärztliches Honorar GOZ</td><td className="r">{euro(s.gozHonorar)}</td></tr>
              <tr><td>Zahnärztliches Honorar BEMA</td><td className="r">{euro(s.bemaHonorar)}</td></tr>
              <tr><td>Material- und Laborkosten</td><td className="r">{euro(s.materialUndLabor)}</td></tr>
              <tr className="summe"><td>Gesamtkosten</td><td className="r">{euro(s.gesamt)}</td></tr>
              <tr><td>abzüglich Festzuschüsse ({stufe} %)</td><td className="r">− {euro(s.kassenanteil)}</td></tr>
              <tr className="summe eigen"><td>Ihr voraussichtlicher Eigenanteil</td><td className="r">{euro(s.eigenanteil)}</td></tr>
            </tbody>
          </table>
          {ergebnis.direktabrechnung && (
            <p className="hinweis info">
              Andersartige Versorgung: Sie erhalten die Rechnung über die Gesamtkosten und von Ihrer Krankenkasse die bewilligten Festzuschüsse erstattet.
            </p>
          )}
        </section>

        <section className="abschnitt">
          <h3>Information über die Kosten der Regelversorgung</h3>
          <table className="kosten-uebersicht">
            <tbody>
              <tr><td>Die Kosten der Regelversorgung bei Ihrem Befund würden voraussichtlich betragen (entspricht Festzuschuss 100 %)</td><td className="r">{euro(s.festzuschuss100)}</td></tr>
              <tr><td>Die Krankenkasse zahlt voraussichtlich (Festzuschuss {stufe} %)</td><td className="r">{euro(s.festzuschuss)}</td></tr>
              <tr className="summe"><td>Ihr Eigenanteil bei Wahl der Regelversorgung wäre voraussichtlich</td><td className="r">{euro(s.eigenanteilRegel)}</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      <div className="unterschriften">
        <div><div className="linie" />Datum, Unterschrift des Zahnarztes</div>
        <div>
          <div className="linie" />
          Ich wünsche eine Versorgung entsprechend dieses Kostenplanes. Datum, Unterschrift des Versicherten
        </div>
      </div>
    </div>
  )
}

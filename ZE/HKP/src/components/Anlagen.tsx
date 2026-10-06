import type { ReactNode } from 'react'
import type { HkpPlan } from '../types'
import { belNrAnzeige, type BerechnetePosition, type Ergebnis, type Listen } from '../engine/berechnung'
import { euro, zahlDe } from '../format'

interface Props {
  plan: HkpPlan
  ergebnis: Ergebnis
}

function Kopf({ plan, titel, zusatz, rechts }: { plan: HkpPlan; titel: string; zusatz: string; rechts?: ReactNode }) {
  return (
    <div className="formular-kopf">
      <div>
        <strong>{plan.patient.name || '—'}, {plan.patient.vorname}</strong>
        <div className="klein">geb. {plan.patient.geburtsdatum || '—'} · {plan.patient.kasse || 'Krankenkasse'}</div>
        {rechts}
      </div>
      <div className="titel-block">
        <h2>Heil- und Kostenplan <span>{zusatz}</span></h2>
        <p>{titel} – zum Heil- und Kostenplan vom {plan.verwaltung.ausstellungsdatum || '—'}</p>
      </div>
    </div>
  )
}

function Aufstellung({ titel, zeilen, punkte, leer }: { titel: string; zeilen: BerechnetePosition[]; punkte?: boolean; leer: string }) {
  const summe = zeilen.reduce((s, p) => s + p.betrag, 0)
  return (
    <section className="abschnitt">
      <h3>{titel}</h3>
      <table className="tabelle aufstellung">
        <thead>
          <tr>
            <th>Zahn/Gebiet</th><th>Nr.</th><th>Leistung</th>
            {punkte && <th className="r">Punkte</th>}
            <th className="r">Anz.</th>{!punkte && <th className="r">Einzel</th>}<th className="r">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.length === 0 && <tr><td colSpan={6} className="leer">{leer}</td></tr>}
          {zeilen.map((p) => (
            <tr key={p.id}>
              <td>{p.zahn}</td>
              <td>{p.ebene === 'BEL' ? belNrAnzeige(p.nr) : p.ebene === 'MAT' ? '–' : p.eigen ?? p.nr}</td>
              <td>{p.bezeichnung || p.text}</td>
              {punkte && <td className="r">{p.punkte ?? ''}</td>}
              <td className="r">{zahlDe(p.anzahl)}</td>
              {!punkte && <td className="r">{euro(p.einzelpreis)}</td>}
              <td className="r">{euro(p.betrag)}</td>
            </tr>
          ))}
        </tbody>
        {zeilen.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={punkte ? 3 : 5} className="r">Summe {titel}</td>
              {punkte && <td className="r">{zeilen.reduce((s, p) => s + (p.punkte ?? 0) * p.anzahl, 0)}</td>}
              {punkte && <td />}
              <td className="r"><strong>{euro(summe)}</strong></td>
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  )
}

/** Aufstellung aller Leistungen und Kosten; GOZ im Einzelnen steht in Teil 2, das Praxislabor im Eigenlaborbeleg. */
export function Anlage({ plan, ergebnis }: Props) {
  const s = ergebnis.summen
  const bema = ergebnis.positionen.filter((p) => p.ebene === 'BEMA')
  const nGoz = ergebnis.positionen.filter((p) => p.ebene === 'GOZ').length
  const fl = plan.fremdlabor
  return (
    <div className="formular anlage">
      <Kopf plan={plan} zusatz="Anlage" titel="Aufstellung der Leistungen und Kosten" />

      <Aufstellung titel="Zahnärztliche Leistungen nach BEMA" zeilen={bema} punkte leer="Keine BEMA-Leistungen." />

      <section className="abschnitt">
        <h3>Kostenübersicht</h3>
        <table className="kosten-uebersicht">
          <tbody>
            <tr><td>2</td><td>Zahnärztliches Honorar BEMA <span className="klein">({s.bemaPunkte} Punkte)</span></td><td className="r">{euro(s.bemaHonorar)}</td></tr>
            <tr><td>3</td><td>Zahnärztliches Honorar GOZ {nGoz > 0 && <span className="klein">({nGoz} Positionen – Einzelaufstellung in Teil 2)</span>}</td><td className="r">{euro(s.gozHonorar)}</td></tr>
            <tr><td>4</td><td>Material- und Laborkosten</td><td className="r">{euro(s.materialUndLabor)}</td></tr>
            {s.eigenNetto !== 0 && (
              <tr className="unterzeile"><td /><td>Praxislabor (Eigenlabor) inkl. {zahlDe(plan.einstellungen.mwstLabor)} % MwSt. – siehe Eigenlaborbeleg</td><td className="r">{euro(s.eigenNetto + s.eigenMwst)}</td></tr>
            )}
            {s.fremdNetto !== 0 && (
              <tr className="unterzeile">
                <td />
                <td>Gewerbliches Labor{fl.name ? ` (${fl.name})` : ''} inkl. {zahlDe(plan.einstellungen.mwstLabor)} % MwSt.{fl.import ? ` – Rechnung ${fl.import.rechnungsnummer}` : ' – vorläufig'}</td>
                <td className="r">{euro(s.fremdNetto + s.fremdMwst)}</td>
              </tr>
            )}
            {s.material !== 0 && <tr className="unterzeile"><td /><td>Praxismaterial / sonstige Kosten</td><td className="r">{euro(s.material)}</td></tr>}
            <tr className="summe"><td>5</td><td>Behandlungskosten insgesamt</td><td className="r">{euro(s.gesamt)}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}

/** Beleg über die im Praxislabor erbrachten zahntechnischen Leistungen (Teil 1 V., Zeile 5). */
export function Eigenlaborbeleg({ plan, ergebnis, listen }: Props & { listen: Listen }) {
  const s = ergebnis.summen
  const e = plan.einstellungen
  const eigen = ergebnis.positionen.filter((p) => p.labor === 'eigen')
  const bel = eigen.filter((p) => p.ebene === 'BEL')
  const beb = eigen.filter((p) => p.ebene === 'BEB')
  const mat = eigen.filter((p) => p.ebene === 'MAT')
  return (
    <div className="formular eigenlabor">
      <Kopf
        plan={plan} zusatz="Eigenlabor" titel="Material- und Laborkosten Praxislabor"
        rechts={
          <div className="klein eigenlabor-angaben">
            Herstellungsort: <b>{plan.verwaltung.herstellungsort || '— (in Teil 1 eintragen)'}</b><br />
            BEL II: {listen.bel?.name ?? '—'} · Praxislabor-Höchstpreis{e.eigenKasseProzent !== 100 ? ` × ${e.eigenKasseProzent} %` : ''}
          </div>
        }
      />
      {eigen.length === 0 ? (
        <p className="hinweis info">Keine Eigenlabor-Leistungen in diesem Plan.</p>
      ) : (
        <>
          <Aufstellung titel="Zahntechnische Leistungen nach BEL II (Kasse)" zeilen={bel} leer="Keine BEL-II-Leistungen." />
          {beb.length > 0 && <Aufstellung titel="Zahntechnische Leistungen nach BEB (privat)" zeilen={beb} leer="" />}
          {mat.length > 0 && <Aufstellung titel="Legierungen und Rohlinge" zeilen={mat} leer="" />}
          <section className="abschnitt">
            <table className="kosten-uebersicht">
              <tbody>
                <tr><td /><td>BEL II (Kasse)</td><td className="r">{euro(s.eigenBel)}</td></tr>
                {s.eigenBeb !== 0 && <tr><td /><td>BEB (privat)</td><td className="r">{euro(s.eigenBeb)}</td></tr>}
                {s.eigenMat !== 0 && <tr><td /><td>Legierungen und Rohlinge</td><td className="r">{euro(s.eigenMat)}</td></tr>}
                <tr><td /><td>Summe netto</td><td className="r">{euro(s.eigenNetto)}</td></tr>
                <tr><td /><td>MwSt. {zahlDe(e.mwstLabor)} %</td><td className="r">{euro(s.eigenMwst)}</td></tr>
                <tr className="summe"><td /><td>Material- und Laborkosten Praxislabor</td><td className="r">{euro(s.eigenNetto + s.eigenMwst)}</td></tr>
              </tbody>
            </table>
          </section>
          <div className="unterschriften">
            <div><div className="linie" />Datum, Unterschrift des Zahnarztes</div>
            <div />
          </div>
        </>
      )}
    </div>
  )
}

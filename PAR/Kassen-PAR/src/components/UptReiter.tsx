import { useMemo } from 'react'
import { uptFrequenz } from '../engine/strecke'
import { datumDe, fristenPruefen, plusMonate, uptSchema, wochentag } from '../engine/termine'
import type { DiagnoseErgebnis, Einstellungen, ParFall } from '../types'
import { Karte } from './ui'

interface Props { fall: ParFall; diag: DiagnoseErgebnis; einst: Einstellungen }

export default function UptReiter({ fall, diag, einst }: Props) {
  const f = uptFrequenz(diag.grad)
  const schema = useMemo(() => uptSchema(diag.grad, fall.planung.verlaengerungMonate), [diag.grad, fall.planung.verlaengerungMonate])
  const fristen = useMemo(() => fristenPruefen(fall, diag), [fall, diag])
  const upt = fall.termine.filter((t) => t.art === 'upt').sort((a, b) => a.datum.localeCompare(b.datum))
  const erste = upt[0]?.datum
  const bev = fall.termine.find((t) => t.art === 'bev')
  const aitEnde = fall.termine.filter((t) => t.art === 'ait').at(-1)

  return (
    <div className="reiter-inhalt">
      <Karte titel={`UPT-Regeln bei Grad ${diag.grad}`}>
        <table className="tabelle">
          <thead><tr><th>Leistung</th><th>Anzahl in 2 Jahren</th><th>Mindestabstand</th></tr></thead>
          <tbody>
            <tr><td>UPT a, b, c, e, f</td><td>{f.sitzungen}×</td><td>{f.abstandMon} Monate zur vorigen UPT</td></tr>
            <tr><td>UPT d</td><td>{f.dMax ? `${f.dMax}×` : '–'}</td><td>{f.dMax ? `${f.abstandMon} Monate zur ersten UPT, danach zur letzten UPT d oder g` : 'bei Grad A nicht vorgesehen'}</td></tr>
            <tr><td>UPT g</td><td>1×</td><td>10 Monate zur ersten UPT{f.dMax ? `, ${f.abstandMon} Monate zur letzten UPT d` : ''}</td></tr>
            <tr><td>BEV a</td><td>1×</td><td>3–6 Monate nach Abschluss der AIT</td></tr>
            <tr><td>Verlängerung (5d)</td><td>–</td><td>in der Regel bis 6 Monate; Abstände zur letzten identischen Leistung</td></tr>
          </tbody>
        </table>
        {aitEnde && (
          <p className="hinweis-klein">BEV-a-Fenster: {datumDe(plusMonate(aitEnde.datum, 3))} bis {datumDe(plusMonate(aitEnde.datum, 6))}
            {bev ? ` · geplant am ${datumDe(bev.datum)}` : ''}</p>
        )}
      </Karte>

      <Karte titel="Frühestes Schema (Monate ab erster UPT)">
        <table className="tabelle">
          <thead><tr><th>UPT</th><th>Monat</th><th>Module</th><th>frühestens</th></tr></thead>
          <tbody>
            {schema.map((z) => (
              <tr key={z.nr} className={z.verlaengerung ? 'verlaengerung' : ''}>
                <td>{z.nr}.{z.verlaengerung ? ' (Verl.)' : ''}</td>
                <td>{z.monat}</td>
                <td>{z.module.join(' ')}</td>
                <td>{erste ? datumDe(plusMonate(erste, z.monat)) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Karte>

      <Karte titel="Geplante UPT-Termine">
        <table className="tabelle">
          <thead><tr><th>Datum</th><th>Termin</th><th>Module</th><th>Status</th><th>Prüfung</th></tr></thead>
          <tbody>
            {upt.map((t) => {
              const m = fristen.filter((x) => x.terminId === t.id)
              return (
                <tr key={t.id} className={m.some((x) => x.art === 'fehler') ? 'fehlerzeile' : ''}>
                  <td>{wochentag(t.datum)} {datumDe(t.datum)}</td>
                  <td>{t.titel}</td>
                  <td>{t.module.join(' ')}</td>
                  <td>{t.erbracht ? 'erbracht' : 'geplant'}</td>
                  <td>{m.length ? m.map((x) => x.text).join(' ') : 'ok'}</td>
                </tr>
              )
            })}
            {upt.length === 0 && <tr><td colSpan={5}>Noch keine UPT geplant (Reiter Strecke).</td></tr>}
          </tbody>
        </table>
      </Karte>

      <Karte titel="Termin-Ausdruck für den Patienten" rechts={<button onClick={() => window.print()}>Drucken</button>}>
        <div className="druck termin-ausdruck">
          <h2>Ihre Termine zur Parodontitis-Behandlung</h2>
          <p>{einst.praxis.name}{einst.praxis.telefon ? ` · Tel. ${einst.praxis.telefon}` : ''}</p>
          <p>Patient: {[fall.patient.vorname, fall.patient.name].filter(Boolean).join(' ') || '–'}</p>
          <table className="tabelle">
            <thead><tr><th>Datum</th><th>Behandlung</th></tr></thead>
            <tbody>
              {[...fall.termine].sort((a, b) => a.datum.localeCompare(b.datum)).map((t) => (
                <tr key={t.id}><td>{wochentag(t.datum)} {datumDe(t.datum)}</td><td>{t.titel}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="hinweis-klein">Die Abstände der Nachsorge (UPT) sind gesetzlich vorgegeben. Bitte halten Sie die Termine ein
            oder verschieben Sie rechtzeitig.</p>
        </div>
      </Karte>
    </div>
  )
}

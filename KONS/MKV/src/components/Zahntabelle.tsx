import type { Einstellungen, Plan, Rechnung, Therapie, ZahnLeistung } from '../types'
import { THERAPIE, THERAPIEN } from '../data/katalog'
import { euro, faktorText } from '../engine/mkv'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
  rechnung: Rechnung
}

export default function Zahntabelle({ plan, setPlan, einst, rechnung }: Props) {
  if (!rechnung.zaehne.length) {
    return (
      <div className="block">
        <h3>Füllungen</h3>
        <p className="leer">Noch keine Füllung geplant – Kürzel oben im Zahnschema eintragen.</p>
      </div>
    )
  }

  const aendern = (zahn: string, patch: Partial<ZahnLeistung>) =>
    setPlan({ ...plan, zaehne: { ...plan.zaehne, [zahn]: { ...plan.zaehne[zahn], ...patch } } })
  const entfernen = (zahn: string) => {
    const naechste = { ...plan.zaehne }
    delete naechste[zahn]
    setPlan({ ...plan, zaehne: naechste })
  }
  const therapieWechseln = (zahn: string, therapie: Therapie) => {
    const z = plan.zaehne[zahn]
    const max = THERAPIE[therapie].plastisch ? 5 : 3
    aendern(zahn, { therapie, flaechen: Math.min(max, z.flaechen), labor: therapie === 'inlay' ? z.labor ?? 'keramik' : undefined, faktor: undefined })
  }

  return (
    <div className="block">
      <h3>Füllungen</h3>
      <table className="zahn-tabelle">
        <thead>
          <tr>
            <th>Zahn</th><th>Füllung</th><th>Flächen</th><th>Details</th>
            <th className="r">GOZ</th><th className="r">Kasse</th><th className="r">Mehrkosten</th><th />
          </tr>
        </thead>
        <tbody>
          {rechnung.zaehne.map((e) => {
            const z = plan.zaehne[e.zahn]
            const t = THERAPIE[z.therapie]
            const faktorFrei = !t.plastisch || plan.regler.modell === 'gozDifferenz'
            return (
              <tr key={e.zahn} className={e.warnungen.length ? 'mit-warnung' : ''}>
                <td className="mono zahn">{e.zahn}</td>
                <td>
                  <select value={z.therapie} onChange={(ev) => therapieWechseln(e.zahn, ev.target.value as Therapie)}>
                    {THERAPIEN.map((x) => <option key={x.id} value={x.id}>{x.kuerzel} · {x.kurz}</option>)}
                  </select>
                  {z.therapie === 'inlay' && (
                    <select value={z.labor ?? 'keramik'} onChange={(ev) => aendern(e.zahn, { labor: ev.target.value })}>
                      {einst.laborPreise.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  <div className="flaechen-wahl">
                    {Array.from({ length: t.plastisch ? 5 : 3 }, (_, i) => i + 1).map((n) => (
                      <button key={n} className={z.flaechen === n ? 'aktiv' : ''} onClick={() => aendern(e.zahn, { flaechen: n })}>
                        {n}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="details">
                  <label className="chk"><input type="checkbox" checked={!!z.kofferdam} onChange={(ev) => aendern(e.zahn, { kofferdam: ev.target.checked })} />Kofferdam</label>
                  {!t.plastisch && (
                    <label className="chk"><input type="checkbox" checked={!!z.anaesthesie} onChange={(ev) => aendern(e.zahn, { anaesthesie: ev.target.checked })} />Anästhesie</label>
                  )}
                  <label className="chk" title="§ 28 Abs. 2 S. 5 SGB V: beim Austausch intakter Füllungen gibt es keine Mehrkostenregelung">
                    <input type="checkbox" checked={!!z.austausch} onChange={(ev) => aendern(e.zahn, { austausch: ev.target.checked })} />intakte Füllung
                  </label>
                  <label className="chk faktor-feld" title={faktorFrei ? 'Eigener Faktor für diesen Zahn (leer = Regler)' : 'Der Faktor ergibt sich aus dem Mehrkostenbetrag'}>
                    Faktor
                    <input
                      type="number" min={1} max={5} step={0.1}
                      disabled={!faktorFrei}
                      value={faktorFrei ? z.faktor ?? '' : e.faktor}
                      placeholder={faktorText(e.faktor)}
                      onChange={(ev) => aendern(e.zahn, { faktor: ev.target.value ? +ev.target.value : undefined })}
                    />
                  </label>
                  {[...e.warnungen.map((w) => ['warn', w]), ...e.hinweise.map((h) => ['info', h])].map(([art, text]) => (
                    <div key={text} className={`zeilen-hinweis ${art}`}>{text}</div>
                  ))}
                </td>
                <td className="r mono">{euro(e.privat)}</td>
                <td className="r mono kasse">{e.kasse ? `${e.kasse.nr} · ${euro(e.kassenanteil)}` : '—'}</td>
                <td className="r mono stark">{euro(e.mehrkosten)}</td>
                <td><button className="x" onClick={() => entfernen(e.zahn)} title="Zahn entfernen">×</button></td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          {rechnung.begleit.map((b) => (
            <tr key={b.nr}>
              <td className="mono">{b.nr}</td>
              <td colSpan={3}>{b.text}</td>
              <td className="r mono">{euro(b.summe)}</td><td className="r">—</td><td className="r mono stark">{euro(b.summe)}</td><td />
            </tr>
          ))}
          <tr className="summe">
            <td colSpan={4}>Summe</td>
            <td className="r mono">{euro(rechnung.privat)}</td>
            <td className="r mono">{euro(rechnung.kassenanteil)}</td>
            <td className="r mono stark">{euro(rechnung.mehrkosten)}</td><td />
          </tr>
        </tfoot>
      </table>
      <p className="fuss">
        Kassenanteil = BEMA-Punkte × Punktwert {rechnung.punktwert.toLocaleString('de-DE', { minimumFractionDigits: 4 })} €. {rechnung.punktwertHinweis}
        {plan.regler.modell !== 'gozDifferenz' && ' Bei festen Beträgen wird der Faktor auf zwei Stellen gerundet – die Mehrkosten weichen dadurch um wenige Cent ab.'}
      </p>
    </div>
  )
}

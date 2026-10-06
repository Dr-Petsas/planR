import type { Einstellungen, Plan, ZahnLeistung } from '../types'
import { KATALOG_NACH_ID } from '../data/katalog'
import { ALLE_ZAEHNE } from '../engine/zahnschema'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  einst: Einstellungen
}

const MATERIAL_OPTIONEN: Record<string, { id: string; name: string }[]> = {
  inlay: [
    { id: 'keramik-inlay', name: 'Keramik (Labor)' },
    { id: 'cadcam-inlay', name: 'CAD/CAM-Keramik' },
    { id: 'gold-inlay', name: 'Gold (Labor)' },
  ],
  aufbau: [
    { id: '', name: 'ohne Stift' },
    { id: 'glasfaserstift', name: 'mit Glasfaserstift' },
  ],
}

export default function Behandlungstabelle({ plan, setPlan, einst }: Props) {
  const zaehne = ALLE_ZAEHNE.filter((z) => {
    const l = plan.zaehne[z]
    return l && !l.therapie.startsWith('?')
  })

  const aktualisiere = (zahn: string, patch: Partial<ZahnLeistung>) => {
    setPlan({ ...plan, zaehne: { ...plan.zaehne, [zahn]: { ...plan.zaehne[zahn], ...patch } } })
  }
  const entferne = (zahn: string) => {
    const naechste = { ...plan.zaehne }
    delete naechste[zahn]
    setPlan({ ...plan, zaehne: naechste })
  }

  if (!zaehne.length)
    return (
      <div className="block">
        <h3>Behandlungsdetails</h3>
        <p className="leer">Noch keine Zähne geplant – oben im Zahnschema ein Kürzel eintragen.</p>
      </div>
    )

  return (
    <div className="block">
      <h3>Behandlungsdetails</h3>
      <table className="impl-tabelle">
        <thead>
          <tr>
            <th>Zahn</th>
            <th>Therapie</th>
            <th>Flächen</th>
            <th>Kanäle</th>
            <th>Material</th>
            <th>Zusatzleistungen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {zaehne.map((zahn) => {
            const z = plan.zaehne[zahn]
            const kat = KATALOG_NACH_ID[z.therapie]
            const f = kat.felder
            const matOpt = MATERIAL_OPTIONEN[kat.kategorie]
            return (
              <tr key={zahn}>
                <td className="mono">
                  <b>{zahn}</b>
                </td>
                <td>{kat.titel}</td>
                <td>
                  {f.flaechen ? (
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={z.flaechen ?? 1}
                      onChange={(e) => aktualisiere(zahn, { flaechen: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })}
                    />
                  ) : (
                    '–'
                  )}
                </td>
                <td>
                  {f.kanaele ? (
                    <input
                      type="number"
                      min={1}
                      max={4}
                      value={z.kanaele ?? 1}
                      onChange={(e) => aktualisiere(zahn, { kanaele: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })}
                    />
                  ) : (
                    '–'
                  )}
                </td>
                <td>
                  {f.material && matOpt ? (
                    <select value={z.material ?? ''} onChange={(e) => aktualisiere(zahn, { material: e.target.value })}>
                      {matOpt.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    '–'
                  )}
                </td>
                <td>
                  <div className="optionen" style={{ margin: 0, flexWrap: 'wrap', gap: 10 }}>
                    {f.mikroskop && (
                      <label>
                        <input type="checkbox" checked={!!z.mikroskop} onChange={(e) => aktualisiere(zahn, { mikroskop: e.target.checked })} /> Mikroskop
                      </label>
                    )}
                    {f.elektrometrie && (
                      <label>
                        <input type="checkbox" checked={!!z.elektrometrie} onChange={(e) => aktualisiere(zahn, { elektrometrie: e.target.checked })} /> elektrometr.
                      </label>
                    )}
                    {f.maschinell && (
                      <label>
                        <input type="checkbox" checked={!!z.maschinell} onChange={(e) => aktualisiere(zahn, { maschinell: e.target.checked })} /> maschinell
                      </label>
                    )}
                    {f.kofferdam && (
                      <label>
                        <input type="checkbox" checked={!!z.kofferdam} onChange={(e) => aktualisiere(zahn, { kofferdam: e.target.checked })} /> Kofferdam
                      </label>
                    )}
                    {f.revision && (
                      <label>
                        <input type="checkbox" checked={!!z.revision} onChange={(e) => aktualisiere(zahn, { revision: e.target.checked })} /> Revision
                      </label>
                    )}
                    {!f.mikroskop && !f.elektrometrie && !f.maschinell && !f.kofferdam && !f.revision && <span className="leer">–</span>}
                  </div>
                </td>
                <td>
                  <button className="x" title="Zahn entfernen" onClick={() => entferne(zahn)}>
                    ×
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="kv-fuss">GOZ-Faktor {einst.gozFaktor.toFixed(1)} als Vorgabe – pro Position in „Leistungen“ anpassbar.</p>
    </div>
  )
}

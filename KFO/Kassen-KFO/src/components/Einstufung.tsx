import type { Einstufung as EinstufungT, Plan, Rechnung, Stufen } from '../types'
import { RASTER_119, RASTER_120 } from '../data/katalog'
import { euro } from '../engine/kfo'
import { bemaEintrag } from '../engine/listen'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
  rechnung: Rechnung
}

type Bereich = 'ok' | 'uk' | 'biss'
const TITEL: Record<Bereich, string> = { ok: 'Umformung Oberkiefer (119)', uk: 'Umformung Unterkiefer (119)', biss: 'Einstellung in den Regelbiss (120)' }

function Raster({ raster, stufen, onChange }: { raster: typeof RASTER_119 | typeof RASTER_120; stufen: Stufen; onChange: (s: Stufen) => void }) {
  return (
    <table className="raster">
      <tbody>
        {raster.map((k, i) => (
          <tr key={k.name}>
            <td>{['I', 'II', 'III', 'IV', 'V'][i]}. {k.name}</td>
            {k.stufen.map((s, j) => (
              <td key={j}>
                {s ? (
                  <button className={stufen[i] === j ? 'aktiv' : ''}
                    onClick={() => onChange(stufen.map((x, n) => (n === i ? (x === j ? null : (j as 0 | 1 | 2)) : x)))}>
                    {s[0]}<b>{s[1]}</b>
                  </button>
                ) : <div className="leer-stufe">–</div>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function Einstufung({ plan, setPlan, rechnung }: Props) {
  const e = plan.einstufung
  const setE = (patch: Partial<EinstufungT>) => setPlan({ ...plan, einstufung: { ...e, ...patch } })
  const ergebnis = (b: Bereich) => rechnung.einstufung.find((x) => x.bereich === b)
  const aktivKey = { ok: 'okAktiv', uk: 'ukAktiv', biss: 'bissAktiv' } as const

  return (
    <div className="block">
      <h3>Behandlungsaufgabe <small className="grau">BEMA 119 je Kiefer · 120 Bisslage · Punkteraster</small></h3>
      <p className="hilfe">
        Je Kriterium eine Spalte wählen; die Summe ergibt die Schwierigkeit. 119: 5–7 a, 8–10 b, 11–15 c, ab 16 d.
        120: 4–8 a, 9–10 b, 11–12 c, ab 13 d. Gezahlt wird in {rechnung.abschlaege} Abschlägen je Quartal
        {rechnung.abschlaege === 6 ? ' (Frühbehandlung)' : ''}; abgegolten sind bis zu 16 Behandlungsquartale einschließlich Retention.
      </p>
      <div className="aufgabe">
        {(['ok', 'uk', 'biss'] as Bereich[]).map((b) => {
          const r = ergebnis(b)
          const eintrag = r?.nr ? bemaEintrag(r.nr) : undefined
          return (
            <div key={b}>
              <label className="chk kopf">
                <input type="checkbox" checked={e[aktivKey[b]]} onChange={(ev) => setE({ [aktivKey[b]]: ev.target.checked } as Partial<EinstufungT>)} /> {TITEL[b]}
              </label>
              {e[aktivKey[b]] && (
                <>
                  <span className="umfang">
                    {r?.vollstaendig && r.nr
                      ? `${r.punkte} Punkte → ${r.nr} · ${rechnung.abschlaege} × ${eintrag?.abschlag} Punkte = ${euro(rechnung.honorar.find((z) => z.id === `auf-${b}`)?.summe ?? 0)}`
                      : `${r?.punkte ?? 0} Punkte – noch nicht alle Kriterien bewertet`}
                  </span>
                  <Raster raster={b === 'biss' ? RASTER_120 : RASTER_119} stufen={e[b]} onChange={(s) => setE({ [b]: s } as Partial<EinstufungT>)} />
                </>
              )}
            </div>
          )
        })}
      </div>
      <p className="hilfe" style={{ marginTop: 8 }}>
        Als günstig kippend gelten Bukkalbewegung der Seitenzähne bei der Dehnung, Pro- und Retrusion der Frontzähne und
        Mesialbewegung der Seitenzähne; ungünstig kippend Palatinal- und Distalbewegung der Seitenzähne, Lateralbewegung
        von Frontzähnen, Drehung, Verlängerung und Verkürzung von Zähnen.
      </p>
    </div>
  )
}

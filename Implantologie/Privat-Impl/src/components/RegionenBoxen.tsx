import type { Plan, Region, RegionOptionen } from '../types'
import { REGION_NAME } from '../types'

interface Props {
  /** nur die Regionen, in denen etwas geplant ist */
  regionen: Region[]
  wert: Partial<Record<Region, RegionOptionen>>
  onChange: (regionen: Plan['regionen']) => void
}

const MATERIAL_WAHL: [RegionOptionen['material'], string][] = [
  ['', 'ohne/kein Aufbau'], ['autolog', 'autolog (eigener Knochen)'], ['allogen', 'allogen'],
  ['xenogen', 'xenogen (Bio-Oss …)'], ['synthetisch', 'synthetisch (β-TCP …)'],
]
const MEMBRAN_WAHL: [NonNullable<RegionOptionen['membran']>, string][] = [
  ['keine', 'keine'], ['resorbierbar', 'resorbierbar (Bio-Gide …)'], ['nicht-resorbierbar', 'nicht-resorbierbar (dPTFE)'],
  ['titan', 'Titangitter (Yxoss …)'], ['vlies', 'Kollagenvlies'],
]
const WEICH_WAHL: [NonNullable<RegionOptionen['weichgewebe']>, string][] = [
  ['keine', 'keine'], ['rolllappen', 'Rolllappen'], ['fst', 'freies Schleimhauttransplantat'],
  ['btt', 'Bindegewebetransplantat'], ['vestibulumplastik', 'Vestibulumplastik'], ['tuberplastik', 'Tuberplastik'],
]

export function RegionenBoxen({ regionen, wert, onChange }: Props) {
  if (!regionen.length) return null
  const setzen = (r: Region, aend: Partial<RegionOptionen>) =>
    onChange({ ...wert, [r]: { ...wert[r], ...aend } })

  return (
    <div className="regionen">
      {regionen.map((r) => {
        const o = wert[r] ?? {}
        return (
          <fieldset key={r} className="region-box">
            <legend>{REGION_NAME[r]}</legend>
            <div className="region-grid">
              <label className="chk"><input type="checkbox" checked={!!o.augmentation} onChange={(e) => setzen(r, { augmentation: e.target.checked })} /> Augmentation (GBR)</label>
              <label className="chk"><input type="checkbox" checked={!!o.sinusIntern} onChange={(e) => setzen(r, { sinusIntern: e.target.checked })} /> Sinuslift intern</label>
              <label className="chk"><input type="checkbox" checked={!!o.sinusExtern} onChange={(e) => setzen(r, { sinusExtern: e.target.checked })} /> Sinuslift extern</label>
              <label className="chk"><input type="checkbox" checked={!!o.blockEntnahme} onChange={(e) => setzen(r, { blockEntnahme: e.target.checked })} /> Blockentnahme</label>
              <label className="chk"><input type="checkbox" checked={!!o.ringEntnahme} onChange={(e) => setzen(r, { ringEntnahme: e.target.checked })} /> Ringentnahme</label>
              <label className="chk"><input type="checkbox" checked={!!o.kollektor} onChange={(e) => setzen(r, { kollektor: e.target.checked })} /> Knochenkollektor</label>
              <label className="chk"><input type="checkbox" checked={!!o.fixierung} onChange={(e) => setzen(r, { fixierung: e.target.checked })} /> Fixierung (Pins/Schrauben)</label>
              <label className="chk"><input type="checkbox" checked={!!o.eigenblut} onChange={(e) => setzen(r, { eigenblut: e.target.checked })} /> Eigenblut (PRF) hier</label>
            </div>
            <div className="region-selects">
              <label className="feld"><span>Aufbaumaterial</span>
                <select value={o.material ?? ''} onChange={(e) => setzen(r, { material: e.target.value as RegionOptionen['material'] })}>
                  {MATERIAL_WAHL.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <label className="feld"><span>Membran</span>
                <select value={o.membran ?? 'keine'} onChange={(e) => setzen(r, { membran: e.target.value as RegionOptionen['membran'] })}>
                  {MEMBRAN_WAHL.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
              <label className="feld"><span>Weichgewebe</span>
                <select value={o.weichgewebe ?? 'keine'} onChange={(e) => setzen(r, { weichgewebe: e.target.value as RegionOptionen['weichgewebe'] })}>
                  {WEICH_WAHL.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

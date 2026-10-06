import type { GlobalOptionen } from '../types'

interface Props {
  wert: GlobalOptionen
  onChange: (global: GlobalOptionen) => void
}

export function GlobalBoxen({ wert, onChange }: Props) {
  const set = (aend: Partial<GlobalOptionen>) => onChange({ ...wert, ...aend })
  return (
    <fieldset className="global-box">
      <legend>Allgemeines (gilt für den ganzen Fall)</legend>
      <div className="region-selects">
        <label className="feld"><span>Bildgebung</span>
          <select value={wert.bildgebung} onChange={(e) => set({ bildgebung: e.target.value as GlobalOptionen['bildgebung'] })}>
            <option value="keine">keine</option>
            <option value="opg">OPG (GOÄ 5004)</option>
            <option value="dvt">DVT (GOÄ 5370 + 5377)</option>
            <option value="opg+dvt">OPG + DVT</option>
          </select>
        </label>
        <label className="feld"><span>Sedierung</span>
          <select value={wert.sedierung} onChange={(e) => set({ sedierung: e.target.value as GlobalOptionen['sedierung'] })}>
            <option value="keine">keine</option>
            <option value="lokal">Lokalanästhesie</option>
            <option value="lachgas">Lachgas (analog)</option>
            <option value="analgosedierung">Analgosedierung</option>
            <option value="itn">ITN (Fremdleistung § 4 Abs. 5)</option>
          </select>
        </label>
        <label className="feld"><span>Eigenblut</span>
          <select value={wert.blut} onChange={(e) => set({ blut: e.target.value as GlobalOptionen['blut'] })}>
            <option value="keine">keine</option>
            <option value="prf">PRF (Fibrin)</option>
            <option value="prgf">PRGF (Endoret)</option>
            <option value="prp">PRP</option>
          </select>
        </label>
        <label className="feld"><span>Blutröhrchen / Kits</span>
          <input type="number" min={0} value={wert.roehrchen} onChange={(e) => set({ roehrchen: Math.max(0, Number(e.target.value)) })} />
        </label>
      </div>
      <div className="region-grid">
        <label className="chk"><input type="checkbox" checked={wert.navigation} onChange={(e) => set({ navigation: e.target.checked })} /> navigierte Chirurgie (Bohrschablone)</label>
        <label className="chk"><input type="checkbox" checked={wert.risiko} onChange={(e) => set({ risiko: e.target.checked })} /> Risikopatient (Antikoagulation/ASA)</label>
        <label className="chk"><input type="checkbox" checked={wert.eigenesBlutlabor} onChange={(e) => set({ eigenesBlutlabor: e.target.checked })} /> Eigenblut im Praxislabor (Hämatologie)</label>
      </div>
    </fieldset>
  )
}

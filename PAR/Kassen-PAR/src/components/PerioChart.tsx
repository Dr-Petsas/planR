import type { Befund, Grad0123, ZahnBefund, ZahnStatus } from '../types'
import { OBERKIEFER, UNTERKIEFER } from '../engine/zahnschema'

const ZS_LABEL: Record<ZahnStatus, string> = {
  0: 'vorhanden',
  1: 'fehlt',
  2: 'nicht erhaltungswürdig',
  3: 'Krone',
  4: 'Brückenpfeiler',
  5: 'Brückenglied/Ersatz',
  6: 'Implantat',
}

const aitAktiv = (z: ZahnBefund) => {
  if (z.aitOverride != null) return z.aitOverride
  return z.st.some((w) => w != null && w >= 4)
}

function ZahnSpalte({
  zahn,
  z,
  obenOral,
  onChange,
}: {
  zahn: string
  z: ZahnBefund
  obenOral: boolean // Unterkiefer: oral-Reihe oben zeichnen (Spiegelbild)
  onChange: (next: ZahnBefund) => void
}) {
  const fehlt = z.zs === 1
  const setSt = (i: number, raw: string) => {
    const st = [...z.st]
    const v = raw === '' ? null : Math.max(0, Math.min(15, Math.round(Number(raw))))
    st[i] = Number.isNaN(v as number) ? null : v
    onChange({ ...z, st })
  }
  const toggleBop = (i: number) => {
    const bop = [...z.bop]
    bop[i] = !bop[i]
    onChange({ ...z, bop })
  }

  // Indizes: [mb,b,db] vestibulär, [mo,o,do] oral
  const vest = [0, 1, 2]
  const oral = [3, 4, 5]
  const Stelle = (i: number) => (
    <div className={`pc-stelle${z.st[i] != null && z.st[i]! >= 4 ? ' tief' : ''}`} key={i}>
      <input
        className="pc-st"
        value={z.st[i] ?? ''}
        onChange={(e) => setSt(i, e.target.value)}
        inputMode="numeric"
        disabled={fehlt}
        aria-label={`ST Stelle ${i + 1} Zahn ${zahn}`}
      />
      <button
        type="button"
        className={`pc-bop${z.bop[i] ? ' an' : ''}`}
        onClick={() => toggleBop(i)}
        disabled={fehlt}
        title="Sondierungsbluten (BOP)"
      >
        {z.bop[i] ? '●' : '○'}
      </button>
    </div>
  )

  const reiheVest = <div className="pc-reihe">{vest.map(Stelle)}</div>
  const reiheOral = <div className="pc-reihe">{oral.map(Stelle)}</div>

  return (
    <div className={`pc-spalte${fehlt ? ' fehlt' : ''}${aitAktiv(z) && !fehlt ? ' ait' : ''}`}>
      {obenOral ? reiheOral : reiheVest}
      <div className="pc-nr">{zahn}</div>
      <select
        className="pc-zs"
        value={z.zs}
        onChange={(e) => onChange({ ...z, zs: Number(e.target.value) as ZahnStatus })}
        title={ZS_LABEL[z.zs]}
      >
        {([0, 1, 2, 3, 4, 5, 6] as ZahnStatus[]).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {obenOral ? reiheVest : reiheOral}
      <div className="pc-grade">
        <select
          className="pc-lock"
          value={z.lockerung}
          onChange={(e) => onChange({ ...z, lockerung: Number(e.target.value) as Grad0123 })}
          disabled={fehlt}
          title="Lockerungsgrad"
        >
          {[0, 1, 2, 3].map((g) => (
            <option key={g} value={g}>
              L{g}
            </option>
          ))}
        </select>
        <select
          className="pc-fb"
          value={z.fb}
          onChange={(e) => onChange({ ...z, fb: Number(e.target.value) as Grad0123 })}
          disabled={fehlt}
          title="Furkationsbefall"
        >
          {[0, 1, 2, 3].map((g) => (
            <option key={g} value={g}>
              F{g}
            </option>
          ))}
        </select>
      </div>
      <div className={`pc-ait-zelle${aitAktiv(z) && !fehlt ? ' an' : ''}`} title="AIT (ST ≥ 4 mm)">
        <input
          type="checkbox"
          checked={aitAktiv(z)}
          onChange={(e) => onChange({ ...z, aitOverride: e.target.checked })}
          disabled={fehlt}
        />
      </div>
    </div>
  )
}

export default function PerioChart({ befund, onChange }: { befund: Befund; onChange: (b: Befund) => void }) {
  const setZahn = (zahn: string, next: ZahnBefund) => {
    onChange({ ...befund, zaehne: { ...befund.zaehne, [zahn]: next } })
  }
  return (
    <div className="perio">
      <div className="perio-legende">
        <span><b>ST</b> Sondierungstiefe mm</span>
        <span className="lg-bop">● BOP</span>
        <span className="lg-tief">ST ≥ 4 mm</span>
        <span>ZS 0–6 · L Lockerung · F Furkation · AIT = ST ≥ 4 mm</span>
      </div>
      <div className="perio-kiefer">
        <div className="perio-achse">
          <span>vest.</span>
          <span>Zahn</span>
          <span>oral</span>
          <span>L / F</span>
          <span>AIT</span>
        </div>
        <div className="perio-row">
          {OBERKIEFER.map((z) => (
            <ZahnSpalte key={z} zahn={z} z={befund.zaehne[z]} obenOral={false} onChange={(n) => setZahn(z, n)} />
          ))}
        </div>
      </div>
      <div className="perio-kiefer">
        <div className="perio-row">
          {UNTERKIEFER.map((z) => (
            <ZahnSpalte key={z} zahn={z} z={befund.zaehne[z]} obenOral={true} onChange={(n) => setZahn(z, n)} />
          ))}
        </div>
      </div>
    </div>
  )
}

import type { Zahn } from '../types'
import { BEFUND_KUERZEL, OBERKIEFER, PLANUNG_KUERZEL, UNTERKIEFER } from '../engine/zahnschema'

interface Props {
  zaehne: Record<string, Zahn>
  onChange: (zaehne: Record<string, Zahn>) => void
}

const SCHNELL: [string, string][] = [
  ['I', 'Implantat'], ['IS', 'Sofortimplantat'], ['IK', 'Implantat + Krone (ZE)'],
  ['IA', 'Implantat + Augmentation'], ['A', 'Augmentation'], ['EX', 'Extraktion'],
  ['OX', 'Osteotomie'], ['IF', 'Freilegung'],
]

export function Zahnschema({ zaehne, onChange }: Props) {
  const setzen = (zahn: string, aenderung: Partial<Zahn>) => {
    const neu: Zahn = { ...(zaehne[zahn] ?? { B: '', TP: '' }), ...aenderung }
    const kopie = { ...zaehne }
    if (!neu.B && !neu.TP) delete kopie[zahn]
    else kopie[zahn] = neu
    onChange(kopie)
  }

  const reihe = (kiefer: string[], oben: boolean) => {
    const mitte = (z: string) => z[1] === '1' && (z[0] === '2' || z[0] === '3')
    const zahlen = (
      <div className="zs-reihe zs-nummern">
        <span className="zs-label" />
        {kiefer.map((z) => <span key={z} className={`zs-nr ${mitte(z) ? 'mitte' : ''}`}>{z}</span>)}
      </div>
    )
    const feld = (f: 'B' | 'TP', label: string, liste: string) => (
      <div className={`zs-reihe zs-${f}`}>
        <span className="zs-label">{label}</span>
        {kiefer.map((z) => {
          const kuerzel = zaehne[z]?.[f] ?? ''
          const bekannt = f === 'B' ? BEFUND_KUERZEL[kuerzel.toLowerCase()] : PLANUNG_KUERZEL[kuerzel.toUpperCase()]
          return (
            <span key={z} className={`zs-zelle ${mitte(z) ? 'mitte' : ''}`}>
              <input
                className={`zs-feld ${kuerzel ? 'belegt' : ''} ${kuerzel && !bekannt ? 'unbekannt' : ''}`}
                value={kuerzel}
                list={liste}
                title={`${z}: ${bekannt ?? (kuerzel ? 'unbekanntes Kürzel' : label)}`}
                aria-label={`${label} Zahn ${z}`}
                onChange={(e) => {
                  const v = e.target.value.trim()
                  setzen(z, f === 'B' ? { B: v.toLowerCase() } : { TP: v.toUpperCase() })
                }}
              />
            </span>
          )
        })}
      </div>
    )
    return oben
      ? <>{feld('TP', 'Planung', 'kuerzel-planung')}{feld('B', 'Befund', 'kuerzel-befund')}{zahlen}</>
      : <>{zahlen}{feld('B', 'Befund', 'kuerzel-befund')}{feld('TP', 'Planung', 'kuerzel-planung')}</>
  }

  return (
    <div className="zahnschema">
      <datalist id="kuerzel-befund">
        {Object.entries(BEFUND_KUERZEL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </datalist>
      <datalist id="kuerzel-planung">
        {Object.entries(PLANUNG_KUERZEL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </datalist>
      <div className="zs-kiefer">{reihe(OBERKIEFER, true)}</div>
      <div className="zs-trenner"><span>rechts</span><span>links</span></div>
      <div className="zs-kiefer">{reihe(UNTERKIEFER, false)}</div>
      <div className="zs-hilfe">
        <span>Häufige Planungen:</span>
        {SCHNELL.map(([k, t]) => <span key={k} className="chip" title={t}><b>{k}</b> {t}</span>)}
      </div>
    </div>
  )
}

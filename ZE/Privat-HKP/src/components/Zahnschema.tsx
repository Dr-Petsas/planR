import type { Zahn } from '../types'
import { BEFUND_KUERZEL, OBERKIEFER, PLANUNG_KUERZEL, UNTERKIEFER } from '../engine/zahnschema'
import { brueckenBereiche, markeAnzeigen, markeLesen } from '../engine/bruecken'

interface Props {
  zaehne: Record<string, Zahn>
  onChange: (zaehne: Record<string, Zahn>) => void
}

const SCHNELL: [string, string][] = [
  ['KM', 'Vollkeramikkrone'], ['KV', 'Verblendkrone'], ['K', 'Metallkrone'], ['PKM', 'Keramik-Teilkrone'], ['VE', 'Veneer'],
  ['BM', 'Keramik-Brückenglied'], ['SKM', 'Implantatkrone'], ['T', 'Teleskop'], ['E', 'Prothesenzahn'],
]

type Lage = { anfang: boolean; ende: boolean; explizit: boolean }

function brueckenLagen(zaehne: Record<string, Zahn>): Record<string, Lage> {
  const lagen: Record<string, Lage> = {}
  for (const reihe of [OBERKIEFER, UNTERKIEFER]) {
    const bereiche = brueckenBereiche(reihe, (z) => (zaehne[z]?.TP ?? '').trim().toUpperCase(), (z) => zaehne[z])
    for (const b of bereiche) {
      if (b.zaehne.length < 2) continue
      b.zaehne.forEach((z, i) => {
        const alt = lagen[z]
        lagen[z] = {
          anfang: (alt?.anfang ?? false) || i === 0,
          ende: (alt?.ende ?? false) || i === b.zaehne.length - 1,
          explizit: (alt?.explizit ?? false) || b.explizit,
        }
      })
    }
  }
  return lagen
}

export function Zahnschema({ zaehne, onChange }: Props) {
  const lagen = brueckenLagen(zaehne)
  const setzen = (zahn: string, aenderung: Partial<Zahn>) => {
    const neu: Zahn = { ...(zaehne[zahn] ?? { B: '', TP: '' }), ...aenderung }
    const kopie = { ...zaehne }
    if (!neu.B && !neu.TP && !neu.bAnfang && !neu.bEnde) delete kopie[zahn]
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
          const wert = f === 'TP' ? markeAnzeigen(kuerzel, zaehne[z]) : kuerzel
          const bekannt = f === 'B' ? BEFUND_KUERZEL[kuerzel.toLowerCase()] : PLANUNG_KUERZEL[kuerzel.toUpperCase()]
          const lage = f === 'TP' ? lagen[z] : undefined
          const zelle = [
            'zs-zelle', mitte(z) && 'mitte', lage && 'br', lage?.anfang && 'br-anfang', lage?.ende && 'br-ende',
            lage && !lage.explizit && 'br-auto', !oben && 'br-unten',
          ].filter(Boolean).join(' ')
          const brueckenTitel = lage ? ` – Brücke${lage.anfang ? 'nanfang' : lage.ende ? 'nende' : ''}${lage.explizit ? '' : ' (automatisch erkannt; mit „-K … K-“ festlegen)'}` : ''
          return (
            <span key={z} className={zelle}>
              <input
                className={`zs-feld ${wert ? 'belegt' : ''} ${kuerzel && !bekannt ? 'unbekannt' : ''}`}
                value={wert}
                list={liste}
                title={`${z}: ${bekannt ?? (kuerzel ? 'unbekanntes Kürzel' : label)}${brueckenTitel}`}
                aria-label={`${label} Zahn ${z}`}
                onChange={(e) => {
                  const v = e.target.value.trim()
                  if (f === 'B') return setzen(z, { B: v.toLowerCase() })
                  const m = markeLesen(v.toUpperCase())
                  setzen(z, { TP: m.kuerzel, bAnfang: m.bAnfang, bEnde: m.bEnde })
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
        <span className="chip" title="Brückenanfang und -ende mit Bindestrich markieren, z. B. -KM BM KM- oder Doppelanker -KM KM BM KM-"><b>-K … K-</b> Brücke festlegen</span>
      </div>
    </div>
  )
}

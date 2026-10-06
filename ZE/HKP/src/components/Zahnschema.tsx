import type { ZahnZeilen } from '../types'
import { BEFUND_KUERZEL, OBERKIEFER, THERAPIE_KUERZEL, UNTERKIEFER, imVerblendbereich } from '../engine/zahnschema'
import { brueckenBereiche, markeAnzeigen, markeLesen } from '../engine/bruecken'

type Zeile = 'B' | 'R' | 'TP'

const ZEILEN_NAME: Record<Zeile, string> = { TP: 'Therapieplanung', R: 'Regelversorgung', B: 'Befund' }

interface Props {
  zaehne: Record<string, ZahnZeilen>
  onChange: (zahn: string, aenderung: Partial<ZahnZeilen>) => void
}

function gueltig(zeile: Zeile, kuerzel: string) {
  if (!kuerzel.trim()) return true
  return zeile === 'B' ? kuerzel.trim().toLowerCase() in BEFUND_KUERZEL : kuerzel.trim().toUpperCase() in THERAPIE_KUERZEL
}

/** Lage eines Zahnes in einer Brücke – für die Klammer im Zahnschema */
type Lage = { anfang: boolean; ende: boolean; explizit: boolean }

function brueckenLagen(zaehne: Record<string, ZahnZeilen>, zeile: 'TP' | 'R'): Record<string, Lage> {
  const lagen: Record<string, Lage> = {}
  for (const reihe of [OBERKIEFER, UNTERKIEFER]) {
    const kuerzel = (z: string) => (zaehne[z]?.[zeile] ?? '').trim().toUpperCase()
    const bereiche = brueckenBereiche(reihe, kuerzel, (z) => (zeile === 'TP' ? zaehne[z] : undefined))
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

function Zelle({ zahn, zeile, daten, lage, onChange }: { zahn: string; zeile: Zeile; daten: ZahnZeilen | undefined; lage?: Lage; onChange: Props['onChange'] }) {
  const kuerzel = daten?.[zeile] ?? ''
  const wert = zeile === 'TP' ? markeAnzeigen(kuerzel, daten) : kuerzel
  const ok = gueltig(zeile, kuerzel)
  const beschreibung = zeile === 'B' ? BEFUND_KUERZEL[kuerzel.trim().toLowerCase()] : THERAPIE_KUERZEL[kuerzel.trim().toUpperCase()]
  const brueckenTitel = lage ? ` – Brücke${lage.anfang ? 'nanfang' : lage.ende ? 'nende' : ''}${lage.explizit ? '' : ' (automatisch erkannt; mit „-K … K-“ festlegen)'}` : ''
  const klassen = [
    `zs-zelle zs-${zeile}`,
    imVerblendbereich(zahn) && 'verblend',
    lage && 'br',
    lage?.anfang && 'br-anfang',
    lage?.ende && 'br-ende',
    lage && !lage.explizit && 'br-auto',
  ].filter(Boolean).join(' ')
  return (
    <td className={klassen}>
      <input
        value={wert}
        list={zeile === 'B' ? 'kuerzel-befund' : 'kuerzel-therapie'}
        aria-label={`${ZEILEN_NAME[zeile]} Zahn ${zahn}`}
        title={ok ? `${beschreibung ?? `${ZEILEN_NAME[zeile]} ${zahn}`}${brueckenTitel}` : `Ungültiges Kürzel „${kuerzel}“`}
        className={ok ? '' : 'ungueltig'}
        onChange={(e) => {
          const v = e.target.value
          if (zeile === 'B') return onChange(zahn, { B: v.toLowerCase() })
          if (zeile === 'R') return onChange(zahn, { R: v.toUpperCase() })
          const m = markeLesen(v.toUpperCase())
          onChange(zahn, { TP: m.kuerzel, bAnfang: m.bAnfang, bEnde: m.bEnde })
        }}
      />
    </td>
  )
}

const LINKS_OK = OBERKIEFER.slice(0, 8)
const RECHTS_OK = OBERKIEFER.slice(8)
const LINKS_UK = UNTERKIEFER.slice(0, 8)
const RECHTS_UK = UNTERKIEFER.slice(8)

export function Zahnschema({ zaehne, onChange }: Props) {
  const lagen = { TP: brueckenLagen(zaehne, 'TP'), R: brueckenLagen(zaehne, 'R'), B: {} as Record<string, Lage> }
  const zeile = (links: string[], rechts: string[], z: Zeile, erste = false) => (
    <tr key={z + links[0]}>
      {erste && <th className="zs-art" rowSpan={8}><span>Art der Versorgung</span></th>}
      <th className="zs-label" title={ZEILEN_NAME[z]}>{z}</th>
      {links.map((n) => <Zelle key={n} zahn={n} zeile={z} daten={zaehne[n]} lage={lagen[z][n]} onChange={onChange} />)}
      <td className="zs-luecke" />
      {rechts.map((n) => <Zelle key={n} zahn={n} zeile={z} daten={zaehne[n]} lage={lagen[z][n]} onChange={onChange} />)}
      {erste && <th className="zs-hinweis" rowSpan={8}><span>Der Befund ist bei Wiederherstellungs&shy;maßnahmen nicht auszufüllen!</span></th>}
    </tr>
  )
  const nummern = (links: string[], rechts: string[]) => (
    <tr className="zs-nummern">
      <th className="zs-label" />
      {links.map((n) => <td key={n} className={imVerblendbereich(n) ? 'verblend' : ''}>{n}</td>)}
      <td className="zs-luecke" />
      {rechts.map((n) => <td key={n} className={imVerblendbereich(n) ? 'verblend' : ''}>{n}</td>)}
    </tr>
  )
  return (
    <div className="zahnschema-wrap">
      <table className="zahnschema">
        <tbody>
          {zeile(LINKS_OK, RECHTS_OK, 'TP', true)}
          {zeile(LINKS_OK, RECHTS_OK, 'R')}
          {zeile(LINKS_OK, RECHTS_OK, 'B')}
          {nummern(LINKS_OK, RECHTS_OK)}
          {nummern(LINKS_UK, RECHTS_UK)}
          {zeile(LINKS_UK, RECHTS_UK, 'B')}
          {zeile(LINKS_UK, RECHTS_UK, 'R')}
          {zeile(LINKS_UK, RECHTS_UK, 'TP')}
        </tbody>
      </table>
      <datalist id="kuerzel-befund">
        {Object.entries(BEFUND_KUERZEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </datalist>
      <datalist id="kuerzel-therapie">
        {Object.entries(THERAPIE_KUERZEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </datalist>
    </div>
  )
}

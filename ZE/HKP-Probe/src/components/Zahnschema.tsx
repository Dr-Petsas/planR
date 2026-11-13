import type { ZahnZeilen } from '@kern/types'
import { BEFUND_KUERZEL, OBERKIEFER, THERAPIE_KUERZEL, UNTERKIEFER, imVerblendbereich } from '@kern/engine/zahnschema'
import { befundOhneStrich, brueckenLagen, markeLesen, planungText } from '@kern/engine/bruecken'

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

/** Lage eines Zahnes in einer Brücke – für die Klammer im Zahnschema. Der Strich gehört nur in die Planung. */
type Lage = { anfang: boolean; ende: boolean; explizit: boolean }

function lagenDerPlanung(zaehne: Record<string, ZahnZeilen>, zeile: 'TP' | 'R'): Record<string, Lage> {
  const lagen: Record<string, Lage> = {}
  for (const reihe of [OBERKIEFER, UNTERKIEFER]) {
    const gelesen = (z: string) => markeLesen((zaehne[z]?.[zeile] ?? '').toUpperCase())
    Object.assign(lagen, brueckenLagen(
      reihe,
      (z) => gelesen(z).kuerzel,
      (z) => {
        const m = gelesen(z)
        const flags = zeile === 'TP' ? zaehne[z] : undefined
        return { bAnfang: m.bAnfang || flags?.bAnfang, bEnde: m.bEnde || flags?.bEnde }
      },
    ))
  }
  return lagen
}

function Zelle({ zahn, zeile, daten, lage, onChange }: { zahn: string; zeile: Zeile; daten: ZahnZeilen | undefined; lage?: Lage; onChange: Props['onChange'] }) {
  const roh = daten?.[zeile] ?? ''
  const kuerzel = zeile === 'B' ? befundOhneStrich(roh) : markeLesen(roh.toUpperCase()).kuerzel
  const wert = zeile === 'B' ? kuerzel : planungText(kuerzel, lage)
  const ok = gueltig(zeile, kuerzel)
  const beschreibung = zeile === 'B' ? BEFUND_KUERZEL[kuerzel.trim().toLowerCase()] : THERAPIE_KUERZEL[kuerzel.trim().toUpperCase()]
  const brueckenTitel = lage ? ` – Brücke${lage.anfang ? 'nanfang' : lage.ende ? 'nende' : ''}${lage.explizit ? '' : ' (automatisch erkannt; mit „-K … K-“ festlegen)'}` : ''
  const klassen = [
    `zs-zelle zs-${zeile}`,
    imVerblendbereich(zahn) && 'verblend',
    lage && 'br',
    lage && (zahn[0] === '3' || zahn[0] === '4') && 'br-uk',
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
          if (zeile === 'B') return onChange(zahn, { B: befundOhneStrich(v) })
          if (zeile === 'R') return onChange(zahn, { R: v.toUpperCase().replace(/^-+|-+$/g, '') })
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
  const lagen = { TP: lagenDerPlanung(zaehne, 'TP'), R: lagenDerPlanung(zaehne, 'R'), B: {} as Record<string, Lage> }
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

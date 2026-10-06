import {
  EINHEIT_TITEL, MATERIAL_STAND, WERKSTOFFE, WERKSTOFFE_FUER, materialSchaetzung, werkstoffVon,
  type KronenEinheit, type Werkstoff,
} from '../engine/material'

const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const zahlDe = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })

interface Props {
  einheiten: KronenEinheit[]
  wahl: Record<string, Werkstoff>
  onChange: (w: Record<string, Werkstoff>) => void
}

/** Kronenmaterial je Einheit; ohne Wahl gilt NEM bzw. Zirkon/Presskeramik als Annahme. */
export function KronenmaterialFelder({ einheiten, wahl, onChange }: Props) {
  const setzen = (zaehne: string[], w: Werkstoff) => onChange({ ...wahl, ...Object.fromEntries(zaehne.map((z) => [z, w])) })
  return (
    <>
      {(['metall', 'keramik'] as const).map((art) => {
        const es = einheiten.filter((e) => e.art === art)
        if (!es.length) return null
        return (
          <div key={art} className="km-gruppe">
            <div className="be-feld be-feld-breit">
              <b className="be-nr">{art === 'metall' ? 'Me' : 'Ke'}</b>
              <span>{art === 'metall' ? 'Legierung' : 'Keramik'} <small className="be-klein">– für alle</small></span>
              <span className="be-schalter-gruppe">
                {WERKSTOFFE_FUER[art].map((w) => {
                  const alle = es.every((e) => wahl[e.zahn] === w)
                  return (
                    <button key={w} className={`be-schalter${alle ? ' aktiv' : ''}`} aria-pressed={alle} title={`${WERKSTOFFE[w].titel} – ${WERKSTOFFE[w].quelle}`}
                      onClick={() => setzen(es.map((e) => e.zahn), w)}>{WERKSTOFFE[w].kurz}</button>
                  )
                })}
              </span>
            </div>
            <table className="tabelle km-tabelle">
              <tbody>
                {es.map((e) => {
                  const { werkstoff, gewaehlt } = werkstoffVon(e, wahl)
                  const s = materialSchaetzung(e, werkstoff)
                  const inBel = e.ebene === 'BEL' && werkstoff === 'nem'
                  return (
                    <tr key={e.zahn} className={gewaehlt ? '' : 'km-offen'}>
                      <td style={{ width: '4ch' }}><b>{e.zahn}</b></td>
                      <td>{EINHEIT_TITEL[e.einheit]}</td>
                      <td>
                        <select value={gewaehlt ? werkstoff : ''} title={WERKSTOFFE[werkstoff].titel} onChange={(ev) => setzen([e.zahn], ev.target.value as Werkstoff)}>
                          {!gewaehlt && <option value="">{WERKSTOFFE[werkstoff].kurz} (angenommen)</option>}
                          {WERKSTOFFE_FUER[art].map((w) => <option key={w} value={w} title={WERKSTOFFE[w].titel}>{WERKSTOFFE[w].kurz}</option>)}
                        </select>
                      </td>
                      <td className="r klein">
                        {inBel ? 'in BEL enthalten' : art === 'metall' ? `ca. ${zahlDe(s.menge)} g · ${euro(s.betrag)}` : euro(s.betrag)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
      <p className="be-hinweis">
        Mittlere Marktpreise netto (Stand {MATERIAL_STAND}). Edelmetall wird nach tatsächlichem Gewicht und Tagespreis am
        Verarbeitungstag abgerechnet{einheiten.some((e) => e.ebene === 'BEL') ? '; NEM ist bei BEL-II-Leistungen bereits enthalten' : ''}.
      </p>
    </>
  )
}

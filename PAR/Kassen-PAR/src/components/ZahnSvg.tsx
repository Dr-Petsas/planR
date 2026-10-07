import { memo } from 'react'
import {
  EINHEITEN_JE_MM, KH, KRONEN_LINIEN, KW, NACHBAR_ABSTAND, WURZEL_H, istOberkiefer, linkerIndex,
  lockerungsFeld, segmente, wurzelPfade,
} from '../engine/zahnform'
import type { ZahnBefund } from '../types'

const ROEMISCH = ['', 'I', 'II', 'III']

interface Props {
  fdi: number
  befund: ZahnBefund
  aktivSeg: number | null
  onSeg: (stIndex: number) => void
  onLockerung: () => void
  /** Taschentiefe der linken Messstelle des rechten Nachbarzahns (null = Linie endet hier) */
  rechterNachbar: number | null
}

/** Ein Zahn als SVG: Wurzel, Krone mit Messhälften mesial/distal, zentrales Lockerungsfeld. */
function ZahnSvgInner({ fdi, befund, aktivSeg, onSeg, onLockerung, rechterNachbar }: Props) {
  const ok = istOberkiefer(fdi)
  const segs = segmente(fdi)
  const wurzeln = wurzelPfade(fdi)
  const kroneY = ok ? WURZEL_H : 0
  const fehlt = befund.zs === 1
  const nichtErh = befund.zs === 2

  // Knochenlinie: Taschentiefe von der Kronenkante in den Wurzelbereich abgetragen.
  const tiefeY = (mm: number) => (ok ? -mm * EINHEITEN_JE_MM : KH + mm * EINHEITEN_JE_MM)
  const li = linkerIndex(fdi)
  const xL = segs.find((s) => s.stIndex === li)!.mitte[0]
  const xR = segs.find((s) => s.stIndex !== li)!.mitte[0]
  const stL = fehlt ? null : befund.st[li]
  const stR = fehlt ? null : befund.st[1 - li]
  const linie: string[] = []
  if (stL != null && stR != null) linie.push(`M ${xL},${tiefeY(stL)} L ${xR},${tiefeY(stR)}`)
  if (stR != null && rechterNachbar != null) linie.push(`M ${xR},${tiefeY(stR)} L ${NACHBAR_ABSTAND + xL},${tiefeY(rechterNachbar)}`)

  return (
    <svg viewBox={`-1 -1 ${KW + 2} ${KH + WURZEL_H + 2}`} className="zahn-svg" role="img">
      <g transform={`translate(0 ${kroneY})`} opacity={fehlt ? 0.35 : 1}>
        {/* Wurzeln (gestrichelt) */}
        {wurzeln.map((d, i) => (
          <path key={`w${i}`} d={d} className="zahn-wurzel" />
        ))}
        {linie.length > 0 && <path d={linie.join(' ')} className="knochenlinie" />}
        {stL != null && stR == null && <circle cx={xL} cy={tiefeY(stL)} r={0.9} className="knochenlinie" />}
        {stR != null && stL == null && rechterNachbar == null && <circle cx={xR} cy={tiefeY(stR)} r={0.9} className="knochenlinie" />}
        {/* Kronen-Umriss */}
        <rect x={0} y={0} width={KW} height={KH} rx={4} ry={4} className="zahn-krone" />
        {/* Segment-Linien */}
        {KRONEN_LINIEN.map(([x1, y1, x2, y2], i) => (
          <line key={`l${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className="zahn-linie" />
        ))}
        {/* zentrales Lockerungsfeld */}
        <rect
          x={lockerungsFeld.x} y={lockerungsFeld.y} width={lockerungsFeld.w} height={lockerungsFeld.h}
          className="zahn-lock" onClick={(e) => { e.stopPropagation(); onLockerung() }}
        />
        {befund.lockerung > 0 && (
          <text x={lockerungsFeld.x + lockerungsFeld.w / 2} y={lockerungsFeld.y + lockerungsFeld.h / 2}
            className="zahn-lock-text" textAnchor="middle" dominantBaseline="central">
            {ROEMISCH[befund.lockerung]}
          </text>
        )}
        {/* Mess-Segmente */}
        {!fehlt && segs.map((s) => {
          const wert = befund.st[s.stIndex]
          const bop = befund.bop[s.stIndex]
          const aktiv = aktivSeg === s.stIndex
          const tief = wert != null && wert >= 4
          return (
            <g key={s.stIndex}>
              <polygon
                points={s.poly}
                className={`zahn-seg${aktiv ? ' aktiv' : ''}${tief ? ' tief' : ''}`}
                onClick={(e) => { e.stopPropagation(); onSeg(s.stIndex) }}
              >
                <title>{s.label}</title>
              </polygon>
              {wert != null && (
                <text x={s.mitte[0]} y={s.mitte[1]} className={`zahn-st${tief ? ' tief' : ''}`}
                  textAnchor="middle" dominantBaseline="central" pointerEvents="none">
                  {wert}{bop ? '*' : ''}
                </text>
              )}
            </g>
          )
        })}
        {/* fehlender Zahn: durchkreuzen */}
        {fehlt && (
          <g className="zahn-fehlt">
            <line x1={2} y1={2} x2={KW - 2} y2={KH - 2} />
            <line x1={KW - 2} y1={2} x2={2} y2={KH - 2} />
          </g>
        )}
        {/* nicht erhaltungswuerdig: durchstreichen */}
        {nichtErh && (
          <g className="zahn-nichterh">
            <line x1={1} y1={9} x2={KW - 1} y2={9} />
            <line x1={1} y1={15} x2={KW - 1} y2={15} />
            <line x1={1} y1={21} x2={KW - 1} y2={21} />
          </g>
        )}
      </g>
    </svg>
  )
}

export const ZahnSvg = memo(ZahnSvgInner)

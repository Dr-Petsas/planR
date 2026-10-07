import { useCallback, useEffect, useRef, useState } from 'react'
import { OBERKIEFER, UNTERKIEFER, hatFbFeld } from '../engine/zahnschema'
import type { Befund, Grad0123, ZahnBefund, ZahnStatus } from '../types'
import { ZahnSvg } from './ZahnSvg'

const ALLE = [...OBERKIEFER, ...UNTERKIEFER]
const ROEMISCH = ['0', 'I', 'II', 'III']

interface Props {
  befund: Befund
  onChange: (b: Befund) => void
  readOnly?: boolean
}

interface Aktiv { zahn: string; seg: number }

export function Blatt2Chart({ befund, onChange, readOnly }: Props) {
  const [aktiv, setAktiv] = useState<Aktiv | null>(null)
  const [puffer, setPuffer] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  const setZahn = useCallback((zahn: string, patch: Partial<ZahnBefund>) => {
    const z = befund.zaehne[zahn]
    onChange({ ...befund, zaehne: { ...befund.zaehne, [zahn]: { ...z, ...patch } } })
  }, [befund, onChange])

  const setSt = useCallback((zahn: string, seg: number, wert: number | null) => {
    const z = befund.zaehne[zahn]
    const st = [...z.st]
    st[seg] = wert
    setZahn(zahn, { st })
  }, [befund, setZahn])

  const toggleBop = useCallback((zahn: string, seg: number) => {
    const z = befund.zaehne[zahn]
    const bop = [...z.bop]
    bop[seg] = !bop[seg]
    setZahn(zahn, { bop })
  }, [befund, setZahn])

  const wechsle = useCallback((dTooth: number, dSeg: number) => {
    setAktiv((a) => {
      if (!a) return { zahn: ALLE[0], seg: 0 }
      let ti = ALLE.indexOf(a.zahn)
      let seg = a.seg + dSeg
      if (seg > 1) { seg = 0; ti += 1 }
      if (seg < 0) { seg = 1; ti -= 1 }
      ti += dTooth
      ti = Math.max(0, Math.min(ALLE.length - 1, ti))
      return { zahn: ALLE[ti], seg }
    })
    setPuffer('')
  }, [])

  useEffect(() => { setPuffer('') }, [aktiv?.zahn, aktiv?.seg])

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (readOnly || !aktiv) return
    const { zahn, seg } = aktiv
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault()
      const neu = puffer.length === 1 && Number(puffer + e.key) <= 15 ? puffer + e.key : e.key
      setPuffer(neu)
      setSt(zahn, seg, Number(neu))
      return
    }
    switch (e.key) {
      case '*': case '+': case ' ':
        e.preventDefault(); toggleBop(zahn, seg); break
      case 'Backspace': case 'Delete':
        e.preventDefault(); setSt(zahn, seg, null); setPuffer(''); break
      case 'Enter': case 'ArrowDown':
        e.preventDefault(); wechsle(16, 0); break
      case 'ArrowUp':
        e.preventDefault(); wechsle(-16, 0); break
      case 'Tab':
        e.preventDefault(); wechsle(0, e.shiftKey ? -1 : 1); break
      case 'ArrowRight':
        e.preventDefault(); wechsle(0, 1); break
      case 'ArrowLeft':
        e.preventDefault(); wechsle(0, -1); break
    }
  }, [aktiv, puffer, readOnly, setSt, toggleBop, wechsle])

  const zsCycle = (zahn: string) => {
    if (readOnly) return
    const z = befund.zaehne[zahn]
    setZahn(zahn, { zs: ((z.zs + 1) % 7) as ZahnStatus })
  }
  const aitCycle = (zahn: string) => {
    if (readOnly) return
    const z = befund.zaehne[zahn]
    // null (auto) -> true -> false -> null
    const next = z.aitOverride == null ? true : z.aitOverride ? false : null
    setZahn(zahn, { aitOverride: next })
  }
  const fbCycle = (zahn: string) => {
    if (readOnly) return
    const z = befund.zaehne[zahn]
    setZahn(zahn, { fb: ((z.fb + 1) % 4) as Grad0123 })
  }
  const lockCycle = (zahn: string) => {
    if (readOnly) return
    const z = befund.zaehne[zahn]
    setZahn(zahn, { lockerung: ((z.lockerung + 1) % 4) as Grad0123 })
  }

  const aitAktiv = (z: ZahnBefund) =>
    z.aitOverride == null ? z.st.some((w) => w != null && w >= 4) : z.aitOverride

  const zsZelle = (zahn: string) => {
    const z = befund.zaehne[zahn]
    return (
      <button type="button" className="gitter-zelle zs" onClick={() => zsCycle(zahn)} title="Zahnstatus 0-6">
        {z.zs > 0 ? z.zs : ''}
      </button>
    )
  }
  const aitZelle = (zahn: string) => {
    const z = befund.zaehne[zahn]
    const an = aitAktiv(z)
    const forced = z.aitOverride != null
    return (
      <button type="button" className={`gitter-zelle ait${an ? ' an' : ''}${forced ? ' forced' : ''}`}
        onClick={() => aitCycle(zahn)} title="AIT: automatisch / ja / nein">
        {an ? 'x' : ''}
      </button>
    )
  }
  const fbZelle = (zahn: string) => {
    if (!hatFbFeld(zahn)) return <div className="gitter-zelle leer" />
    const z = befund.zaehne[zahn]
    return (
      <button type="button" className="gitter-zelle fb" onClick={() => fbCycle(zahn)} title="Furkationsbefall 0-III">
        {z.fb > 0 ? ROEMISCH[z.fb] : ''}
      </button>
    )
  }

  const zahnZelle = (zahn: string) => (
    <div className={`zahn-zelle${ALLE.indexOf(zahn) === 7 || ALLE.indexOf(zahn) === 23 ? ' mitte' : ''}`}>
      <div className="zahn-nr">{zahn}</div>
      <ZahnSvg
        fdi={Number(zahn)}
        befund={befund.zaehne[zahn]}
        aktivSeg={aktiv?.zahn === zahn ? aktiv.seg : null}
        onSeg={(seg) => { if (!readOnly) setAktiv({ zahn, seg }) }}
        onLockerung={() => lockCycle(zahn)}
      />
    </div>
  )

  return (
    <div className="blatt2-chart" ref={boxRef} tabIndex={0} onKeyDown={onKey}>
      {/* Oberkiefer */}
      <div className="gitter ok">
        <div className="gitter-reihe"><span className="gitter-label">ZS</span>{OBERKIEFER.map((z) => <div key={z}>{zsZelle(z)}</div>)}<span className="gitter-label">ZS</span></div>
        <div className="gitter-reihe"><span className="gitter-label">AIT</span>{OBERKIEFER.map((z) => <div key={z}>{aitZelle(z)}</div>)}<span className="gitter-label">AIT</span></div>
        <div className="gitter-reihe"><span className="gitter-label">FB</span>{OBERKIEFER.map((z) => <div key={z}>{fbZelle(z)}</div>)}<span className="gitter-label">FB</span></div>
      </div>
      <div className="kiefer-label">Oberkiefer</div>
      <div className="zahn-reihe ok">{OBERKIEFER.map((z) => <div key={z}>{zahnZelle(z)}</div>)}</div>
      <div className="seiten-label"><span>rechts</span><span>links</span></div>
      <div className="zahn-reihe uk">{UNTERKIEFER.map((z) => <div key={z}>{zahnZelle(z)}</div>)}</div>
      <div className="kiefer-label">Unterkiefer</div>
      {/* Unterkiefer-Reihen (FB, AIT, ZS) */}
      <div className="gitter uk">
        <div className="gitter-reihe"><span className="gitter-label">FB</span>{UNTERKIEFER.map((z) => <div key={z}>{fbZelle(z)}</div>)}<span className="gitter-label">FB</span></div>
        <div className="gitter-reihe"><span className="gitter-label">AIT</span>{UNTERKIEFER.map((z) => <div key={z}>{aitZelle(z)}</div>)}<span className="gitter-label">AIT</span></div>
        <div className="gitter-reihe"><span className="gitter-label">ZS</span>{UNTERKIEFER.map((z) => <div key={z}>{zsZelle(z)}</div>)}<span className="gitter-label">ZS</span></div>
      </div>
      {!readOnly && (
        <p className="chart-hilfe keindruck">
          Je Zahn zwei Messstellen: mesiale bzw. distale Kronenhälfte anklicken, dann Zahl tippen (0-15).
          <b> *</b> oder Leertaste = Sondierungsbluten, <b>Tab</b>/Pfeile = nächste Messstelle, <b>Entf</b> = löschen.
          ZS/AIT/FB-Felder und das Lockerungsfeld in der Zahnmitte durch Klick weiterschalten.
        </p>
      )}
    </div>
  )
}

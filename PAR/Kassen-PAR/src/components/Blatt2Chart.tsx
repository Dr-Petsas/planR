import { useCallback, useEffect, useRef, useState } from 'react'
import { OBERKIEFER, UNTERKIEFER, hatFbFeld } from '../engine/zahnschema'
import { linkerIndex } from '../engine/zahnform'
import type { Befund, Grad0123, ZahnBefund, ZahnStatus } from '../types'
import { ZahnSvg } from './ZahnSvg'

const ALLE = [...OBERKIEFER, ...UNTERKIEFER]
/** Messstellen in Bildschirm-Reihenfolge: je Kiefer von links nach rechts. */
const POS = ALLE.flatMap((zahn) => {
  const li = linkerIndex(Number(zahn))
  return [{ zahn, seg: li }, { zahn, seg: 1 - li }]
})
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

  /** Mehrere Messwerte in EINER Aenderung (sonst ueberschreibt der zweite den ersten). */
  const setSt = useCallback((werte: { zahn: string; seg: number; wert: number | null }[]) => {
    const zaehne = { ...befund.zaehne }
    for (const { zahn, seg, wert } of werte) {
      const st = [...zaehne[zahn].st]
      st[seg] = wert
      zaehne[zahn] = { ...zaehne[zahn], st }
    }
    onChange({ ...befund, zaehne })
  }, [befund, onChange])

  const toggleBop = useCallback((zahn: string, seg: number) => {
    const z = befund.zaehne[zahn]
    const bop = [...z.bop]
    bop[seg] = !bop[seg]
    setZahn(zahn, { bop })
  }, [befund, setZahn])

  /** Messstelle `d` Schritte weiter in Bildschirm-Reihenfolge; fehlende Zaehne werden uebersprungen. */
  const schritt = useCallback((a: Aktiv, d: number): Aktiv => {
    let i = POS.findIndex((p) => p.zahn === a.zahn && p.seg === a.seg)
    const richtung = Math.sign(d)
    for (let n = Math.abs(d); n > 0;) {
      const j = i + richtung
      if (j < 0 || j >= POS.length) break
      i = j
      if (befund.zaehne[POS[i].zahn].zs !== 1) n--
    }
    return POS[i]
  }, [befund])

  const wechsle = useCallback((d: number) => {
    setAktiv((a) => (a ? schritt(a, d) : POS[0]))
    setPuffer('')
  }, [schritt])
  /** Gleiche Messstelle im anderen Kiefer (eine Bildschirmzeile = 32 Messstellen). */
  const kieferWechsel = useCallback((d: number) => {
    setAktiv((a) => {
      if (!a) return POS[0]
      const i = POS.findIndex((p) => p.zahn === a.zahn && p.seg === a.seg) + d
      return POS[Math.max(0, Math.min(POS.length - 1, i))]
    })
    setPuffer('')
  }, [])

  const zehnerTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(zehnerTimer.current), [])
  useEffect(() => { setPuffer('') }, [aktiv?.zahn, aktiv?.seg])

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (readOnly || !aktiv) return
    const { zahn, seg } = aktiv
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault()
      window.clearTimeout(zehnerTimer.current)
      const k = Number(e.key)
      if (puffer === '1' && k <= 5) {
        setSt([{ zahn, seg, wert: 10 + k }])
        wechsle(1)
      } else if (puffer === '1') {
        // "1" bleibt stehen, die neue Ziffer gehoert schon zur naechsten Messstelle
        const naechste = schritt(aktiv, 1)
        setSt([{ zahn, seg, wert: 1 }, { ...naechste, wert: k }])
        setAktiv(schritt(naechste, 1))
      } else if (k === 1) {
        // 10-15 moeglich: kurz auf die zweite Ziffer warten
        setSt([{ zahn, seg, wert: 1 }])
        setPuffer('1')
        zehnerTimer.current = window.setTimeout(() => wechsle(1), 900)
      } else {
        setSt([{ zahn, seg, wert: k }])
        wechsle(1)
      }
      return
    }
    switch (e.key) {
      case '*': case '+': case ' ':
        e.preventDefault(); toggleBop(zahn, seg); break
      case 'Backspace': case 'Delete':
        e.preventDefault(); window.clearTimeout(zehnerTimer.current); setSt([{ zahn, seg, wert: null }]); setPuffer(''); break
      case 'Enter': case 'ArrowDown':
        e.preventDefault(); kieferWechsel(32); break
      case 'ArrowUp':
        e.preventDefault(); kieferWechsel(-32); break
      case 'Tab':
        e.preventDefault(); wechsle(e.shiftKey ? -1 : 1); break
      case 'ArrowRight':
        e.preventDefault(); wechsle(1); break
      case 'ArrowLeft':
        e.preventDefault(); wechsle(-1); break
    }
  }, [aktiv, puffer, readOnly, schritt, setSt, toggleBop, wechsle, kieferWechsel])

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

  /** Knochenlinie laeuft nur zum direkt rechts stehenden, vorhandenen Nachbarzahn weiter. */
  const rechterNachbar = (reihe: string[], zahn: string): number | null => {
    const n = reihe[reihe.indexOf(zahn) + 1]
    if (!n || befund.zaehne[n].zs === 1) return null
    return befund.zaehne[n].st[linkerIndex(Number(n))]
  }

  const zahnZelle = (zahn: string, reihe: string[]) => (
    <div className={`zahn-zelle${ALLE.indexOf(zahn) === 7 || ALLE.indexOf(zahn) === 23 ? ' mitte' : ''}`}>
      <div className="zahn-nr">{zahn}</div>
      <ZahnSvg
        fdi={Number(zahn)}
        befund={befund.zaehne[zahn]}
        aktivSeg={aktiv?.zahn === zahn ? aktiv.seg : null}
        onSeg={(seg) => { if (!readOnly) { window.clearTimeout(zehnerTimer.current); setAktiv({ zahn, seg }) } }}
        onLockerung={() => lockCycle(zahn)}
        rechterNachbar={rechterNachbar(reihe, zahn)}
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
      <div className="zahn-reihe ok">{OBERKIEFER.map((z) => <div key={z}>{zahnZelle(z, OBERKIEFER)}</div>)}</div>
      <div className="seiten-label"><span>rechts</span><span>links</span></div>
      <div className="zahn-reihe uk">{UNTERKIEFER.map((z) => <div key={z}>{zahnZelle(z, UNTERKIEFER)}</div>)}</div>
      <div className="kiefer-label">Unterkiefer</div>
      {/* Unterkiefer-Reihen (FB, AIT, ZS) */}
      <div className="gitter uk">
        <div className="gitter-reihe"><span className="gitter-label">FB</span>{UNTERKIEFER.map((z) => <div key={z}>{fbZelle(z)}</div>)}<span className="gitter-label">FB</span></div>
        <div className="gitter-reihe"><span className="gitter-label">AIT</span>{UNTERKIEFER.map((z) => <div key={z}>{aitZelle(z)}</div>)}<span className="gitter-label">AIT</span></div>
        <div className="gitter-reihe"><span className="gitter-label">ZS</span>{UNTERKIEFER.map((z) => <div key={z}>{zsZelle(z)}</div>)}<span className="gitter-label">ZS</span></div>
      </div>
      {!readOnly && (
        <p className="chart-hilfe keindruck">
          Je Zahn zwei Messstellen: mesiale bzw. distale Kronenhälfte anklicken, dann Zahl tippen (0-15) – danach springt die Markierung automatisch zur nächsten Messstelle (für 10-15 nach der 1 gleich die zweite Ziffer tippen).
          <b> *</b> oder Leertaste = Sondierungsbluten, <b>Tab</b>/Pfeile = nächste Messstelle, <b>Entf</b> = löschen. Die rote Linie zeigt den Knochenverlauf nach den Taschentiefen.
          ZS/AIT/FB-Felder und das Lockerungsfeld in der Zahnmitte durch Klick weiterschalten.
        </p>
      )}
    </div>
  )
}

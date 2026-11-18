import { useEffect, useState, type ReactNode } from 'react'
import { BEFUND_KUERZEL, OBERKIEFER, UNTERKIEFER } from '../engine/zahnschema'
import {
  befundAendern, befundHolen, befundLinkSetzen, befundSchreiben, datumDe, uhrzeit, useBefund, useBefundLive,
  type Befund01, type BefundLink, type Vorgang,
} from '../store/befund01'

/** Jedes Befundkürzel zum Antippen: die häufigen zuerst, dann alle übrigen */
const SCHNELL = ['', 'f', 'k', 'kw', 'pw', 'ww', 'x', 'b', 'bw', 'e', 'ew', 'i', 't', 'tw', 'ur']
const WEITERE = Object.keys(BEFUND_KUERZEL).filter((c) => !SCHNELL.includes(c)).sort()
const PLANART: Record<string, string> = { hkp: 'HKP Kasse', 'privat-hkp': 'HKP privat', par: 'PAR', kb: 'KB', kfo: 'KFO', implantologie: 'Implantologie' }
const fehlerText = (e: unknown) => `⚠ ${e instanceof Error ? e.message : String(e)}`
const kieferVon = (z: string) => (/^[12]/.test(z) ? 'Oberkiefer' : 'Unterkiefer')

function phaseText(v: Vorgang | null | undefined) {
  if (!v || v.phase === 'befund') return 'Befund · noch nichts geplant'
  const art = PLANART[v.modul] ?? ''
  return v.phase === 'planung' ? `in Planung${art ? ` · ${art}` : ''}` : `${art || 'Plan'} angelegt`
}

/** Zahnschema wie im Vordruck: OK von oben TP, R, B, Zahn – UK gespiegelt; Planungszeilen erst, wenn geplant wird */
function FlipSchema({ b, plan, wahl, onWahl }: {
  b: Befund01
  plan: Vorgang['plan']
  wahl: string
  onWahl?: (z: string) => void
}) {
  const geplant = Object.keys(plan).length > 0
  const zelle = (z: string, zeile: 'TP' | 'R' | 'B') => {
    if (zeile !== 'B') return <span key={`${zeile}${z}`} className={`bf-zelle ${zeile.toLowerCase()}`}>{plan[z]?.[zeile] ?? ''}</span>
    const c = b.zaehne[z] ?? ''
    const klasse = ['bf-zelle', 'b', z in b.offen ? 'offen' : '', c === 'f' ? 'fehlt' : '', z === wahl ? 'gewaehlt' : ''].filter(Boolean).join(' ')
    const titel = `${z}: ${c ? BEFUND_KUERZEL[c] ?? c : 'vorhanden'}${z in b.offen ? ` – noch nicht in ${b.pvs}` : ''}`
    return onWahl
      ? <button key={`B${z}`} type="button" className={klasse} title={titel} onClick={() => onWahl(z === wahl ? '' : z)}>{c}</button>
      : <span key={`B${z}`} className={klasse} title={titel}>{c}</span>
  }
  const nummern = (zs: string[]) => zs.map((z) => <span key={`n${z}`} className="bf-zelle nr">{z}</span>)
  const reihe = (name: string, kinder: ReactNode) => <div className="bf-reihe"><span className="bf-zeilenname">{name}</span>{kinder}</div>
  return (
    <div className={`bf-schema${geplant ? ' geplant' : ''}`}>
      {geplant && reihe('TP', OBERKIEFER.map((z) => zelle(z, 'TP')))}
      {geplant && reihe('R', OBERKIEFER.map((z) => zelle(z, 'R')))}
      {reihe('B', OBERKIEFER.map((z) => zelle(z, 'B')))}
      {reihe('', nummern(OBERKIEFER))}
      <div className="bf-mittellinie" />
      {reihe('', nummern(UNTERKIEFER))}
      {reihe('B', UNTERKIEFER.map((z) => zelle(z, 'B')))}
      {geplant && reihe('R', UNTERKIEFER.map((z) => zelle(z, 'R')))}
      {geplant && reihe('TP', UNTERKIEFER.map((z) => zelle(z, 'TP')))}
    </div>
  )
}

/**
 * Flip-Seite der Clara-App (Karte „Befund“): nur das Zahnschema des Patienten, live. Im Gespräch geänderte Zähne
 * stehen sofort rosa darin; der Befund wird hier, im Gespräch oder am PC freigegeben – erst dann geht er ins
 * Praxisprogramm und erst dann wird geplant. Die Planung erscheint darüber, sobald sie steht.
 */
export function BefundFlip({ zugang }: { zugang: BefundLink }) {
  useState(() => befundLinkSetzen(zugang))
  const b = useBefund(zugang.p)
  const live = useBefundLive()
  const [laedt, setLaedt] = useState(true)
  const [meldung, setMeldung] = useState('')
  const [wahl, setWahl] = useState('')
  const [frage, setFrage] = useState(false)
  const [aendert, setAendert] = useState(false)
  const [frei, setFrei] = useState('')
  const [sendet, setSendet] = useState(false)

  useEffect(() => {
    befundHolen({ patient: zugang.p })
      .then((d) => setMeldung(d.meldung ? `⚠ ${d.meldung}` : ''))
      .catch((e) => setMeldung(fehlerText(e)))
      .finally(() => setLaedt(false))
  }, [zugang.p])

  if (!b) return <div className="bf-app"><p className="bf-mitte">{laedt ? 'Befund wird geladen …' : meldung || 'Kein Befund gefunden.'}</p></div>

  const v = b.vorgang
  const phase = v?.phase ?? 'befund'
  const offen = Object.keys(b.offen)
  const kiefer = [...new Set(offen.map(kieferVon))]
  // Solange der Befund nicht bestätigt ist (oder wieder Änderungen offen sind), steht die Frage mit beiden Knöpfen da
  const bestaetigt = phase !== 'befund' && !!v?.freigegeben && offen.length === 0
  const darfAendern = !sendet
  const kannFreigeben = !bestaetigt

  const setzen = (code: string) => {
    if (!wahl) return
    const z = wahl
    setWahl('')
    setFrei('')
    setMeldung('')
    if ((b.zaehne[z] ?? '') !== code) befundAendern(b.patient, { [z]: code }).catch((e) => setMeldung(fehlerText(e)))
  }
  async function freigeben() {
    setSendet(true)
    setMeldung('')
    try {
      setMeldung(await befundSchreiben(b!.patient))
    } catch (e) {
      setMeldung(fehlerText(e))
    } finally {
      setSendet(false)
      setFrage(false)
      setAendert(false)
      setWahl('')
    }
  }

  return (
    <div className="bf-app">
      <header className="bf-kopf">
        <div className="bf-wer">
          <b>{b.label || `Patient ${b.patient}`}</b>
          {b.geburt && <small>geb. {datumDe(b.geburt)}</small>}
        </div>
        <span className={`bf-phase ${phase}`}>{phaseText(v)}</span>
        <span className={`bf-live${live ? ' an' : ''}`} title={live ? 'live verbunden' : 'keine Live-Verbindung'} aria-hidden="true" />
      </header>
      {v?.auftrag && <p className="bf-auftrag">{v.auftrag}</p>}

      <FlipSchema b={b} plan={v?.plan ?? {}} wahl={wahl} onWahl={darfAendern ? (z) => { setWahl(z); if (z) setAendert(true) } : undefined} />

      {wahl && (
        <div className="bf-picker" role="group" aria-label={`Befund ${wahl}`}>
          <span>{wahl}:</span>
          {[...SCHNELL, ...WEITERE].map((c) => (
            <button key={c || 'leer'} type="button" className={(b.zaehne[wahl] ?? '') === c ? 'an' : ''} title={c ? BEFUND_KUERZEL[c] ?? c : 'vorhanden (leer)'} onClick={() => setzen(c)}>{c || '–'}</button>
          ))}
          <form onSubmit={(ev) => { ev.preventDefault(); setzen(frei.trim().toLowerCase()) }}>
            <input type="text" value={frei} maxLength={6} placeholder="Kürzel" aria-label="anderes Kürzel" autoComplete="off" autoCapitalize="none" spellCheck={false} onChange={(ev) => setFrei(ev.target.value)} />
          </form>
        </div>
      )}

      <p className="bf-herkunft">
        aus {b.pvs}{b.pvsDatum ? ` vom ${datumDe(b.pvsDatum)}` : ''}
        {offen.length > 0
          ? <b> · {offen.length} {offen.length === 1 ? 'Änderung' : 'Änderungen'} noch nicht in {b.pvs}</b>
          : b.geschrieben ? ` · übernommen ${uhrzeit(b.geschrieben)}` : ''}
      </p>
      {v?.freigegeben && phase !== 'befund' && <p className="bf-ok">Befund freigegeben {uhrzeit(v.freigegeben)}{v.freigabeWo ? ` (${v.freigabeWo})` : ''}{phase === 'planung' && !Object.keys(v.plan).length ? ' – die Planung erscheint hier, sobald sie steht.' : ''}</p>}
      {v?.meldung && <p className="bf-warn">{v.meldung}</p>}
      {meldung && <p className="bf-meldung">{meldung}</p>}
      {darfAendern && aendert && !wahl && <p className="bf-hinweis">Zahn antippen, dann das Kürzel wählen – oder der Assistentin sagen, was anders ist.</p>}

      {kannFreigeben && (
        <div className="bf-knoepfe">
          {!frage && <p className="bf-stimmt">Stimmt der Befund so?</p>}
          {!frage && (
            <div className="bf-zwei">
              <button type="button" className={aendert ? 'an' : ''} disabled={sendet} onClick={() => { setAendert(!aendert); setWahl('') }}>
                {aendert ? 'Ändern beenden' : 'Ändern'}
              </button>
              <button type="button" className="bf-haupt" disabled={sendet} onClick={() => (offen.length ? setFrage(true) : void freigeben())}>
                {sendet ? 'wird bestätigt …' : offen.length ? `Bestätigen und in ${b.pvs} übernehmen` : 'Befund stimmt'}
              </button>
            </div>
          )}
          {frage && (
            <div className="bf-frage">
              <p>In {b.pvs} wird der ganze {kiefer.join(' und ')} geschrieben; der alte Befund bleibt dort als Historie.</p>
              <button type="button" className="bf-haupt" disabled={sendet} onClick={() => void freigeben()}>{sendet ? 'wird übernommen …' : `Ja, in ${b.pvs} übernehmen`}</button>
              <button type="button" disabled={sendet} onClick={() => setFrage(false)}>Abbrechen</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

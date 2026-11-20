import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { EMAIL, emlEntwurf, mailEntwurf, mailfensterOeffnen, pdfDateiname, versandAdresse, type Anschreiben } from '../versand'
import { herunterladen, pdfAusVorschau } from '../pdf'

const FENSTER: CSSProperties = {
  width: 'min(480px, 94vw)', padding: 0, border: '1px solid #ddd', borderRadius: 12,
  boxShadow: '0 18px 50px rgba(0,0,0,.18)',
}
const KOPF: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #eee' }

/** `?versand=1` aus der PlanR-Übersicht: senden, sobald der Plan aus `?plan=` offen ist ('' = sofort) */
let versandWunsch: string | null = (() => {
  if (typeof location === 'undefined') return null
  const q = new URLSearchParams(location.search)
  return q.get('versand') === '1' ? (q.get('plan') ?? '').trim() : null
})()

async function vermerk(nummer: string, modul: string, an: string) {
  await fetch(versandAdresse('/vermerk'), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nummer, an, weg: 'mailprogramm', modul }),
  }).catch(() => undefined)
}

/** E-Mail-Adresse des Patienten: aus dem Plan, sonst aus dem Praxis-Kontakt (höchstens 4 s warten). '' = unbekannt. */
async function empfaenger(p: Anschreiben['patient']): Promise<string> {
  const imPlan = p.email?.trim() ?? ''
  if (EMAIL.test(imPlan)) return imPlan
  if (!p.name.trim()) return ''
  try {
    const r = await fetch(versandAdresse('/kontakt'), {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(4000),
      body: JSON.stringify({ vorname: p.vorname, name: p.name, geburtsdatum: p.geburtsdatum }),
    })
    const gefunden = String(((await r.json()) as { email?: unknown }).email ?? '').trim()
    return r.ok && EMAIL.test(gefunden) ? gefunden : ''
  } catch {
    return ''
  }
}

/**
 * „Versenden“: öffnet eine neue E-Mail mit dem Kostenvoranschlag als Anhang.
 * Empfänger (soweit bekannt), Betreff und Text stehen schon drin.
 */
export function VersandKnopf({ anschreiben, vorher, seiten }: {
  anschreiben: Anschreiben
  vorher?: () => void
  /** Blätter fürs PDF. Ohne Angabe die Kostenvoranschlag-Vorschau. */
  seiten?: () => HTMLElement[]
}) {
  const fenster = useRef<HTMLDialogElement>(null)
  const [arbeit, setArbeit] = useState('')
  const [meldung, setMeldung] = useState('')
  const datei = pdfDateiname(anschreiben.nummer, anschreiben.patient)

  const senden = async () => {
    setMeldung('')
    setArbeit('Kostenvoranschlag wird in die E-Mail gelegt …')
    fenster.current?.showModal()
    try {
      vorher?.()
      const blaetter = seiten ? seiten() : [...document.querySelectorAll<HTMLElement>('.vorschau .kv-blatt')]
      const [{ base64 }, an] = await Promise.all([pdfAusVorschau(blaetter), empfaenger(anschreiben.patient)])
      const brief = mailEntwurf(anschreiben)
      setArbeit('E-Mail wird geöffnet …')
      const eml = emlEntwurf({ an, betreff: brief.betreff, text: brief.text, pdfBase64: base64, dateiname: datei })
      const offen = await mailfensterOeffnen(eml)
      if (!offen) {
        herunterladen(new Blob([eml], { type: 'message/rfc822' }), datei.replace(/\.pdf$/, '.eml'))
        setMeldung('Das Mailfenster auf diesem PC ist nicht erreichbar. Der Entwurf mit Anhang wurde heruntergeladen – bitte die Datei öffnen.')
        setArbeit('')
        return
      }
      void vermerk(anschreiben.nummer, anschreiben.modul || '', an).then(() => {
        if (window.parent !== window) window.parent.postMessage({ type: 'planr-versendet' }, '*')
      })
      fenster.current?.close()
    } catch (e) {
      setMeldung(e instanceof Error ? e.message : String(e))
      setArbeit('')
    }
  }

  const sendenAktuell = useRef(senden)
  sendenAktuell.current = senden
  useEffect(() => {
    const zu = () => { void sendenAktuell.current() }
    window.addEventListener('planr-versand', zu)
    return () => window.removeEventListener('planr-versand', zu)
  }, [])

  useEffect(() => {
    if (versandWunsch === null || (versandWunsch && anschreiben.nummer !== versandWunsch)) return
    versandWunsch = null
    const u = new URL(location.href)
    u.searchParams.delete('versand')
    history.replaceState(history.state, '', u.toString())
    void sendenAktuell.current()
  }, [anschreiben.nummer])

  const zu = () => { if (!arbeit) fenster.current?.close() }
  return (
    <>
      <button className="sekundaer" style={window.parent !== window ? { display: 'none' } : undefined} title="Neue E-Mail mit dem Kostenvoranschlag als Anhang" onClick={() => void senden()}>Versenden</button>
      <dialog ref={fenster} style={FENSTER} onClick={(e) => e.target === fenster.current && zu()}>
        <div style={KOPF}>
          <b>Kostenvoranschlag per E-Mail</b>
          <button className="sekundaer klein-btn" onClick={zu} disabled={!!arbeit}>Schließen</button>
        </div>
        <div style={{ padding: 16, fontSize: 14 }}>
          {arbeit && <div>{arbeit}</div>}
          {meldung && <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 7, background: '#fdecec', color: '#8a1f1f' }}>{meldung}</div>}
        </div>
      </dialog>
    </>
  )
}

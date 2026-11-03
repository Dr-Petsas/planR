import { useRef, useState, type CSSProperties } from 'react'
import { EMAIL, emlEntwurf, mailEntwurf, mailtoLink, pdfDateiname, versandAdresse, type Anschreiben } from '../versand'
import { herunterladen, pdfAusVorschau } from '../pdf'

type Weg = 'nadine' | 'mailprogramm'

const FENSTER: CSSProperties = {
  width: 'min(720px, 94vw)', maxHeight: '88vh', padding: 0, border: '1px solid #ddd', borderRadius: 12,
  boxShadow: '0 18px 50px rgba(0,0,0,.18)',
}
const KOPF: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #eee' }
const FELD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }
const EINGABE: CSSProperties = { font: 'inherit', fontSize: 13.5, padding: '7px 9px', border: '1px solid #d6d0c4', borderRadius: 7 }

async function api<T>(pfad: string, body?: unknown): Promise<T & { ok?: boolean; meldung?: string; message?: string }> {
  const r = await fetch(versandAdresse(pfad), {
    method: body === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const d = await r.json().catch(() => ({})) as T & { ok?: boolean; meldung?: string; message?: string }
  return r.ok ? d : { ...d, ok: false, meldung: d.meldung || d.message || `Fehler ${r.status}` }
}

/**
 * „Versenden“: Kostenvoranschlag als PDF per E-Mail. Mit Pickadoc MAS sendet Nadine über das Praxis-Postfach,
 * sonst öffnet sich ein Entwurf mit Anhang im Mailprogramm. `vorher` speichert den Plan vor dem Versand.
 */
export function VersandKnopf({ anschreiben, vorher }: { anschreiben: Anschreiben; vorher?: () => void }) {
  const fenster = useRef<HTMLDialogElement>(null)
  const [weg, setWeg] = useState<Weg>('mailprogramm')
  const [an, setAn] = useState('')
  const [betreff, setBetreff] = useState('')
  const [text, setText] = useState('')
  const [arbeit, setArbeit] = useState('')
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  const datei = pdfDateiname(anschreiben.nummer, anschreiben.patient)

  const oeffnen = async () => {
    const m = mailEntwurf(anschreiben)
    setAn(anschreiben.patient.email?.trim() ?? '')
    setBetreff(m.betreff)
    setText(m.text)
    setMeldung(null)
    setArbeit('')
    fenster.current?.showModal()
    const w = await api<{ weg?: Weg }>('').catch(() => ({ weg: undefined }))
    const neu: Weg = w.weg === 'nadine' ? 'nadine' : 'mailprogramm'
    setWeg(neu)
    if (neu === 'nadine' && !anschreiben.patient.email?.trim() && anschreiben.patient.name.trim()) {
      const p = anschreiben.patient
      const k = await api<{ email?: string }>('/kontakt', { vorname: p.vorname, name: p.name, geburtsdatum: p.geburtsdatum }).catch(() => null)
      if (k?.email) setAn((alt) => alt || k.email!)
    }
  }

  const pdf = async () => {
    setArbeit('PDF wird erstellt …')
    return pdfAusVorschau([...document.querySelectorAll<HTMLElement>('.vorschau .kv-blatt')])
  }

  const ausfuehren = async (fn: () => Promise<string>) => {
    if (!EMAIL.test(an.trim())) return setMeldung({ ok: false, text: 'Bitte eine gültige E-Mail-Adresse eintragen.' })
    setMeldung(null)
    try {
      vorher?.()
      setMeldung({ ok: true, text: await fn() })
    } catch (e) {
      setMeldung({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setArbeit('')
    }
  }

  const nadine = () => ausfuehren(async () => {
    const { base64 } = await pdf()
    setArbeit('Nadine sendet …')
    const r = await api<{ to?: string; dryRun?: boolean }>('/senden', { to: an.trim(), subject: betreff, text, pdf: { filename: datei, base64 } })
    if (!r.ok) throw new Error(r.meldung || 'Senden fehlgeschlagen.')
    return `Gesendet an ${r.to}${r.dryRun ? ' (Testmodus, nicht wirklich verschickt)' : ''} – die Mail steht in Nadines Postausgang.`
  })

  const mailprogramm = () => ausfuehren(async () => {
    const { base64 } = await pdf()
    const eml = emlEntwurf({ an: an.trim(), betreff, text, pdfBase64: base64, dateiname: datei })
    herunterladen(new Blob([eml], { type: 'message/rfc822' }), datei.replace(/\.pdf$/, '.eml'))
    return 'Der Mail-Entwurf mit Anhang wurde heruntergeladen – öffnen, dann prüfen und senden (Outlook öffnet ihn als neue Mail).'
  })

  const ohneAnhang = () => ausfuehren(async () => {
    const { blob } = await pdf()
    herunterladen(blob, datei)
    window.location.href = mailtoLink(an.trim(), betreff, text)
    return `Das Mailprogramm ist geöffnet; bitte ${datei} aus den Downloads anhängen.`
  })

  const zu = () => fenster.current?.close()
  return (
    <>
      <button className="sekundaer" title="Kostenvoranschlag als PDF per E-Mail senden" onClick={() => void oeffnen()}>Versenden</button>
      <dialog ref={fenster} style={FENSTER} onClick={(e) => e.target === fenster.current && !arbeit && zu()}>
        <div style={KOPF}>
          <b>Kostenvoranschlag per E-Mail {weg === 'nadine' ? '· über Nadine' : '· Mailprogramm'}</b>
          <button className="sekundaer klein-btn" onClick={zu} disabled={!!arbeit}>Schließen</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={FELD}>An
            <input style={EINGABE} type="email" value={an} placeholder="E-Mail-Adresse der Patientin / des Patienten" onChange={(e) => setAn(e.target.value)} />
          </label>
          <label style={FELD}>Betreff
            <input style={EINGABE} value={betreff} onChange={(e) => setBetreff(e.target.value)} />
          </label>
          <label style={FELD}>Text
            <textarea style={{ ...EINGABE, minHeight: 230, resize: 'vertical' }} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div style={{ fontSize: 12.5, color: '#555' }}>Anhang: <b>{datei}</b> (Kostenvoranschlag wie in der Vorschau)</div>
          {meldung && <div style={{ fontSize: 13, padding: '8px 10px', borderRadius: 7, background: meldung.ok ? '#e8f6ef' : '#fdecec', color: meldung.ok ? '#185c3c' : '#8a1f1f' }}>{meldung.text}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
            {arbeit && <span style={{ fontSize: 12.5, color: '#555', marginRight: 'auto' }}>{arbeit}</span>}
            {weg === 'nadine' ? (
              <button className="primaer" disabled={!!arbeit} onClick={() => void nadine()}>Über Nadine senden</button>
            ) : (
              <>
                <button className="sekundaer" disabled={!!arbeit} title="Mailprogramm mit Text öffnen, PDF wird heruntergeladen" onClick={() => void ohneAnhang()}>Mailprogramm + PDF einzeln</button>
                <button className="primaer" disabled={!!arbeit} onClick={() => void mailprogramm()}>Im Mailprogramm öffnen</button>
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  )
}

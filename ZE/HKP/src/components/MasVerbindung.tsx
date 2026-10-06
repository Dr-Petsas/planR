import { useEffect, useState } from 'react'
import type { Einstellungen, Preisliste } from '../types'
import type { EigenPosition } from '../engine/eigenlabor'
import { kzvBereich } from '../store/preislisten'
import { kzvNachNr } from '../data/kzv'
import { praxisFreigeben, registerStatus, schluesselSetzen, useVerbindung, verbunden } from '../store/register'

const PRAXIS_FELDER: (keyof Einstellungen)[] = ['labor', 'praxisPlz', 'kzv', 'gozFaktor', 'mwstLabor', 'eigenKasseProzent', 'eigenPrivatAufschlag',
  'bemaListe', 'gozListe', 'belListe', 'bebListe', 'fzListe']

interface Freigabe {
  zeit: Date
  preislisten: number
  eigen: number
  labor: Einstellungen['labor']
  plz: string
  kzv: string
  kzvName: string
  gozFaktor: number
}

const zeitDe = (d: Date) => d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Verbindung zu MAS (HKP-Register mit Clara) und Freigabe der Praxis-Preislisten */
export function MasVerbindung({ alle, eigen, einstellungen }: { alle: Preisliste[]; eigen: EigenPosition[]; einstellungen: Einstellungen }) {
  const v = useVerbindung()
  const { schluessel, automatisch } = v
  const [eingabe, setEingabe] = useState(schluessel)
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null)
  const [freigabe, setFreigabe] = useState<Freigabe | null>(null)
  const [zuletzt, setZuletzt] = useState('')

  useEffect(() => {
    if (!verbunden(v)) return
    registerStatus()
      .then((s) => setZuletzt(s.praxis.aktualisiert ? zeitDe(new Date(s.praxis.aktualisiert)) : ''))
      .catch(() => setZuletzt(''))
  }, [v])

  async function pruefen() {
    if (!automatisch) schluesselSetzen(eingabe)
    setMeldung({ text: 'prüfe …' })
    try {
      const s = await registerStatus()
      setMeldung({ text: `Verbunden. Engine in MAS: ${s.engineStand}. Praxis-Preislisten in MAS: ${s.praxis.preislisten ? `${s.praxis.preislisten} eigene, Stand ${new Date(s.praxis.aktualisiert).toLocaleString('de-DE')}` : 'nur die mitgelieferten'}.` })
    } catch (e) {
      setMeldung({ text: `⚠ ${e instanceof Error ? e.message : String(e)}`, fehler: true })
    }
  }

  async function freigeben() {
    setMeldung({ text: 'übertrage …' })
    try {
      const eigene = alle.filter((l) => !l.standard || l.geaendertAm)
      const r = await praxisFreigeben({
        preislisten: eigene, eigen,
        einstellungen: Object.fromEntries(PRAXIS_FELDER.map((k) => [k, einstellungen[k]])),
      })
      const bereich = kzvBereich(einstellungen)
      const jetzt = new Date()
      setFreigabe({
        zeit: jetzt, preislisten: r.preislisten, eigen: r.eigen, labor: einstellungen.labor, plz: einstellungen.praxisPlz,
        kzv: einstellungen.kzv, kzvName: kzvNachNr(bereich.nr)?.name ?? bereich.nr, gozFaktor: einstellungen.gozFaktor,
      })
      setZuletzt(zeitDe(jetzt))
      setMeldung(null)
    } catch (e) {
      setMeldung({ text: `⚠ ${e instanceof Error ? e.message : String(e)}`, fehler: true })
    }
  }

  const veraltet = !!freigabe && (freigabe.labor !== einstellungen.labor || freigabe.plz !== einstellungen.praxisPlz
    || freigabe.kzv !== einstellungen.kzv || freigabe.gozFaktor !== einstellungen.gozFaktor)

  return (
    <section className="es-block es-mas">
      <header className="es-kopf">
        HKP-Register und Clara (MAS)
        <span className={`es-status${verbunden(v) ? ' ok' : ''}`}>
          {automatisch ? '✓ Schlüssel fest eingetragen' : schluessel ? '✓ Schlüssel gespeichert' : 'kein Schlüssel'}
        </span>
        <small>Clara rechnet ihre HKP-Entwürfe mit derselben Engine wie PlanR – mit den Praxiswerten, die Sie hier freigeben.</small>
      </header>
      <div className="es-mas-inhalt">
        {!automatisch && (
          <label className="es-schluessel">MAS-Schlüssel (PLANR_HKP_KEY aus der MAS-Konfiguration) – nur nötig, wenn PlanR über die öffentliche Adresse geöffnet ist
            <input type="password" value={eingabe} autoComplete="off" onChange={(ev) => setEingabe(ev.target.value)} />
          </label>
        )}
        <div className="es-knoepfe">
          <button className="es-freigeben" onClick={freigeben} disabled={!verbunden(v)}
            title="Labor, PLZ/KZV, GOZ-Faktor, eigene Preislisten und den Eigenlabor-Katalog an Clara geben">
            Preislisten &amp; Praxiswerte für Clara freigeben
          </button>
          <button onClick={pruefen}>{automatisch ? 'Verbindung prüfen' : 'Speichern und Verbindung prüfen'}</button>
          {zuletzt && !freigabe && <span className="es-zuletzt">zuletzt freigegeben: {zuletzt}</span>}
        </div>
        {freigabe && (
          <div className={`es-ergebnis${veraltet ? ' veraltet' : ''}`}>
            <div className="es-ergebnis-kopf">
              {veraltet ? '⚠ Seit der Freigabe geändert – bitte erneut freigeben' : '✓ An Clara übertragen'}
              <small>{zeitDe(freigabe.zeit)}</small>
            </div>
            <div className="es-werte">
              <span className="es-wert"><small>Labor</small><b>{freigabe.labor === 'praxis' ? 'Eigenlabor' : 'Fremdlabor'}</b></span>
              <span className="es-wert"><small>KZV-Bereich</small><b>{freigabe.kzvName}</b>{freigabe.plz && <i>PLZ {freigabe.plz}</i>}</span>
              <span className="es-wert"><small>GOZ-Faktor</small><b>{String(freigabe.gozFaktor).replace('.', ',')}</b></span>
              <span className="es-wert"><small>Preislisten</small><b>{freigabe.preislisten ? `${freigabe.preislisten} eigene` : 'mitgelieferte'}</b></span>
              <span className="es-wert"><small>Eigenlabor-Katalog</small><b>{freigabe.eigen ? `${freigabe.eigen} Positionen` : 'keiner'}</b></span>
            </div>
            {(!freigabe.preislisten || !freigabe.eigen) && (
              <p className="es-info">
                {!freigabe.preislisten && 'Die mitgelieferten Preislisten hat Clara schon – übertragen werden nur eigene oder geänderte. '}
                {!freigabe.eigen && 'Ohne eigenen Eigenlabor-Katalog rechnet Clara das Eigenlabor wie PlanR nach BEL II (Praxislabor-Höchstpreis).'}
              </p>
            )}
          </div>
        )}
        {meldung && <p className={`es-meldung${meldung.fehler ? ' fehler' : ''}`}>{meldung.text}</p>}
        <p className="es-info">
          Nach Änderungen an Preislisten, Eigenlabor-Katalog, Labor oder Praxis-PLZ hier erneut freigeben. Der MAS-Schlüssel
          schützt das HKP-Register (alle HKPs mit Patientennamen, auch die von Clara); ohne ihn rechnet PlanR nur für sich.
        </p>
      </div>
    </section>
  )
}

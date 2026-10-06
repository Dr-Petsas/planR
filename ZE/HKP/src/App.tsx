import { useEffect, useMemo, useRef, useState } from 'react'
import type { Einstellungen, HkpPlan } from './types'
import { usePlan, leererPlan, planNormalisieren } from './store/plan'
import { AUTO, kzvBereich, listenFuerPlan, usePreislisten, TYP_NAMEN } from './store/preislisten'
import { KZVEN, kzvNachNr } from './data/kzv'
import { ListenStand } from './components/ListenStand'
import { berechnen, type Listen } from './engine/berechnung'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './engine/regeln'
import { privatStufeAnwenden, regelUebernehmen } from './engine/aufwertung'
import { implantatZaehne } from './engine/implantat'
import { AbformungFrage } from './components/ImplantatAngaben'
import { alsAnsi, dpfAbgleich, dpfBefundDatei, dpfErgebnisLesen, dpfUebernehmen } from './engine/dpf'
import { herunterladen } from './store/import'
import { Teil1 } from './components/Teil1'
import { Teil2 } from './components/Teil2'
import { Anlage, Eigenlaborbeleg } from './components/Anlagen'
import { Positionen } from './components/Positionen'
import { Preislisten } from './components/Preislisten'
import { PreisRegler } from './components/PreisRegler'
import { EigenlaborKatalog } from './components/EigenlaborKatalog'
import { eigenlaborSpeichern, useEigenlabor } from './store/eigenlabor'
import { euro } from './format'
import { RegisterLeiste, RegisterSeite } from './components/Register'
import { useRegisterAbgleich } from './store/registerAbgleich'
import { MasVerbindung } from './components/MasVerbindung'
import { aktivSetzen, registerLesenPerLink, registerStatusSetzen, verbindungBereit, verbunden, type HkpStatus } from './store/register'

/** Breite des A4-Vordrucks (210 mm) in CSS-Pixeln */
const BLATT_BREITE_PX = 793.7

type Tab = 'teil1' | 'teil2' | 'anlage' | 'eigenlabor' | 'register' | 'preislisten' | 'einstellungen'

const BEISPIEL: Record<string, string> = { '16': 'ww', '15': 'k', '14': 'f', '13': 'k', '26': 'kw', '36': 'f', '35': 'kw', '37': 'k', '46': 'x', '48': 'f', '38': 'f', '18': 'f', '28': 'f' }

export default function App() {
  const [plan, setPlan] = usePlan()
  const alle = usePreislisten()
  const [tab, setTab] = useState<Tab>('teil1')
  const [engineHinweise, setEngineHinweise] = useState<string[]>([])
  const importRef = useRef<HTMLInputElement>(null)
  const dpfRef = useRef<HTMLInputElement>(null)

  const e = plan.einstellungen
  const eigenlabor = useEigenlabor()
  const listen: Listen = useMemo(
    () => ({ ...listenFuerPlan(alle, { verwaltung: plan.verwaltung, einstellungen: e }), eigen: eigenlabor }),
    [alle, plan.verwaltung, e, eigenlabor],
  )

  const ergebnis = useMemo(() => berechnen(plan, listen), [plan, listen])
  const register = useRegisterAbgleich(plan, ergebnis, setPlan)
  const [linkHinweis, setLinkHinweis] = useState('')

  // SMS-Link von Clara: ?hkp=<id>&t=<token> öffnet den HKP direkt. Mit MAS-Schlüssel verknüpft
  // (Änderungen landen im Register), sonst als freie Kopie zum Probieren mit den Reglern.
  const linkGelesen = useRef(false)
  useEffect(() => {
    if (linkGelesen.current) return
    linkGelesen.current = true
    const q = new URLSearchParams(window.location.search)
    const id = q.get('hkp')
    if (!id) return
    window.history.replaceState(null, '', window.location.pathname)
    ;(async () => {
      try {
        await verbindungBereit
        if (verbunden()) {
          try {
            const h = await register.laden(id)
            setLinkHinweis(`${h.versorgungText ?? 'HKP'} für ${h.patient.label} geöffnet – Änderungen werden im Register gespeichert.`)
            setTab('teil1')
            return
          } catch { /* Schlüssel falsch o. ä. – weiter mit dem Link */ }
        }
        const h = await registerLesenPerLink(id, q.get('t') ?? '', q.get('c') ?? undefined)
        aktivSetzen(null)
        setPlan(() => planNormalisieren(JSON.parse(h.planJson || '{}')))
        setLinkHinweis(`${h.versorgungText ?? 'HKP'} für ${h.patient.label} aus dem Link geladen. Mit den Reglern frei probieren – ins Register gespeichert wird nur mit MAS-Schlüssel (Einstellungen).`)
        setTab('teil1')
      } catch (err) {
        setLinkHinweis(`Der HKP aus dem Link konnte nicht geladen werden: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
  }, [register, setPlan])

  async function registerStatus(s: HkpStatus) {
    const a = register.aktiv
    if (!a) return
    if (register.geaendert) { alert('Die letzten Änderungen werden noch gespeichert – bitte einen Moment warten.'); return }
    try {
      const h = await registerStatusSetzen(a.id, a.version, s)
      aktivSetzen({ ...a, version: h.version, status: h.status })
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  function regelengine(aenderung: Partial<HkpPlan> = {}) {
    const q = { ...plan, ...aenderung }
    const stufe = q.einstellungen.eigenPrivatStufe ?? 0
    const privat = stufe > 0 ? privatStufeAnwenden(q, stufe) : undefined
    const zaehne = privat?.plan.zaehne ?? q.zaehne
    const regel = therapieAnwenden(regelversorgungErmitteln(zaehne, regelOptionen(q)), zaehne, q)
    setPlan((p) => (stufe > 0 ? privatStufeAnwenden({ ...p, ...aenderung }, stufe).plan : regelUebernehmen({ ...p, ...aenderung }, regel)))
    setEngineHinweise([...regel.hinweise, ...(privat?.hinweise ?? [])])
  }

  const [abformungFrage, setAbformungFrage] = useState<string[] | null>(null)
  function berechnenKlick() {
    const R = regelversorgungErmitteln(plan.zaehne, regelOptionen(plan)).R
    const imp = implantatZaehne(Object.fromEntries(Object.entries(plan.zaehne).map(([z, v]) => [z, { ...v, R: R[z] ?? '' }])))
    if (!plan.abformung) setAbformungFrage(imp)
    else regelengine()
  }

  function planImportieren(f: File | undefined) {
    if (!f) return
    f.text().then((t) => {
      try {
        aktivSetzen(null)
        setPlan(() => planNormalisieren(JSON.parse(t)))
      } catch {
        alert('Die Datei ist kein gültiger HKP-Plan (JSON).')
      }
    })
    if (importRef.current) importRef.current.value = ''
  }

  function dpfExportieren() {
    const datei = new Blob([alsAnsi(dpfBefundDatei(plan)) as BlobPart], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(datei)
    a.download = `befund-${plan.patient.name || 'patient'}.dpf`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function dpfImportieren(f: File | undefined) {
    if (!f) return
    f.arrayBuffer().then((buf) => {
      const dpf = dpfErgebnisLesen(new TextDecoder('windows-1252').decode(buf))
      if (!Object.keys(dpf.befund).length && !dpf.festzuschuss.length) {
        alert('Die Datei enthält weder [Befund] noch [Festzuschuss] – ist es eine DPF-Datei?')
        return
      }
      const zaehne = Object.fromEntries(Object.entries(plan.zaehne).map(([z, v]) => [z, {
        ...v, B: dpf.befund[z] ?? v.B, TP: dpf.therapie[z] ?? v.TP,
      }]))
      const eigen = therapieAnwenden(regelversorgungErmitteln(zaehne, regelOptionen(plan)), zaehne, plan)
      const unterschiede = dpfAbgleich(dpf, regelversorgungErmitteln(zaehne, regelOptionen(plan)))
      setPlan((p) => dpfUebernehmen(p, dpf, eigen.positionen))
      setEngineHinweise([
        'DPF-Ergebnis übernommen (Zahnschema, Festzuschüsse, BEMA, GOZ). Laborpositionen stammen aus der eigenen Regelengine.',
        ...(unterschiede.length ? unterschiede.map((u) => `Abgleich DPF ↔ Engine: ${u}`) : ['Abgleich DPF ↔ Engine: keine Abweichungen bei Regelversorgung, Festzuschüssen und BEMA.']),
      ])
    })
    if (dpfRef.current) dpfRef.current.value = ''
  }

  const setEinstellung = <K extends keyof Einstellungen>(k: K, v: Einstellungen[K]) =>
    setPlan((p) => ({ ...p, einstellungen: { ...p.einstellungen, [k]: v } }))

  const s = ergebnis.summen
  const fehler = ergebnis.hinweise.filter((h) => h.stufe === 'fehler').length
  const hkpAnsicht = tab === 'teil1' || tab === 'teil2' || tab === 'anlage' || tab === 'eigenlabor'
  const hatEigenlabor = ergebnis.positionen.some((p) => p.labor === 'eigen' && (p.ebene === 'BEL' || p.ebene === 'BEB'))

  const hauptRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = hauptRef.current
    if (!el) return
    const anpassen = () => {
      const zoom = Math.min(1.28, Math.max(0.6, (el.clientWidth - 48) / BLATT_BREITE_PX))
      el.style.setProperty('--blatt-zoom', zoom.toFixed(3))
    }
    const ro = new ResizeObserver(anpassen)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="app">
      <header className="kopfleiste">
        <h1>HKP-Planer <span>Zahnersatz · BEMA · GOZ · BEL II · BEB</span></h1>
        <nav>
          {([['teil1', 'HKP Teil 1'], ['teil2', 'HKP Teil 2'], ['anlage', 'Anlage'], ['eigenlabor', 'Eigenlabor'], ['register', 'Register'], ['preislisten', 'Preislisten'], ['einstellungen', 'Einstellungen']] as [Tab, string][]).map(([t, n]) => (
            <button key={t} className={tab === t ? 'aktiv' : ''} onClick={() => setTab(t)}>{n}</button>
          ))}
        </nav>
      </header>

      {hkpAnsicht && (
        <div className="werkzeuge">
          <button className="primaer" onClick={() => setTab('register')} title="HKPs aus dem Register (auch von Clara angelegte) öffnen und mit den Reglern durchspielen">📂 Erstellte HKPs laden</button>
          <button onClick={() => { if (confirm('Aktuellen Plan verwerfen?')) { aktivSetzen(null); setPlan(() => ({ ...leererPlan(), einstellungen: plan.einstellungen })); setEngineHinweise([]) } }}>Neuer Plan</button>
          <button onClick={() => setPlan((p) => ({ ...p, zaehne: Object.fromEntries(Object.keys(p.zaehne).map((z) => [z, { B: BEISPIEL[z] ?? '', R: '', TP: '' }])) }))}>
            Beispielbefund
          </button>
          <button onClick={() => herunterladen(`hkp-${plan.patient.name || 'plan'}-${plan.verwaltung.ausstellungsdatum}.json`, JSON.stringify({ ...plan, ergebnis }, null, 1), 'application/json')}>⬇ Plan als JSON</button>
          <input ref={importRef} type="file" accept=".json" hidden onChange={(ev) => planImportieren(ev.target.files?.[0])} />
          <button onClick={() => importRef.current?.click()}>⬆ Plan laden</button>
          <button onClick={dpfExportieren} title="Befund als Übergabedatei für die Digitale Planungshilfe (DPF3) der KZBV speichern">⬇ Befund für DPF</button>
          <input ref={dpfRef} type="file" accept=".dpf,.aus,.dat,.txt,.ini" hidden onChange={(ev) => dpfImportieren(ev.target.files?.[0])} />
          <button onClick={() => dpfRef.current?.click()} title="Ergebnisdatei der DPF einlesen und mit der eigenen Regelengine abgleichen">⬆ DPF-Ergebnis laden</button>
          <button onClick={() => window.print()}>🖶 Drucken / PDF</button>
          <div className="kurzsumme">
            Gesamt <strong>{euro(s.gesamt)}</strong> · Festzuschuss <strong>{euro(s.kassenanteil)}</strong> · Eigenanteil <strong>{euro(s.eigenanteil)}</strong>
          </div>
        </div>
      )}
      {hkpAnsicht && <RegisterLeiste r={register} onStatus={registerStatus} />}
      {linkHinweis && (
        <div className="register-leiste">
          <span>{linkHinweis}</span>
          <button className="klein" onClick={() => setLinkHinweis('')}>✕</button>
        </div>
      )}

      <div className={hkpAnsicht ? 'arbeitsflaeche' : ''}>
      {hkpAnsicht && (
        <PreisRegler plan={plan} setPlan={setPlan} ergebnis={ergebnis} listen={listen} setEinstellung={setEinstellung} onMeldungen={setEngineHinweise} onBerechnen={berechnenKlick} />
      )}

      <div className="hauptspalte" ref={hauptRef}>
      {hkpAnsicht && (engineHinweise.length > 0 || ergebnis.hinweise.length > 0) && (
        <details className="hinweise" open={fehler > 0 || engineHinweise.length > 0}>
          <summary>Prüfhinweise ({ergebnis.hinweise.length + engineHinweise.length}{fehler ? `, davon ${fehler} Fehler` : ''})</summary>
          {engineHinweise.map((h) => <p key={h} className="hinweis info">{h}</p>)}
          {ergebnis.hinweise.map((h, i) => <p key={i} className={`hinweis ${h.stufe}`}>{h.text}</p>)}
        </details>
      )}

      <main>
        <div className={tab === 'teil1' ? '' : 'nur-druck'}>
          <Teil1 plan={plan} setPlan={setPlan} ergebnis={ergebnis} listen={listen}
            onAbformung={(wahl) => (plan.positionen.some((p) => p.auto) ? regelengine(wahl) : setPlan((p) => ({ ...p, ...wahl })))} />
        </div>
        <div className={tab === 'teil2' ? '' : 'nur-druck'}>
          {(tab === 'teil2' || ergebnis.versorgungsart !== 'regel') && <Teil2 plan={plan} ergebnis={ergebnis} />}
        </div>
        <div className={tab === 'anlage' ? '' : 'nur-druck'}>
          <Anlage plan={plan} ergebnis={ergebnis} />
        </div>
        {tab === 'anlage' && (
          <section className="abschnitt bildschirm">
            <h3>Positionen bearbeiten (BEMA · GOZ · BEL II · BEB)</h3>
            <Positionen
              plan={plan}
              listen={listen}
              berechnet={ergebnis.positionen}
              setPositionen={(f) => setPlan((p) => ({ ...p, positionen: f(p.positionen) }))}
              zusatzAbwaehlen={(k) => setPlan((p) => ({ ...p, einstellungen: { ...p.einstellungen, gozZusatzAus: [...p.einstellungen.gozZusatzAus, k] } }))}
            />
          </section>
        )}
        <div className={tab === 'eigenlabor' ? '' : 'nur-druck'}>
          {(tab === 'eigenlabor' || hatEigenlabor) && <Eigenlaborbeleg plan={plan} ergebnis={ergebnis} listen={listen} />}
        </div>
        {tab === 'preislisten' && (
          <>
            <ListenStand />
            <EigenlaborKatalog
              katalog={eigenlabor} onChange={eigenlaborSpeichern}
              bebText={(nr) => listen.beb?.eintraege.find((x) => x.nr.padStart(4, '0') === nr.trim().padStart(4, '0'))?.text}
            />
            <Preislisten einstellungen={e} setAktiv={(feld, id) => setEinstellung(feld, id as never)}
              verwendet={[listen.bema, listen.goz, listen.bel, listen.beb, listen.fz].map((l) => l?.id ?? '')} />
          </>
        )}
        {tab === 'register' && (
          <RegisterSeite plan={plan} ergebnis={ergebnis} r={register} onGeoeffnet={() => setTab('teil1')} onEinstellungen={() => setTab('einstellungen')} />
        )}
        {tab === 'einstellungen' && (
          <>
            <EinstellungenSeite plan={plan} setEinstellung={setEinstellung} alle={alle} listen={listen} />
            <MasVerbindung alle={alle} eigen={eigenlabor} einstellungen={e} />
          </>
        )}
      </main>
      </div>
      </div>
      {abformungFrage && (
        <AbformungFrage
          implantate={abformungFrage} wahl={plan} implantat={plan.implantat} onAbbruch={() => setAbformungFrage(null)}
          onOk={(wahl, implantat) => { setAbformungFrage(null); regelengine({ ...wahl, implantat }) }}
        />
      )}
    </div>
  )
}

function EinstellungenSeite({ plan, setEinstellung, alle, listen }: {
  plan: HkpPlan
  setEinstellung: <K extends keyof Einstellungen>(k: K, v: Einstellungen[K]) => void
  alle: ReturnType<typeof usePreislisten>
  listen: Listen
}) {
  const e = plan.einstellungen
  const bereich = kzvBereich(e)
  const verwendet: Record<string, Listen[keyof Listen]> = {
    bemaListe: listen.bema, gozListe: listen.goz, belListe: listen.bel, bebListe: listen.beb, fzListe: listen.fz,
  }
  const auswahl = (feld: keyof Einstellungen, typ: keyof typeof TYP_NAMEN) => {
    const aktiv = verwendet[feld] as { name: string } | undefined
    return (
      <label>{TYP_NAMEN[typ]}
        <select value={e[feld] as string} onChange={(ev) => setEinstellung(feld, ev.target.value as never)}>
          <option value={AUTO}>Automatisch nach {typ === 'bel2' ? 'KZV-Bereich und ' : ''}Stichtag{e[feld] === AUTO && aktiv ? ` → ${aktiv.name}` : ''}</option>
          {alle.filter((l) => l.typ === typ).map((l) => <option key={l.id} value={l.id}>{l.name} (ab {l.gueltigAb.split('-').reverse().join('.')})</option>)}
        </select>
      </label>
    )
  }
  return (
    <div className="formular einstellungen">
      <section className="abschnitt">
        <h3>Preislisten für diesen Plan</h3>
        <div className="raster">
          <label>KZV-Bereich (regionale BEL-II-Höchstpreise)
            <select value={e.kzv} onChange={(ev) => setEinstellung('kzv', ev.target.value)}>
              <option value="">
                {bereich.quelle === 'plz' ? `Aus der Praxis-PLZ → ${kzvNachNr(bereich.nr)?.name}` : 'Aus der Praxis-PLZ (noch keine PLZ → Bayern)'}
              </option>
              {KZVEN.map((k) => <option key={k.nr} value={k.nr}>{k.name} ({k.kurz}){k.login ? ' – Liste nur mit Login' : ''}</option>)}
            </select>
          </label>
          {auswahl('bemaListe', 'bema')}
          {auswahl('gozListe', 'goz')}
          {auswahl('belListe', 'bel2')}
          {auswahl('bebListe', 'beb')}
          {auswahl('fzListe', 'festzuschuss')}
        </div>
        <p className="klein">
          Stichtag ist das Eingliederungsdatum, vorher das Ausstellungsdatum des HKP. Festzuschüsse und ZE-Punktwert
          sind bundeseinheitlich, die BEL-II-Höchstpreise vereinbart jedes Land gesondert (bis ±5 % um den Bundesmittelpreis,
          Praxislabor 5 % darunter).
        </p>
      </section>
      <section className="abschnitt">
        <h3>Labor und Honorar</h3>
        <div className="raster">
          <label>Standard-Labor für neue Laborpositionen
            <select value={e.labor} onChange={(ev) => setEinstellung('labor', ev.target.value as 'gewerbe')}>
              <option value="gewerbe">Fremdlabor (gewerblich, XML-Austausch)</option>
              <option value="praxis">Eigenlabor (Praxislabor)</option>
            </select>
          </label>
          <label>Postleitzahl der Praxis (KZV-Bereich, Labor-Auftragsnummer)
            <input value={e.praxisPlz} maxLength={5} onChange={(ev) => setEinstellung('praxisPlz', ev.target.value)} />
          </label>
          <label>MwSt. auf zahntechnische Leistungen (%)
            <input type="number" step="0.1" value={e.mwstLabor} onChange={(ev) => setEinstellung('mwstLabor', Number(ev.target.value))} />
          </label>
          <label>Standard-Steigerungsfaktor GOZ
            <input type="number" step="0.1" min="1" max="3.5" value={e.gozFaktor} onChange={(ev) => setEinstellung('gozFaktor', Number(ev.target.value))} />
          </label>
        </div>
        <p className="klein">
          Jede Laborposition lässt sich in der Positionsliste einzeln dem Eigen- oder Fremdlabor zuordnen.
          Eigenlabor: BEL II zum Praxislabor-Höchstpreis (95 % der Gewerbepreise). Fremdlabor: Preise kommen aus der
          Labor-XML (Laborabrechnungsdaten KZBV/VDZI/VDDS 4.5).
        </p>
        <p className="klein">
          Der BEMA-Punktwert (ZE 2026: 1,1844 €) und der GOZ-Punktwert (5,62421 Cent) werden in der jeweiligen Preisliste gepflegt.
        </p>
      </section>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Einstellungen, HkpPlan } from './types'
import { usePlan, leererPlan, planNormalisieren } from './store/plan'
import { AUTO, GENUTZTE_LISTEN, kzvBereich, LISTEN_ORDNER, listenFuerPlan, stichtag, usePreislisten, TYP_NAMEN } from './store/preislisten'
import { getPraxis, usePraxis } from './store/praxis'
import type { Praxis } from './stammdaten'
import { PraxisFelder } from './components/Stammdaten'
import { ListenKarte } from './components/Listen'
import { KZVEN, kzvNachNr } from './data/kzv'
import { ListenStand } from './components/ListenStand'
import { berechnen, type Listen } from './engine/berechnung'
import { regelOptionen, regelversorgungErmitteln, therapieAnwenden } from './engine/regeln'
import { privatStufeAnwenden, regelUebernehmen } from './engine/aufwertung'
import { implantatZaehne } from './engine/implantat'
import { AbformungFrage } from './components/ImplantatAngaben'
import { Teil1 } from './components/Teil1'
import { Teil2 } from './components/Teil2'
import { Anlage, Eigenlaborbeleg } from './components/Anlagen'
import { Positionen } from './components/Positionen'
import { Preislisten } from './components/Preislisten'
import { PreisRegler } from './components/PreisRegler'
import { EigenlaborKatalog } from './components/EigenlaborKatalog'
import { eigenlaborSpeichern, useEigenlabor } from './store/eigenlabor'
import { RegisterLeiste, RegisterSeite } from './components/Register'
import { useLinkAbgleich, useRegisterAbgleich, type LinkEintrag } from './store/registerAbgleich'
import { MasVerbindung } from './components/MasVerbindung'
import { PvsVerbindung } from './components/PvsVerbindung'
import { PvsPatientLeiste } from './components/PvsPatient'
import { MandantKarte, MandantName } from './components/Mandant'
import { PlanrZurueck } from './PlanrZurueck'
import { geloescht, RueckgaengigLeiste } from './rueckgaengig'
import { aktivSetzen, hkpPerLink, planStand, registerStatusSetzen, useAktiv, verbindungBereit, verbunden, type HkpStatus, type LinkZugang } from './store/register'

/** Breite des A4-Vordrucks (210 mm) in CSS-Pixeln */
const BLATT_BREITE_PX = 793.7

/** Was die Auswahl der Preislisten bestimmt (die Regler nicht) */
const listenWahl = (p: HkpPlan) => {
  const e = p.einstellungen
  return [JSON.stringify(kzvBereich(e)), stichtag(p), e.bemaListe, e.gozListe, e.belListe, e.bebListe, e.fzListe].join('|')
}

/** Neuer Plan mit den Einstellungen des bisherigen und den Nummern aus den Praxis-Stammdaten */
function neuerPlan(einstellungen: Einstellungen): HkpPlan {
  const leer = leererPlan()
  const { zahnarztNr, abrechnungsNr } = getPraxis()
  return { ...leer, einstellungen, verwaltung: { ...leer.verwaltung, zahnarztNr, abrechnungsNr } }
}

type Tab = 'teil1' | 'teil2' | 'anlage' | 'eigenlabor' | 'register' | 'preislisten' | 'einstellungen'

export default function App() {
  const [plan, setPlan] = usePlan()
  const alle = usePreislisten()
  const [pvsPatientId, setPvsPatientId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('teil1')
  const [engineHinweise, setEngineHinweise] = useState<string[]>([])

  const e = plan.einstellungen
  const eigenlabor = useEigenlabor()
  const lokaleListen: Listen = useMemo(
    () => ({ ...listenFuerPlan(alle, { verwaltung: plan.verwaltung, einstellungen: e }), eigen: eigenlabor }),
    [alle, plan.verwaltung, e, eigenlabor],
  )
  // Per Link geöffneter HKP: mit den Listen rechnen, mit denen MAS die Summen im Register gerechnet hat,
  // solange die Listenwahl des Plans gleich bleibt
  const [linkListen, setLinkListen] = useState<{ listen: Listen; wahl: string } | null>(null)
  const verknuepft = useAktiv()
  const [linkEintrag, setLinkEintrag] = useState<LinkEintrag | null>(null)
  useEffect(() => { if (verknuepft) { setLinkListen(null); setLinkEintrag(null) } }, [verknuepft])
  const listen = linkListen && !verknuepft && linkListen.wahl === listenWahl(plan) ? linkListen.listen : lokaleListen

  const ergebnis = useMemo(() => berechnen(plan, listen), [plan, listen])
  const register = useRegisterAbgleich(plan, ergebnis, setPlan)
  const linkAbgleich = useLinkAbgleich(plan, linkEintrag, setLinkEintrag)
  const [linkHinweis, setLinkHinweis] = useState('')

  // SMS-Link von Clara: ?hkp=<id>&t=<token> öffnet den HKP direkt. Mit MAS-Schlüssel verknüpft
  // (Änderungen landen im Register), sonst als freie Kopie zum Probieren mit den Reglern.
  const linkGelesen = useRef(false)
  useEffect(() => {
    if (linkGelesen.current) return
    linkGelesen.current = true
    const q = new URLSearchParams(window.location.search)
    // „Neuer Plan erstellen“ in PlanR: leerer Plan, ein offener freier Plan nur nach Rückfrage
    if (q.get('neu') === '1') {
      const u = new URL(window.location.href)
      u.searchParams.delete('neu')
      history.replaceState(history.state, '', u.pathname + u.search + u.hash)
      const offen = !register.aktiv && Object.values(plan.zaehne).some((z) => z.B || z.TP)
      if (!offen || confirm('Neuen HKP anfangen? Der offene, nicht im Register gespeicherte Plan wird verworfen.')) {
        const alt = plan
        aktivSetzen(null)
        setPvsPatientId(null)
        setLinkListen(null)
        setLinkEintrag(null)
        setPlan((p) => neuerPlan(p.einstellungen))
        setTab('teil1')
        if (offen) geloescht('Offener Plan verworfen', () => setPlan(alt))
      }
      return
    }
    const id = q.get('hkp')
    if (!id) return
    // Adresse bleibt stehen: Zurück, Vor und Neuladen treffen denselben Plan.
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
        const zugang: LinkZugang = { id, t: q.get('t') ?? '', b: q.get('b') || undefined, c: q.get('c') ?? undefined }
        const d = await hkpPerLink(zugang)
        const h = d.hkp
        const p = planNormalisieren(JSON.parse(h.planJson || '{}'))
        aktivSetzen(null)
        setLinkListen(d.listen ? { listen: d.listen, wahl: listenWahl(p) } : null)
        setPlan(() => p)
        setLinkEintrag(zugang.b ? { zugang, version: h.version, stand: planStand(p) } : null)
        setLinkHinweis(zugang.b
          ? `${h.versorgungText ?? 'HKP'} für ${h.patient.label} geöffnet – Änderungen werden im Register gespeichert.`
          : `${h.versorgungText ?? 'HKP'} für ${h.patient.label} aus dem Link geladen. Mit den Reglern frei probieren – ins Register gespeichert wird nur mit MAS-Schlüssel (Einstellungen).`)
        setTab('teil1')
      } catch (err) {
        const name = `${plan.patient.vorname} ${plan.patient.name}`.trim()
        setLinkHinweis(`⚠ Der HKP aus dem Link konnte nicht geladen werden (${err instanceof Error ? err.message : String(err)}). `
          + `Angezeigt wird weiter der zuletzt hier offene Plan${name ? ` (${name})` : ''} – nicht der aus der Übersicht. `
          + 'In der PlanR-Übersicht neu laden und erneut öffnen.')
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

  const setEinstellung = <K extends keyof Einstellungen>(k: K, v: Einstellungen[K]) =>
    setPlan((p) => ({ ...p, einstellungen: { ...p.einstellungen, [k]: v } }))

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <PlanrZurueck />
          <h1>HKP-Planer <span>Zahnersatz · BEMA · GOZ · BEL II · BEB</span><MandantName /></h1>
        </div>
        <nav>
          {([['teil1', 'HKP Teil 1'], ['teil2', 'HKP Teil 2'], ['anlage', 'Anlage'], ['eigenlabor', 'Eigenlabor'], ['register', 'Register'], ['preislisten', 'Preislisten'], ['einstellungen', 'Einstellungen']] as [Tab, string][]).map(([t, n]) => (
            <button key={t} className={tab === t ? 'aktiv' : ''} onClick={() => setTab(t)}>{n}</button>
          ))}
          {hkpAnsicht && <button className="drucken" onClick={() => window.print()} title="HKP drucken oder als PDF speichern">🖶 Drucken</button>}
        </nav>
      </header>

      {hkpAnsicht && <RegisterLeiste r={register} onStatus={registerStatus} />}
      {linkHinweis && (
        <div className="register-leiste">
          <span>{linkHinweis}</span>
          <button className="klein" onClick={() => setLinkHinweis('')}>✕</button>
        </div>
      )}
      {hkpAnsicht && linkEintrag && (
        <div className={`register-leiste ${linkAbgleich.abgleich.art === 'konflikt' ? 'konflikt' : ''}`}>
          <span className="klein">
            {linkAbgleich.abgleich.art === 'speichert' ? 'speichert …'
              : linkAbgleich.abgleich.art === 'fehler' ? `⚠ ${linkAbgleich.abgleich.text}`
                : linkAbgleich.abgleich.art === 'konflikt' ? `⚠ Im Register inzwischen geändert (${linkAbgleich.abgleich.aktuell.verlauf?.at(-1)?.wer ?? '?'}: ${linkAbgleich.abgleich.aktuell.verlauf?.at(-1)?.was ?? ''}) – Seite neu laden oder meinen Stand speichern.`
                  : linkAbgleich.geaendert ? 'Änderungen werden gespeichert …' : 'im Register gespeichert'}
          </span>
          {linkAbgleich.abgleich.art === 'konflikt' && <button onClick={linkAbgleich.ueberschreiben}>Meinen Stand speichern</button>}
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
          {tab === 'teil1' && (
            <PvsPatientLeiste plan={plan} ergebnis={ergebnis} setPlan={setPlan} pvsPatientId={pvsPatientId} onPvsPatientId={setPvsPatientId} />
          )}
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
              zusatzAbwaehlen={(k, text) => {
                setPlan((p) => ({ ...p, einstellungen: { ...p.einstellungen, gozZusatzAus: [...p.einstellungen.gozZusatzAus, k] } }))
                geloescht(`Zusatzleistung abgewählt: ${text}`, () =>
                  setPlan((p) => ({ ...p, einstellungen: { ...p.einstellungen, gozZusatzAus: p.einstellungen.gozZusatzAus.filter((x) => x !== k) } })))
              }}
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
          <div className="einstellungen es-seite">
            <MandantKarte />
            <EinstellungenSeite plan={plan} setEinstellung={setEinstellung} alle={alle} listen={listen} />
            <MasVerbindung alle={alle} eigen={eigenlabor} einstellungen={e} />
            <PvsVerbindung />
          </div>
        )}
      </main>
      </div>
      </div>
      <RueckgaengigLeiste />
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
  const [praxis, setPraxis] = usePraxis()
  const bereich = kzvBereich(e)
  const kzvName = kzvNachNr(bereich.nr)?.name ?? bereich.nr
  const verwendet: Record<string, Listen[keyof Listen]> = {
    bemaListe: listen.bema, gozListe: listen.goz, belListe: listen.bel, bebListe: listen.beb, fzListe: listen.fz,
  }
  const listeKarte = (feld: keyof Einstellungen, typ: keyof typeof TYP_NAMEN) => {
    const aktiv = verwendet[feld] as { name: string } | undefined
    const auto = e[feld] === AUTO
    const [titel, unter] = TYP_NAMEN[typ].replace(/\)$/, '').split(' (')
    return (
      <div className="es-liste" key={feld}>
        <div className="es-liste-kopf">
          <b>{titel}</b>{unter && <small>{unter}</small>}
          <span className={`es-chip${auto ? ' auto' : ''}`}>{auto ? 'automatisch' : 'fest gewählt'}</span>
        </div>
        <div className="es-liste-name">{aktiv?.name ?? 'keine passende Liste'}</div>
        <select value={e[feld] as string} onChange={(ev) => setEinstellung(feld, ev.target.value as never)}>
          <option value={AUTO}>Automatisch nach {typ === 'bel2' ? 'KZV-Bereich und ' : ''}Stichtag</option>
          {alle.filter((l) => l.typ === typ).map((l) => <option key={l.id} value={l.id}>{l.name} (ab {l.gueltigAb.split('-').reverse().join('.')})</option>)}
        </select>
      </div>
    )
  }
  const LABORE = [
    ['praxis', 'Eigenlabor', 'Praxislabor · BEL II 5 % unter Gewerbe'],
    ['gewerbe', 'Fremdlabor', 'gewerblich · Preise aus der Labor-XML'],
  ] as const
  const praxisAnzeige = { ...praxis, plz: praxis.plz || e.praxisPlz, kzvNr: praxis.kzvNr || e.kzv }
  const praxisAendern = (p: Praxis) => {
    setPraxis(p)
    if (p.plz !== e.praxisPlz) setEinstellung('praxisPlz', p.plz)
  }
  const plzAendern = (plz: string) => {
    setEinstellung('praxisPlz', plz)
    setPraxis({ ...praxisAnzeige, plz })
  }
  const kzvAendern = (kzvNr: string) => {
    setEinstellung('kzv', kzvNr)
    setPraxis({ ...praxisAnzeige, kzvNr })
  }
  return (
    <>
      <section className="es-block">
        <header className="es-kopf">
          Praxis-Stammdaten
          <small>gleiche Angaben wie in allen Planern – Zahnarzt- und Abrechnungsnummer gehen in jeden neuen Plan (Teil 1)</small>
        </header>
        <PraxisFelder praxis={praxisAnzeige} onChange={praxisAendern} art="kasse" />
      </section>

      <section className="es-block">
        <header className="es-kopf">
          Praxis
          <small>Grundwerte für neue Pläne – nach der Freigabe unten rechnet Clara ihre HKP-Entwürfe ebenso</small>
        </header>
        <div className="es-kern">
          <div className="es-kachel es-labor">
            <span className="es-titel">Standard-Labor</span>
            <div className="es-wahl" role="radiogroup" aria-label="Standard-Labor">
              {LABORE.map(([id, titel, text]) => (
                <button key={id} role="radio" aria-checked={e.labor === id}
                  className={`es-option${e.labor === id ? ' aktiv' : ''}`} onClick={() => setEinstellung('labor', id)}>
                  <b>{titel}</b><small>{text}</small>
                </button>
              ))}
            </div>
            <span className="es-fuss">für neue Laborpositionen – jede Position lässt sich in der Positionsliste einzeln umstellen</span>
          </div>
          <label className="es-kachel">
            <span className="es-titel">Praxis-PLZ</span>
            <input className="es-gross" value={e.praxisPlz} maxLength={5} inputMode="numeric" placeholder="z. B. 40235"
              onChange={(ev) => plzAendern(ev.target.value)} />
            <span className={`es-folge${bereich.quelle === 'standard' ? ' warn' : ''}`}>
              {bereich.quelle === 'plz' ? `→ KZV ${kzvName}` : bereich.quelle === 'einstellung' ? `KZV fest: ${kzvName}` : 'fehlt → bayerische BEL-Preise'}
            </span>
          </label>
          <label className="es-kachel">
            <span className="es-titel">GOZ-Faktor</span>
            <input className="es-gross" type="number" step="0.1" min="1" max="3.5" value={e.gozFaktor}
              onChange={(ev) => setEinstellung('gozFaktor', Number(ev.target.value))} />
            <span className="es-fuss">Standard-Steigerung</span>
          </label>
          <label className="es-kachel">
            <span className="es-titel">MwSt. Labor</span>
            <span className="es-mit-einheit">
              <input className="es-gross" type="number" step="0.1" value={e.mwstLabor}
                onChange={(ev) => setEinstellung('mwstLabor', Number(ev.target.value))} /><i>%</i>
            </span>
            <span className="es-fuss">auf zahntechnische Leistungen</span>
          </label>
        </div>
        <p className="es-info">
          Eigenlabor: BEL II zum Praxislabor-Höchstpreis (95 % der Gewerbepreise). Fremdlabor: Preise aus der Labor-XML
          (Laborabrechnungsdaten KZBV/VDZI/VDDS 4.5). Die PLZ bestimmt den KZV-Bereich und steht in der Labor-Auftragsnummer.
        </p>
      </section>

      <section className="es-block">
        <header className="es-kopf">
          Preislisten für diesen Plan
          <small>gewählt nach KZV-Bereich und Stichtag – fest wählen nur, wenn eine bestimmte Liste gelten soll</small>
        </header>
        <div className="es-listen">
          <div className={`es-liste${bereich.quelle === 'standard' ? ' es-warn' : ''}`}>
            <div className="es-liste-kopf">
              <b>KZV-Bereich</b><small>BEL-II-Höchstpreise</small>
              <span className={`es-chip${bereich.quelle === 'plz' ? ' auto' : ''}`}>
                {bereich.quelle === 'plz' ? `aus PLZ ${e.praxisPlz}` : bereich.quelle === 'einstellung' ? 'fest gewählt' : 'PLZ fehlt'}
              </span>
            </div>
            <div className="es-liste-name">{kzvName}</div>
            <select value={e.kzv} onChange={(ev) => kzvAendern(ev.target.value)}>
              <option value="">Aus der Praxis-PLZ</option>
              {KZVEN.map((k) => <option key={k.nr} value={k.nr}>{k.name} ({k.kurz}){k.login ? ' – Liste nur mit Login' : ''}</option>)}
            </select>
          </div>
          {listeKarte('belListe', 'bel2')}
          {listeKarte('bebListe', 'beb')}
          {listeKarte('bemaListe', 'bema')}
          {listeKarte('gozListe', 'goz')}
          {listeKarte('fzListe', 'festzuschuss')}
        </div>
        <p className="es-info">
          Stichtag ist das Eingliederungsdatum, vorher das Ausstellungsdatum des HKP. Festzuschüsse und ZE-Punktwert sind
          bundeseinheitlich, die BEL-II-Höchstpreise vereinbart jedes Land gesondert (bis ±5 % um den Bundesmittelpreis,
          Praxislabor 5 % darunter). BEMA-Punktwert (ZE 2026: 1,1844 €) und GOZ-Punktwert (5,62421 Cent) stehen in der jeweiligen Preisliste.
        </p>
      </section>

      <section className="es-block">
        <ListenKarte
          listen={GENUTZTE_LISTEN}
          neueOrdner={LISTEN_ORDNER}
          knopf="Punktwerte und Preislisten aktualisieren"
          hilfe="Der ZE-Punktwert steht in der BEMA-Liste des Jahres. Holt neue BEMA-, Festzuschuss- und BEL-II-Listen (auch neue Jahre) vom PlanR-Datendienst; eigene Änderungen bleiben erhalten."
        />
      </section>
    </>
  )
}

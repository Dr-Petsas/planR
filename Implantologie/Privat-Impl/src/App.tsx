import { useEffect, useMemo, useRef, useState } from 'react'
import { Zahnschema } from './components/Zahnschema'
import { ImplantatDetails } from './components/ImplantatDetails'
import { RegionenBoxen } from './components/RegionenBoxen'
import { GlobalBoxen } from './components/GlobalBoxen'
import { Leistungen } from './components/Leistungen'
import { Kostenvoranschlag } from './components/Kostenvoranschlag'
import { Kostenleiste } from './components/Kostenleiste'
import { PraxisPreise } from './components/PraxisPreise'
import { euro, kalkulieren } from './engine/berechnung'
import { pvsPlaene } from './engine/pvs'
import { geplanteRegionen, implantatZaehne } from './engine/planung'
import { importAusZe } from './engine/bruecke'
import { neuerPlan, planMigrieren, useEinstellungen, useImplAblage, usePlan } from './store'
import { ungespeichert } from './ablage'
import { AblageKnoepfe, Sperrhinweis } from './components/Ablage'
import { VersandKnopf } from './components/Versenden'
import { MandantKarte, MandantName } from './components/Mandant'
import { PlanrLeiste, PlanrZurueck } from './PlanrZurueck'
import { ReglerKlappe } from './components/Handy'
import { implAnmelden } from './arbeitPlan'
import { PatientFelder } from './components/Stammdaten'
import type { Plan } from './types'
import { mitPatient, neuAusAdresse, patientName, type Patient } from './stammdaten'
import { Befundleiste, useBefundMitPlan } from './components/Befundleiste'
import { befundZeile } from './befund01'
import { eigenlaborMischen, praxiskatalogHolen } from './praxiskatalog'

const hatInhalt = (p: Plan) => Boolean(patientName(p.patient).trim() || Object.values(p.zaehne).some((z) => z.B || z.TP))

type Reiter = 'patient' | 'planung' | 'leistungen' | 'praxis'

const REITER: [Reiter, string][] = [
  ['patient', 'Patient'],
  ['planung', 'Befund & Planung'],
  ['leistungen', 'Leistungen'],
  ['praxis', 'Praxis & Preise'],
]

/** „Neuer Plan für …“ aus der PlanR-Übersicht (?neu=1#patient=…) */
let neuAuftrag = neuAusAdresse()

export default function App() {
  const [einst, setEinst] = useEinstellungen()
  const [plan, setPlan] = usePlan(einst.naechsteNummer)
  const [reiter, setReiter] = useState<Reiter>('planung')
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let aus = false
    praxiskatalogHolen().then((k) => {
      if (aus || !k) return
      setEinst((e) => {
        const stand = { pvs: k.pvs, stand: k.stand, anzahl: k.eigenlabor.length }
        if (e.praxiskatalog?.stand === stand.stand && e.praxiskatalog.anzahl === stand.anzahl) return e
        return { ...e, eigenlabor: eigenlaborMischen(e.eigenlabor ?? [], k), praxiskatalog: stand }
      })
    })
    return () => { aus = true }
  }, [setEinst])
  const kalk = useMemo(() => kalkulieren(plan, einst), [plan, einst])

  const ablage = useImplAblage()
  const fassung = pvsPlaene(plan, kalk)
  const daten = { nummer: plan.nummer, patient: patientName(plan.patient), betrag: kalk.gesamt, plan, pvs: fassung }
  const eintrag = ablage.eintrag(plan.nummer)
  // Clara legt den Entwurf ohne die Fassung fürs Praxisprogramm ab. Ohne die bleibt „Speichern“ aus und der Plan geht nicht nach DS-Win.
  const ohneFassung = hatInhalt(plan) && fassung.length > 0 && !(eintrag?.pvs && eintrag.pvs.length)
  const offen = ungespeichert(plan, eintrag) || ohneFassung
  const gesperrt = eintrag?.status === 'freigegeben'
  const planRef = useRef(plan)
  const sperreRef = useRef(gesperrt)
  useEffect(() => { planRef.current = plan; sperreRef.current = gesperrt })
  useEffect(() => implAnmelden(
    () => ({ plan: planRef.current, gesperrt: sperreRef.current }),
    (neu) => setPlan(neu),
  ), [setPlan])
  const sichern = () => { if (!gesperrt && hatInhalt(plan)) ablage.speichern(daten) }
  useBefundMitPlan(!gesperrt)
  const neu = (patient?: Partial<Patient> | null) => {
    sichern()
    const nr = einst.naechsteNummer + 1
    setEinst({ ...einst, naechsteNummer: nr })
    setPlan(mitPatient(neuerPlan(nr), patient))
    setReiter(patient?.name && patient.geburtsdatum ? 'planung' : 'patient')
  }
  useEffect(() => {
    if (neuAuftrag === undefined) return
    const p = neuAuftrag
    neuAuftrag = undefined
    neu(p)
  }, [])
  const oeffnen = (p: Plan) => {
    sichern()
    setPlan(planMigrieren(p))
    setReiter('planung')
  }

  const zeImportieren = async (datei: File) => {
    try {
      const daten = JSON.parse(await datei.text())
      setPlan((p) => importAusZe(p, daten))
      setReiter('planung')
    } catch {
      alert('Die Datei konnte nicht gelesen werden. Bitte eine ZE-Export-Datei aus dem Privat-ZE-Planer wählen.')
    }
  }

  const implTeeth = implantatZaehne(plan)
  const regionen = geplanteRegionen(plan)

  return (
    <div className="app">
      <PlanrLeiste punkte={REITER.map(([id, text]) => ({ id, text }))} aktiv={reiter} onWahl={(id) => setReiter(id as Reiter)} versand />
      <div className="kopfbereich">
        <header className="kopfleiste">
          <div className="marke">
            <PlanrZurueck />
            <span className="logo">IMPL</span>
            <div>
              <div className="titel">Privat-Implantologie-Planer <MandantName /></div>
              <div className="sub">Kostenvoranschlag Implantologie · GOZ, GOÄ &amp; Analog</div>
            </div>
          </div>
          <AblageKnoepfe ablage={ablage} daten={daten} eintrag={eintrag} offen={offen} onNeu={() => neu()} neuText="Neuer Kostenvoranschlag" onLaden={oeffnen}
            extra={<VersandKnopf anschreiben={{ patient: plan.patient, praxis: einst.praxis, nummer: plan.nummer, betrag: kalk.gesamt, thema: 'Implantologie' }} vorher={sichern} />} />
          <div className="kopf-summe">
            <span>{plan.nummer}</span>
            <b>{euro(kalk.gesamt)}</b>
          </div>
        </header>
        <ReglerKlappe>
          <fieldset className="sperre" disabled={gesperrt}>
            <Kostenleiste plan={plan} einst={einst} kalk={kalk} onChange={setPlan} />
          </fieldset>
        </ReglerKlappe>
      </div>

      <main className="arbeitsflaeche">
        <section className="editor">
          <nav className="reiter">
            {REITER.map(([id, label], i) => (
              <button key={id} className={reiter === id ? 'aktiv' : ''} onClick={() => setReiter(id)}>
                <span className="schritt">{i + 1}</span>{label}
              </button>
            ))}
          </nav>

          {reiter !== 'praxis' && <Sperrhinweis eintrag={eintrag} />}

          {reiter === 'patient' && (
            <>
              <fieldset className="sperre" disabled={gesperrt}>
                <PatientForm plan={plan} onChange={setPlan} onZeImport={() => fileRef.current?.click()} />
              </fieldset>
            </>
          )}

          {reiter === 'planung' && (
            <fieldset className="sperre" disabled={gesperrt}>
            <div className="block">
              <h3>Befund und Planung</h3>
              <p className="hilfe">Befund (klein) und Planung (groß) je Zahn eintragen – z. B. Befund <b>f</b> (Lücke), Planung <b>I</b> (Implantat), <b>IS</b> (Sofortimplantat), <b>IA</b> (Implantat + Augmentation), <b>EX/OX</b> (Entfernung). Mit Name und Geburtsdatum kommt der Befund (01) aus dem Praxisprogramm.</p>
              <Befundleiste patient={plan.patient} zeile={plan.zaehne} planId={plan.nummer} auto={!gesperrt}
                hinweis="Befundzeile durch den aktuellen 01 ersetzen – die Planung bleibt"
                onUebernehmen={(b) => setPlan((p) => ({ ...p, zaehne: befundZeile(p.zaehne, b, () => ({ B: '', TP: '' })) }))} />
              <Zahnschema zaehne={plan.zaehne} onChange={(zaehne) => setPlan({ ...plan, zaehne })} />
              <div className="optionen">
                <button className="sekundaer klein-btn" onClick={() => confirm('Zahnschema leeren?') && setPlan({ ...plan, zaehne: {}, implantate: {} })}>Zahnschema leeren</button>
              </div>
              {implTeeth.length > 0 && (
                <div className="impl-block">
                  <h4>Implantate <small>System, Durchmesser/Länge, Zeitpunkt und Deckung je Implantat</small></h4>
                  <ImplantatDetails zaehne={implTeeth} implantate={plan.implantate} onChange={(implantate) => setPlan({ ...plan, implantate })} />
                </div>
              )}
              <div className="global-block"><GlobalBoxen wert={plan.global} onChange={(global) => setPlan({ ...plan, global })} /></div>
              {regionen.length > 0 && (
                <div className="region-block">
                  <h4>Chirurgische Maßnahmen je Region</h4>
                  <RegionenBoxen regionen={regionen} wert={plan.regionen} onChange={(r) => setPlan({ ...plan, regionen: r })} />
                </div>
              )}
              <Hinweise liste={kalk.hinweise} />
            </div>
            </fieldset>
          )}

          {reiter === 'leistungen' && (
            <fieldset className="sperre" disabled={gesperrt}>
              <Hinweise liste={kalk.hinweise} />
              <Leistungen plan={plan} einst={einst} kalk={kalk} onChange={setPlan} />
              <div className="block">
                <h3>Bemerkung im Kostenvoranschlag</h3>
                <textarea rows={3} value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} placeholder="z. B. Behandlungsablauf, Besonderheiten …" />
              </div>
            </fieldset>
          )}

          {reiter === 'praxis' && <><MandantKarte /><PraxisPreise einst={einst} onChange={setEinst} /></>}
        </section>

        <section className="vorschau">
          <Kostenvoranschlag plan={plan} einst={einst} kalk={kalk} />
        </section>
      </main>

      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) zeImportieren(f); e.target.value = '' }} />
    </div>
  )
}

function Hinweise({ liste }: { liste: string[] }) {
  if (!liste.length) return null
  return <ul className="hinweise">{[...new Set(liste)].map((h) => <li key={h}>{h}</li>)}</ul>
}

function Feld({ label, wert, onChange, typ = 'text', breit }: { label: string; wert: string | number; onChange: (v: string) => void; typ?: string; breit?: boolean }) {
  return (
    <label className={`feld ${breit ? 'breit' : ''}`}>
      <span>{label}</span>
      <input type={typ} value={wert} step={typ === 'number' ? 'any' : undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function PatientForm({ plan, onChange, onZeImport }: { plan: Plan; onChange: (p: Plan) => void; onZeImport: () => void }) {
  return (
    <div className="block">
      <h3>Patient</h3>
      <PatientFelder art="privat" patient={plan.patient} onChange={(patient) => onChange({ ...plan, patient })} />
      <h3>Kostenvoranschlag</h3>
      <div className="formular">
        <Feld label="Nummer" wert={plan.nummer} onChange={(v) => onChange({ ...plan, nummer: v })} />
        <Feld label="Datum" typ="date" wert={plan.datum} onChange={(v) => onChange({ ...plan, datum: v })} />
      </div>
      <h3>Prothetische Fortsetzung</h3>
      <p className="hilfe">Einen im Privat-ZE-Planer exportierten Implantatplan übernehmen (setzt die Implantatzähne vor und führt den Verweis im Kostenvoranschlag).</p>
      <button className="sekundaer" onClick={onZeImport}>ZE-Plan importieren …</button>
      {plan.zeVerweis && <p className="verweis-info">Verknüpft: {plan.zeVerweis.nummer} · {plan.zeVerweis.betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>}
    </div>
  )
}

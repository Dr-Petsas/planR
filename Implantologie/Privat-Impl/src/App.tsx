import { useMemo, useRef, useState } from 'react'
import { Zahnschema } from './components/Zahnschema'
import { ImplantatDetails } from './components/ImplantatDetails'
import { RegionenBoxen } from './components/RegionenBoxen'
import { GlobalBoxen } from './components/GlobalBoxen'
import { Leistungen } from './components/Leistungen'
import { Kostenvoranschlag } from './components/Kostenvoranschlag'
import { Kostenleiste } from './components/Kostenleiste'
import { PraxisPreise } from './components/PraxisPreise'
import { euro, kalkulieren } from './engine/berechnung'
import { geplanteRegionen, implantatZaehne } from './engine/planung'
import { importAusZe } from './engine/bruecke'
import { neuerPlan, useEinstellungen, usePlan } from './store'
import type { Patient, Plan } from './types'

type Reiter = 'patient' | 'planung' | 'leistungen' | 'praxis'

const REITER: [Reiter, string][] = [
  ['patient', 'Patient'],
  ['planung', 'Befund & Planung'],
  ['leistungen', 'Leistungen'],
  ['praxis', 'Praxis & Preise'],
]

export default function App() {
  const [einst, setEinst] = useEinstellungen()
  const [plan, setPlan] = usePlan(einst.naechsteNummer)
  const [reiter, setReiter] = useState<Reiter>('planung')
  const fileRef = useRef<HTMLInputElement>(null)
  const kalk = useMemo(() => kalkulieren(plan, einst), [plan, einst])

  const neu = () => {
    if (!confirm('Neuen Kostenvoranschlag beginnen? Der aktuelle wird verworfen.')) return
    const nr = einst.naechsteNummer + 1
    setEinst({ ...einst, naechsteNummer: nr })
    setPlan(neuerPlan(nr))
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
      <div className="kopfbereich">
        <header className="kopfleiste">
          <div className="marke">
            <span className="logo">IMPL</span>
            <div>
              <div className="titel">Privat-Implantologie-Planer</div>
              <div className="sub">Kostenvoranschlag Implantologie · GOZ, GOÄ &amp; Analog</div>
            </div>
          </div>
          <div className="kopf-summe">
            <span>{plan.nummer}</span>
            <b>{euro(kalk.gesamt)}</b>
          </div>
          <div className="aktionen">
            <button className="primaer" onClick={neu}>Neuer Kostenvoranschlag</button>
          </div>
        </header>
        <Kostenleiste plan={plan} einst={einst} kalk={kalk} onChange={setPlan} />
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

          {reiter === 'patient' && <PatientForm plan={plan} onChange={setPlan} onZeImport={() => fileRef.current?.click()} />}

          {reiter === 'planung' && (
            <div className="block">
              <h3>Befund und Planung</h3>
              <p className="hilfe">Befund (klein) und Planung (groß) je Zahn eintragen – z. B. Befund <b>f</b> (Lücke), Planung <b>I</b> (Implantat), <b>IS</b> (Sofortimplantat), <b>IA</b> (Implantat + Augmentation), <b>EX/OX</b> (Entfernung).</p>
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
          )}

          {reiter === 'leistungen' && (
            <>
              <Hinweise liste={kalk.hinweise} />
              <Leistungen plan={plan} einst={einst} kalk={kalk} onChange={setPlan} />
              <div className="block">
                <h3>Bemerkung im Kostenvoranschlag</h3>
                <textarea rows={3} value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} placeholder="z. B. Behandlungsablauf, Besonderheiten …" />
              </div>
            </>
          )}

          {reiter === 'praxis' && <PraxisPreise einst={einst} onChange={setEinst} />}
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
  const p = plan.patient
  const set = (f: keyof Patient) => (v: string) => onChange({ ...plan, patient: { ...p, [f]: v } })
  return (
    <div className="block">
      <h3>Patient</h3>
      <div className="formular">
        <label className="feld">
          <span>Anrede</span>
          <select value={p.anrede} onChange={(e) => set('anrede')(e.target.value)}>
            <option value="">–</option><option>Frau</option><option>Herr</option>
          </select>
        </label>
        <Feld label="Vorname" wert={p.vorname} onChange={set('vorname')} />
        <Feld label="Name" wert={p.name} onChange={set('name')} />
        <Feld label="Geburtsdatum" typ="date" wert={p.geburtsdatum} onChange={set('geburtsdatum')} />
        <Feld label="Straße, Nr." wert={p.strasse} onChange={set('strasse')} breit />
        <Feld label="PLZ Ort" wert={p.plzOrt} onChange={set('plzOrt')} breit />
        <Feld label="Versicherung (optional)" wert={p.kostentraeger} onChange={set('kostentraeger')} breit />
      </div>
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

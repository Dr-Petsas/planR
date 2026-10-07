import { useMemo, useState } from 'react'
import { Zahnschema } from './components/Zahnschema'
import { Leistungen } from './components/Leistungen'
import { Kostenvoranschlag } from './components/Kostenvoranschlag'
import { Kostenleiste } from './components/Kostenleiste'
import { AbformungSchalter } from './components/AbformungFrage'
import { ImplantatFelder } from './components/ImplantatFelder'
import { ALLE_ZAEHNE } from './engine/zahnschema'
import { BEB, GENUTZTE_LISTEN, kalkulieren, euro, positionen } from './engine/berechnung'
import { PatientFelder, PraxisFelder } from './components/Stammdaten'
import { ListenKarte } from './components/Listen'
import { kronenEinheiten, werkstoffVon } from './engine/material'
import { KronenmaterialFelder } from './components/Kronenmaterial'
import { EigenlaborKatalog } from './components/EigenlaborKatalog'
import { neuerPlan, planMigrieren, useEinstellungen, usePlan, useZeAblage } from './store'
import { ungespeichert } from './ablage'
import { AblageKnoepfe, Sperrhinweis } from './components/Ablage'
import { MandantKarte, MandantName } from './components/Mandant'
import type { Einstellungen, Plan } from './types'
import { patientName } from './stammdaten'

const hatInhalt = (p: Plan) => Boolean(patientName(p.patient).trim() || Object.values(p.zaehne).some((z) => z.B || z.TP) || p.manuell.length)

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
  const kalk = useMemo(() => kalkulieren(plan, einst), [plan, einst])
  const ablage = useZeAblage()
  const daten = { nummer: plan.nummer, patient: patientName(plan.patient), betrag: kalk.gesamt, plan }
  const eintrag = ablage.eintrag(plan.nummer)
  const offen = ungespeichert(plan, eintrag)
  const gesperrt = eintrag?.status === 'freigegeben'
  const sichern = () => { if (offen && !gesperrt && hatInhalt(plan)) ablage.speichern(daten) }
  const neu = () => {
    sichern()
    const nr = einst.naechsteNummer + 1
    setEinst({ ...einst, naechsteNummer: nr })
    setPlan(neuerPlan(nr))
    setReiter('patient')
  }
  const oeffnen = (p: Plan) => {
    sichern()
    setPlan(planMigrieren(p))
    setReiter('planung')
  }
  const tp = (z: string) => (plan.zaehne[z]?.TP ?? '').trim().toUpperCase()
  const implantate = ALLE_ZAEHNE.filter((z) => /^S(K|T|O)/.test(tp(z)))
  const implantologieExport = () => {
    const daten = {
      app: 'privat-ze' as const,
      nummer: plan.nummer,
      datum: plan.datum,
      betrag: kalk.gesamt,
      zusammenfassung: `Implantatgetragene Suprakonstruktion: ${implantate.length} Pfeiler (${implantate.join(', ')}).`,
      implantate: implantate.map((z) => ({ zahn: z, art: tp(z) })),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${plan.nummer || 'ze-plan'}-implantologie.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const geplant = ALLE_ZAEHNE.some((z) => tp(z))
  const herausnehmbar = ALLE_ZAEHNE.some((z) => /^(S?EO?|SO|S?T)/.test(tp(z)))
  const einheiten = useMemo(() => kronenEinheiten(positionen(plan).positionen.filter((p) => p.ebene === 'BEB')), [plan])
  const werkstoffe = plan.werkstoffe ?? {}
  const materialOffen = einheiten.filter((e) => !werkstoffVon(e, werkstoffe).gewaehlt).length

  return (
    <div className="app">
      <div className="kopfbereich">
        <header className="kopfleiste">
          <div className="marke">
            <span className="logo">ZE</span>
            <div>
              <div className="titel">Privat-ZE-Planer <MandantName /></div>
              <div className="sub">Kostenvoranschlag Zahnersatz · GOZ &amp; BEB</div>
            </div>
          </div>
          <div className="kopf-summe">
            <span>{plan.nummer}</span>
            <b>{euro(kalk.gesamt)}</b>
          </div>
          {implantate.length > 0 && <button className="sekundaer" onClick={implantologieExport} title="Implantatpositionen als Datei für den Implantologie-Planer exportieren">Für Implantologie exportieren</button>}
          <AblageKnoepfe ablage={ablage} daten={daten} eintrag={eintrag} offen={offen} onNeu={neu} neuText="Neuer Kostenvoranschlag" onLaden={oeffnen} />
        </header>
        <fieldset className="sperre" disabled={gesperrt}>
          <Kostenleiste plan={plan} einst={einst} kalk={kalk} onChange={setPlan} />
        </fieldset>
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
              <fieldset className="sperre" disabled={gesperrt}><PatientForm plan={plan} onChange={setPlan} /></fieldset>
            </>
          )}

          {reiter === 'planung' && (
            <fieldset className="sperre" disabled={gesperrt}>
            <div className="block">
              <h3>Befund und Planung</h3>
              <p className="hilfe">Befund (Kleinbuchstaben) und Planung (Großbuchstaben) mit den bekannten Kürzeln eintragen – z. B. Befund <b>kw</b>, Planung <b>KM</b>; Lücke <b>f</b> mit <b>BM</b>; Implantat <b>SKM</b>. Es gibt keine Regelversorgung: geplant und berechnet wird genau, was eingetragen ist.</p>
              <Zahnschema zaehne={plan.zaehne} onChange={(zaehne) => setPlan({ ...plan, zaehne })} />
              <div className="optionen">
                <button className="sekundaer klein-btn" onClick={() => confirm('Zahnschema leeren?') && setPlan({ ...plan, zaehne: {} })}>Zahnschema leeren</button>
              </div>
              {geplant && (
                <div className="abformung-block">
                  <h4>Abformung {!plan.abformung && <span className="offen-text">noch offen</span>} {herausnehmbar && <small>Kombinationsarbeit: zweimal – Zähne bzw. Primärkronen, danach Scan oder Überabdruck für den herausnehmbaren Teil</small>}</h4>
                  <AbformungSchalter wahl={plan} mitProthese={herausnehmbar} onChange={(wahl) => setPlan({ ...plan, ...wahl })} />
                </div>
              )}
              {einheiten.length > 0 && (
                <div className="km-block">
                  <h4>Kronenmaterial {materialOffen > 0 && <span className="offen-text">{materialOffen} offen</span>} <small>Legierung bzw. Keramik je Einheit – mit mittleren Marktpreisen berechnet</small></h4>
                  <KronenmaterialFelder einheiten={einheiten} wahl={werkstoffe} onChange={(w) => setPlan({ ...plan, werkstoffe: w })} />
                </div>
              )}
              {implantate.length > 0 && (
                <div className="impl-block">
                  <h4>Implantatprothetik <small>Implantat {implantate.join(', ')} – GOZ 9050 ×2, Abformung, Abutment und Implantatteile</small></h4>
                  <ImplantatFelder wert={plan.implantat} abformung={plan.abformung} onChange={(implantat) => setPlan({ ...plan, implantat })} />
                </div>
              )}
              <Hinweise liste={kalk.hinweise} />
            </div>
            </fieldset>
          )}

          {reiter === 'leistungen' && (
            <fieldset className="sperre" disabled={gesperrt}>
              <Hinweise liste={kalk.hinweise} />
              <Leistungen plan={plan} kalk={kalk} gozFaktor={einst.gozFaktor} eigenlabor={einst.eigenlabor ?? []} onChange={setPlan} />
              <div className="block">
                <h3>Bemerkung im Kostenvoranschlag</h3>
                <textarea rows={3} value={plan.bemerkung} onChange={(e) => setPlan({ ...plan, bemerkung: e.target.value })} placeholder="z. B. Farbe, Material, Behandlungsablauf …" />
              </div>
            </fieldset>
          )}

          {reiter === 'praxis' && <><MandantKarte /><PraxisForm einst={einst} onChange={setEinst} /></>}
        </section>

        <section className="vorschau">
          <Kostenvoranschlag plan={plan} einst={einst} kalk={kalk} />
        </section>
      </main>
    </div>
  )
}

function Hinweise({ liste }: { liste: string[] }) {
  if (!liste.length) return null
  return <ul className="hinweise">{liste.map((h) => <li key={h}>{h}</li>)}</ul>
}

function Feld({ label, wert, onChange, typ = 'text', breit }: { label: string; wert: string | number; onChange: (v: string) => void; typ?: string; breit?: boolean }) {
  return (
    <label className={`feld ${breit ? 'breit' : ''}`}>
      <span>{label}</span>
      <input type={typ} value={wert} step={typ === 'number' ? 'any' : undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function PatientForm({ plan, onChange }: { plan: Plan; onChange: (p: Plan) => void }) {
  return (
    <div className="block">
      <h3>Patient</h3>
      <PatientFelder art="privat" patient={plan.patient} onChange={(patient) => onChange({ ...plan, patient })} />
      <h3>Kostenvoranschlag</h3>
      <div className="formular">
        <Feld label="Nummer" wert={plan.nummer} onChange={(v) => onChange({ ...plan, nummer: v })} />
        <Feld label="Datum" typ="date" wert={plan.datum} onChange={(v) => onChange({ ...plan, datum: v })} />
      </div>
    </div>
  )
}

function PraxisForm({ einst, onChange }: { einst: Einstellungen; onChange: (e: Einstellungen) => void }) {
  return (
    <div className="block">
      <h3>Praxis (Briefkopf)</h3>
      <PraxisFelder art="privat" praxis={einst.praxis} onChange={(praxis) => onChange({ ...einst, praxis })} />
      <div style={{ marginTop: 14 }}><ListenKarte listen={GENUTZTE_LISTEN} /></div>
      <EigenlaborKatalog
        katalog={einst.eigenlabor ?? []} onChange={(k) => onChange({ ...einst, eigenlabor: k })}
        bebText={(nr) => BEB.get(nr.trim().padStart(4, '0'))?.text}
      />
    </div>
  )
}

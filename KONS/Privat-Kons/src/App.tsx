import { useEffect, useMemo, useState } from 'react'
import { euro, rechnen } from './engine/kons'
import { Befundleiste } from './components/Befundleiste'
import { ALLE_ZAEHNE, konsKandidaten, konsWarnungen, type Befund01, type KonsArt } from './befund01'
import { eigenlaborMischen, praxiskatalogHolen } from './praxiskatalog'
import type { Therapie } from './types'
import { neuerPlan, nummerFormat, planMigrieren, useEinstellungen, useKonsAblage, usePlan } from './store'
import { ungespeichert } from './ablage'
import type { Plan } from './types'
import { patientName } from './stammdaten'
import Patient from './components/Patient'
import Zahnschema from './components/Zahnschema'
import Zahnkarten from './components/Zahnkarten'
import Einstellungen from './components/Einstellungen'
import Regler from './components/Regler'
import Dokument from './components/Dokument'
import { AblageKnoepfe, Sperrhinweis } from './components/Ablage'
import { MandantKarte, MandantName } from './components/Mandant'
import { PlanrZurueck } from './PlanrZurueck'

type Reiter = 'patient' | 'planung' | 'einstellungen'

const REITER: { id: Reiter; label: string }[] = [
  { id: 'patient', label: 'Patient' },
  { id: 'planung', label: 'Planung' },
  { id: 'einstellungen', label: 'Einstellungen' },
]

const hatInhalt = (p: Plan) => Boolean(patientName(p.patient) || Object.keys(p.zaehne).length || p.frei.length)

const BEFUND_ART: Record<Therapie, KonsArt> = {
  komposit: 'fuellung', inlay: 'fuellung', goldhaemmer: 'fuellung', versiegelung: 'fuellung', infiltration: 'fuellung', veneer: 'fuellung',
  aufbau: 'aufbau', endo: 'endo', revision: 'endo', vital: 'endo', bleaching: 'endo',
}

export default function App() {
  const [einst, setEinst] = useEinstellungen()
  const [plan, setPlan] = usePlan(einst)
  const ablage = useKonsAblage()
  const [reiter, setReiter] = useState<Reiter>('planung')

  const [befund, setBefund] = useState<Befund01 | null>(null)
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

  const rechnung = useMemo(() => rechnen(plan, einst), [plan, einst])
  const befundHinweise = konsWarnungen(
    ALLE_ZAEHNE.filter((z) => plan.zaehne[z]).map((zahn) => ({ zahn, art: BEFUND_ART[plan.zaehne[zahn].therapie] })),
    befund?.zaehne,
  )
  const kandidatenUebernehmen = (b: Record<string, string>) => setPlan((p) => {
    const zaehne = { ...p.zaehne }
    for (const k of konsKandidaten(b)) {
      if (zaehne[k.zahn]) continue
      zaehne[k.zahn] = k.art === 'aufbau' ? { therapie: 'aufbau' } : { therapie: 'komposit', flaechen: 2 }
    }
    return { ...p, zaehne }
  })
  const daten = { nummer: plan.nummer, patient: patientName(plan.patient), betrag: rechnung.summe, plan }
  const eintrag = ablage.eintrag(plan.nummer)
  const offen = ungespeichert(plan, eintrag)
  const gesperrt = eintrag?.status === 'freigegeben'

  const sichern = () => { if (offen && !gesperrt && hatInhalt(plan)) ablage.speichern(daten) }
  const neu = () => {
    sichern()
    setPlan(neuerPlan(nummerFormat(einst.naechsteNummer), einst))
    setEinst({ ...einst, naechsteNummer: einst.naechsteNummer + 1 })
    setReiter('patient')
  }
  const oeffnen = (p: Plan) => {
    sichern()
    setPlan(planMigrieren(p, einst))
    setReiter('planung')
  }

  return (
    <>
      <div className="kopfbereich">
        <header className="kopfleiste">
            <PlanrZurueck />
          <div className="marke">
            <div className="logo">PK</div>
            <div>
              <div className="titel">Privat-Kons <MandantName /></div>
              <div className="sub">Füllung, Endo, Vitalerhaltung und mehr – rein nach GOZ</div>
            </div>
          </div>
          <div className="kopf-summe">
            <span>{plan.nummer} · Gesamt</span>
            <b>{euro(rechnung.summe)}</b>
          </div>
          <AblageKnoepfe ablage={ablage} daten={daten} eintrag={eintrag} offen={offen} onNeu={neu} neuText="Neuer Plan" onLaden={oeffnen} />
        </header>
        {reiter === 'planung' && (
          <fieldset className="sperre" disabled={gesperrt}>
            <Regler plan={plan} setPlan={setPlan} einst={einst} setEinst={setEinst} rechnung={rechnung} />
          </fieldset>
        )}
      </div>

      <div className="arbeitsflaeche">
        <div className="editor">
          <div className="reiter">
            {REITER.map((r, i) => (
              <button key={r.id} className={reiter === r.id ? 'aktiv' : ''} onClick={() => setReiter(r.id)}>
                <span className="schritt">{i + 1}</span>
                {r.label}
              </button>
            ))}
          </div>

          {reiter !== 'einstellungen' && <Sperrhinweis eintrag={eintrag} />}

          {reiter === 'patient' && (
            <>
              <fieldset className="sperre" disabled={gesperrt}>
                <Patient plan={plan} setPlan={setPlan} />
              </fieldset>
            </>
          )}

          {reiter === 'planung' && (
            <fieldset className="sperre" disabled={gesperrt}>
              <Befundleiste patient={plan.patient} onBefund={setBefund} onUebernehmen={kandidatenUebernehmen}
                uebernehmenText="Kandidaten übernehmen"
                hinweis="Zähne mit „pw“ (Substanzdefekt) als Kompositfüllung, mit „ww“ (weitgehend zerstört) als Aufbau vormerken – vorhandene Einträge bleiben" />
              <Zahnschema plan={plan} setPlan={setPlan} />
              <Zahnkarten plan={plan} setPlan={setPlan} einst={einst} rechnung={rechnung} />
              {befundHinweise.length + rechnung.hinweise.length > 0 && (
                <ul className="hinweise">
                  {befundHinweise.map((h) => <li key={h} className="befund-warnung">{h}</li>)}
                  {rechnung.hinweise.map((h) => <li key={h}>{h}</li>)}
                </ul>
              )}
            </fieldset>
          )}

          {reiter === 'einstellungen' && <><MandantKarte /><Einstellungen einst={einst} setEinst={setEinst} /></>}
        </div>

        <div className="vorschau">
          <Dokument plan={plan} einst={einst} rechnung={rechnung} />
        </div>
      </div>
    </>
  )
}

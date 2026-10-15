import { useEffect, useMemo, useState } from 'react'
import { euro, rechnen } from './engine/mkv'
import { pvsPlaene } from './engine/pvs'
import { Befundleiste } from './components/Befundleiste'
import { ALLE_ZAEHNE, konsKandidaten, konsWarnungen, type Befund01 } from './befund01'
import { eigenlaborMischen, praxiskatalogHolen } from './praxiskatalog'
import { neuerPlan, nummerFormat, planMigrieren, useEinstellungen, useMkvAblage, usePlan } from './store'
import { patientName } from './stammdaten'
import { useDatenVersion } from './components/Listen'
import { ungespeichert } from './ablage'
import type { Plan } from './types'
import Patient from './components/Patient'
import Zahnschema from './components/Zahnschema'
import Zahntabelle from './components/Zahntabelle'
import Einstellungen from './components/Einstellungen'
import Regler from './components/Regler'
import Vereinbarung from './components/Vereinbarung'
import { AblageKnoepfe, Sperrhinweis } from './components/Ablage'
import { MandantKarte, MandantName } from './components/Mandant'
import { PlanrZurueck } from './PlanrZurueck'

type Reiter = 'patient' | 'planung' | 'einstellungen'

const REITER: { id: Reiter; label: string }[] = [
  { id: 'patient', label: 'Patient' },
  { id: 'planung', label: 'Füllungen' },
  { id: 'einstellungen', label: 'Einstellungen' },
]

const hatInhalt = (p: Plan) => Boolean(patientName(p.patient) || Object.keys(p.zaehne).length)

export default function App() {
  const [einst, setEinst] = useEinstellungen()
  const [plan, setPlan] = usePlan(einst)
  const ablage = useMkvAblage()
  const [reiter, setReiter] = useState<Reiter>('planung')
  const datenVersion = useDatenVersion()
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

  const rechnung = useMemo(() => rechnen(plan, einst), [plan, einst, datenVersion])
  const befundHinweise = konsWarnungen(
    ALLE_ZAEHNE.filter((z) => plan.zaehne[z]).map((zahn) => ({ zahn, art: plan.zaehne[zahn].therapie === 'aufbau' ? 'aufbau' as const : 'fuellung' as const })),
    befund?.zaehne,
  )
  const kandidatenUebernehmen = (b: Record<string, string>) => setPlan((p) => {
    const zaehne = { ...p.zaehne }
    for (const k of konsKandidaten(b)) {
      if (zaehne[k.zahn]) continue
      zaehne[k.zahn] = k.art === 'aufbau' ? { therapie: 'aufbau', flaechen: 2 } : { therapie: 'komposit', flaechen: 2 }
    }
    return { ...p, zaehne }
  })
  const daten = { nummer: plan.nummer, patient: patientName(plan.patient), betrag: rechnung.mehrkosten, plan, pvs: pvsPlaene(plan, rechnung) }
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
          <div className="marke">
            <PlanrZurueck />
            <div className="logo">MKV</div>
            <div>
              <div className="titel">Füllungs-MKV-Planer <MandantName /></div>
              <div className="sub">Mehrkostenvereinbarung nach § 28 Abs. 2 SGB V</div>
            </div>
          </div>
          <div className="kopf-summe">
            <span>{plan.nummer} · {rechnung.privat7Summe ? 'Eigenanteil' : 'Mehrkosten'}</span>
            <b>{euro(rechnung.mehrkosten + rechnung.privat7Summe)}</b>
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
              <Zahntabelle plan={plan} setPlan={setPlan} einst={einst} rechnung={rechnung} />
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
          <Vereinbarung plan={plan} einst={einst} rechnung={rechnung} />
        </div>
      </div>
    </>
  )
}

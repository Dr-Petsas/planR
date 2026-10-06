import { useEffect, useMemo, useState } from 'react'
import { kzvAusPlz } from './data/kzv'
import { ermittlePunktwert } from './data/punktwerte'
import { diagnostizieren } from './engine/diagnose'
import { preiseAus, streckeRechnen } from './engine/leistungen'
import { pruefeFall, zaehlMeldungen } from './engine/pruefung'
import { euro, initialBefund } from './engine/strecke'
import { terminePlanen } from './engine/termine'
import { neuerFall, useEinstellungen, useFall } from './store'
import PatientReiter from './components/PatientReiter'
import Blatt1Reiter from './components/Blatt1Reiter'
import Blatt2Reiter from './components/Blatt2Reiter'
import StreckeReiter from './components/StreckeReiter'
import UptReiter from './components/UptReiter'
import VerlaufReiter from './components/VerlaufReiter'
import FormulareReiter from './components/FormulareReiter'
import PruefungReiter from './components/PruefungReiter'
import EinstellungenReiter from './components/EinstellungenReiter'

type ReiterId = 'patient' | 'blatt1' | 'blatt2' | 'strecke' | 'upt' | 'verlauf' | 'formulare' | 'pruefung' | 'einstellungen'

export default function App() {
  const [fall, setFall] = useFall()
  const [einst, setEinst] = useEinstellungen()
  const [reiter, setReiter] = useState<ReiterId>('patient')

  const initial = initialBefund(fall)
  const diag = useMemo(() => diagnostizieren(fall.diagnose, initial), [fall.diagnose, initial])
  const punktwert = useMemo(
    () => ermittlePunktwert(einst, fall.patient, kzvAusPlz(einst.praxis.plz)),
    [einst, fall.patient],
  )
  const preise = useMemo(() => preiseAus(einst, punktwert.wert), [einst, punktwert.wert])
  const meldungen = useMemo(() => pruefeFall(fall, einst, diag), [fall, einst, diag])
  const zahl = zaehlMeldungen(meldungen)
  const summe = useMemo(() => streckeRechnen(fall, preise).summe, [fall, preise])

  // Strecke beim ersten Oeffnen anlegen; bei Gradwechsel UPT-Folge neu rechnen
  useEffect(() => {
    if (fall.termine.length === 0) setFall((f) => ({ ...f, termine: terminePlanen(f, diag) }))
  }, [fall.termine.length, diag, setFall])
  const [letzterGrad, setLetzterGrad] = useState(diag.grad)
  useEffect(() => {
    if (diag.grad !== letzterGrad) {
      setLetzterGrad(diag.grad)
      setFall((f) => ({ ...f, termine: terminePlanen(f, diag) }))
    }
  }, [diag, letzterGrad, setFall])

  const neu = () => {
    if (!confirm('Neuen PAR-Fall beginnen? Der aktuelle Fall wird ersetzt.')) return
    setFall(neuerFall(einst.naechsteNummer))
    setEinst({ ...einst, naechsteNummer: einst.naechsteNummer + 1 })
    setReiter('patient')
  }

  const REITER: { id: ReiterId; label: string }[] = [
    { id: 'patient', label: 'Patient' },
    { id: 'blatt1', label: 'Blatt 1' },
    { id: 'blatt2', label: 'Blatt 2 / Befunde' },
    { id: 'strecke', label: 'Strecke' },
    { id: 'upt', label: 'UPT-Rechner' },
    { id: 'verlauf', label: 'Verlauf' },
    { id: 'formulare', label: 'Formulare' },
    { id: 'pruefung', label: `Prüfung${zahl.fehler + zahl.warnung ? ` (${zahl.fehler + zahl.warnung})` : ''}` },
    { id: 'einstellungen', label: 'Einstellungen' },
  ]

  return (
    <div className="app">
      <header className="kopf keindruck">
        <div>
          <h1>Kassen-PAR-Planer</h1>
          <span className="kopf-unter">{fall.nummer} · eFormular 5 v2.1.0 · BEMA Teil 4</span>
        </div>
        <div className="kopf-rechts">
          <span className="kopf-diag">
            Stadium {['', 'I', 'II', 'III', 'IV'][diag.stadium]} · {diag.ausmass} · Grad {diag.grad}
          </span>
          <span className="kopf-diag" title={punktwert.hinweis}>
            PW {punktwert.wert.toFixed(4).replace('.', ',')} €{punktwert.richtwert ? ' (Richtwert)' : ''}
          </span>
          <span className="kopf-diag">{euro(summe)}</span>
          <button onClick={neu}>Neuer Fall</button>
        </div>
      </header>

      <nav className="reiter keindruck">
        {REITER.map((r) => (
          <button key={r.id} className={reiter === r.id ? 'aktiv' : ''} onClick={() => setReiter(r.id)}>{r.label}</button>
        ))}
      </nav>

      <main className="inhalt">
        {reiter === 'patient' && <PatientReiter fall={fall} setFall={setFall} />}
        {reiter === 'blatt1' && <Blatt1Reiter fall={fall} setFall={setFall} diag={diag} />}
        {reiter === 'blatt2' && <Blatt2Reiter fall={fall} setFall={setFall} />}
        {reiter === 'strecke' && <StreckeReiter fall={fall} setFall={setFall} diag={diag} preise={preise} />}
        {reiter === 'upt' && <UptReiter fall={fall} diag={diag} einst={einst} />}
        {reiter === 'verlauf' && <VerlaufReiter fall={fall} />}
        {reiter === 'formulare' && <FormulareReiter fall={fall} setFall={setFall} einst={einst} diag={diag} />}
        {reiter === 'pruefung' && <PruefungReiter meldungen={meldungen} />}
        {reiter === 'einstellungen' && <EinstellungenReiter einst={einst} setEinst={setEinst} punktwert={punktwert} />}
      </main>
    </div>
  )
}

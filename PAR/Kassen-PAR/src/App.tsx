import { useEffect, useMemo, useState } from 'react'
import { kzvAusPlz } from './data/kzv'
import { ermittlePunktwert } from './data/punktwerte'
import { diagnostizieren } from './engine/diagnose'
import { preiseAus, streckeRechnen } from './engine/leistungen'
import { pruefeFall, zaehlMeldungen } from './engine/pruefung'
import { euro, initialBefund } from './engine/strecke'
import { terminePlanen } from './engine/termine'
import { fallMigrieren, neuerFall, useEinstellungen, useFall, useParAblage } from './store'
import { ungespeichert } from './ablage'
import { AblageKnoepfe, AblageListe, Sperrhinweis } from './components/Ablage'
import { MandantKarte, MandantName } from './components/Mandant'
import AntragReiter from './components/AntragReiter'
import StreckeReiter from './components/StreckeReiter'
import FormulareReiter from './components/FormulareReiter'
import EinstellungenReiter from './components/EinstellungenReiter'

type ReiterId = 'antrag' | 'strecke' | 'formulare' | 'einstellungen'

const REITER: { id: ReiterId; label: string }[] = [
  { id: 'antrag', label: 'Antrag (Blatt 1 + 2)' },
  { id: 'strecke', label: 'Strecke & UPT' },
  { id: 'formulare', label: 'Weitere Formulare' },
  { id: 'einstellungen', label: 'Einstellungen' },
]

export default function App() {
  const [fall, setFall] = useFall()
  const [einst, setEinst] = useEinstellungen()
  const [reiter, setReiter] = useState<ReiterId>('antrag')

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

  const name = [fall.patient.vorname, fall.patient.name].filter(Boolean).join(' ')
  const ablage = useParAblage()
  const daten = { nummer: fall.nummer, patient: name, betrag: summe, plan: fall }
  const eintrag = ablage.eintrag(fall.nummer)
  const offen = ungespeichert(fall, eintrag)
  const gesperrt = eintrag?.status === 'freigegeben'

  /** Fälle mit Patientennamen werden beim Wechsel automatisch gesichert; namenlose nur nach Rückfrage verworfen. */
  const sichern = () => {
    if (!offen || gesperrt) return true
    if (name.trim()) { ablage.speichern(daten); return true }
    return confirm('Der offene Fall hat noch keinen Patientennamen und wird nicht gespeichert. Trotzdem wechseln?')
  }
  const neu = () => {
    if (!sichern()) return
    setFall(neuerFall(einst.naechsteNummer))
    setEinst({ ...einst, naechsteNummer: einst.naechsteNummer + 1 })
    setReiter('antrag')
  }
  const oeffnen = (f: typeof fall) => {
    if (!sichern()) return
    setFall(fallMigrieren(f))
    setReiter('antrag')
  }

  return (
    <div className="app">
      <header className="kopf keindruck">
        <div>
          <h1>Kassen-PAR-Planer <MandantName /></h1>
          <span className="kopf-unter">{name || 'ohne Namen'} · {fall.nummer} · eFormular 5 · BEMA Teil 4</span>
        </div>
        <div className="kopf-rechts">
          <span className="kopf-diag">
            Stadium {['', 'I', 'II', 'III', 'IV'][diag.stadium]} · {diag.ausmass} · Grad {diag.grad}
          </span>
          <span className="kopf-diag" title={punktwert.hinweis}>
            PW {punktwert.wert.toFixed(4).replace('.', ',')} €{punktwert.richtwert ? ' (Richtwert)' : ''}
          </span>
          <span className="kopf-summe">{euro(summe)}</span>
          <AblageKnoepfe ablage={ablage} daten={daten} eintrag={eintrag} offen={offen} onNeu={neu} neuText="Neuer Fall" />
        </div>
      </header>

      <nav className="reiter keindruck">
        {REITER.map((r) => (
          <button key={r.id} className={reiter === r.id ? 'aktiv' : ''} onClick={() => setReiter(r.id)}>{r.label}</button>
        ))}
      </nav>

      {reiter !== 'einstellungen' && meldungen.length > 0 && (
        <details className="hinweise keindruck" open={zahl.fehler > 0}>
          <summary>
            Prüfhinweise ({meldungen.length}{zahl.fehler ? `, davon ${zahl.fehler} Fehler` : ''}{zahl.warnung ? `, ${zahl.warnung} Warnungen` : ''})
          </summary>
          {meldungen.map((m, i) => (
            <p key={i} className={`hinweis ${m.art === 'hinweis' ? 'info' : m.art}`}>
              <b>{m.bereich}:</b> {m.text}
            </p>
          ))}
        </details>
      )}

      <main className="inhalt">
        {reiter !== 'einstellungen' && <Sperrhinweis eintrag={eintrag} />}
        {reiter !== 'einstellungen' && (
          <fieldset className="sperre" disabled={gesperrt}>
            {reiter === 'antrag' && <AntragReiter fall={fall} setFall={setFall} einst={einst} setEinst={setEinst} diag={diag} />}
            {reiter === 'strecke' && <StreckeReiter fall={fall} setFall={setFall} diag={diag} preise={preise} />}
            {reiter === 'formulare' && <FormulareReiter fall={fall} setFall={setFall} einst={einst} setEinst={setEinst} diag={diag} />}
          </fieldset>
        )}
        {reiter === 'antrag' && <AblageListe ablage={ablage} aktuell={fall.nummer} onLaden={oeffnen} />}
        {reiter === 'einstellungen' && <><MandantKarte /><EinstellungenReiter einst={einst} setEinst={setEinst} punktwert={punktwert} /></>}
      </main>
    </div>
  )
}

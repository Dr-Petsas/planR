import { useState } from 'react'
import type { Einstellungen, Preisliste } from '../types'
import type { EigenPosition } from '../engine/eigenlabor'
import { praxisFreigeben, registerStatus, schluesselSetzen, useVerbindung, verbunden } from '../store/register'

const PRAXIS_FELDER: (keyof Einstellungen)[] = ['labor', 'praxisPlz', 'kzv', 'gozFaktor', 'mwstLabor', 'eigenKasseProzent', 'eigenPrivatAufschlag',
  'bemaListe', 'gozListe', 'belListe', 'bebListe', 'fzListe']

/** Verbindung zu MAS (HKP-Register mit Clara) und Freigabe der Praxis-Preislisten */
export function MasVerbindung({ alle, eigen, einstellungen }: { alle: Preisliste[]; eigen: EigenPosition[]; einstellungen: Einstellungen }) {
  const v = useVerbindung()
  const { schluessel, automatisch } = v
  const [eingabe, setEingabe] = useState(schluessel)
  const [meldung, setMeldung] = useState('')

  async function pruefen() {
    if (!automatisch) schluesselSetzen(eingabe)
    setMeldung('prüfe …')
    try {
      const s = await registerStatus()
      setMeldung(`Verbunden. Engine in MAS: ${s.engineStand}. Praxis-Preislisten in MAS: ${s.praxis.preislisten ? `${s.praxis.preislisten} eigene, Stand ${new Date(s.praxis.aktualisiert).toLocaleString('de-DE')}` : 'nur die mitgelieferten'}.`)
    } catch (e) {
      setMeldung(`⚠ ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function freigeben() {
    setMeldung('übertrage …')
    try {
      const eigene = alle.filter((l) => !l.standard || l.geaendertAm)
      const r = await praxisFreigeben({
        preislisten: eigene, eigen,
        einstellungen: Object.fromEntries(PRAXIS_FELDER.map((k) => [k, einstellungen[k]])),
      })
      setMeldung(`Für Clara freigegeben: ${r.preislisten} eigene bzw. geänderte Preislisten, ${r.eigen} Eigenlabor-Positionen und die Praxis-Einstellungen (Labor, PLZ, KZV, GOZ-Faktor).`)
    } catch (e) {
      setMeldung(`⚠ ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div className="formular einstellungen">
      <section className="abschnitt">
        <h3>HKP-Register und Clara (MAS)</h3>
        <p className="klein">
          Der MAS-Schlüssel schützt das HKP-Register (alle HKPs mit Patientennamen, auch die von Clara). Mit ihm kann PlanR
          Claras Entwürfe laden, Änderungen und Status speichern und die Preislisten an Clara geben. Ohne ihn rechnet PlanR nur für sich.
        </p>
        {automatisch ? (
          <p className="regler-info ok">✓ Fest eingetragen: Auf diesem PC holt PlanR den Schlüssel selbst aus der MAS-Konfiguration – keine Eingabe nötig.</p>
        ) : (
          <div className="raster">
            <label>MAS-Schlüssel (PLANR_HKP_KEY aus der MAS-Konfiguration) – nur nötig, wenn PlanR über die öffentliche Adresse geöffnet ist
              <input type="password" value={eingabe} autoComplete="off" onChange={(ev) => setEingabe(ev.target.value)} />
            </label>
          </div>
        )}
        <div className="werkzeuge-zeile">
          <button onClick={pruefen}>{automatisch ? 'Verbindung prüfen' : 'Speichern und Verbindung prüfen'}</button>
          <button onClick={freigeben} disabled={!verbunden(v)} title="Clara rechnet ihre HKP-Entwürfe dann mit denselben Preisen wie PlanR">Preislisten für MAS freigeben</button>
        </div>
        {meldung && <p className="klein">{meldung}</p>}
        <p className="klein">
          Clara rechnet Entwürfe mit derselben Engine wie PlanR. Ohne Freigabe nutzt sie die mitgelieferten Listen und Standard-Einstellungen;
          nach Änderungen an Preislisten, Eigenlabor-Katalog, Labor oder Praxis-PLZ hier erneut freigeben.
        </p>
      </section>
    </div>
  )
}

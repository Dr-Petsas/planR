import { useEffect, useState } from 'react'
import { ARZT_EREIGNIS, arztLesen, stempelZeilen } from '../arzt'
import type { Praxis } from '../stammdaten'

/** Unterschriftsfeld des Zahnarztes: blauer Praxisstempel, darüber die Unterschrift aus dem Pickadoc-Profil. */
export default function Arztstempel({ praxis }: { praxis: Praxis }) {
  const [arzt, setArzt] = useState(arztLesen)
  useEffect(() => {
    const neu = () => setArzt(arztLesen())
    window.addEventListener(ARZT_EREIGNIS, neu)
    window.addEventListener('storage', neu)
    return () => {
      window.removeEventListener(ARZT_EREIGNIS, neu)
      window.removeEventListener('storage', neu)
    }
  }, [])
  const zeilen = stempelZeilen(praxis, arzt?.name)
  return (
    <div className="arzt-unterschrift">
      <div className="arzt-stempel">
        {zeilen.map((z, i) => (i === 0 ? <b key={i}>{z}</b> : <div key={i}>{z}</div>))}
      </div>
      {arzt?.signatur
        ? <img className="arzt-signatur" src={arzt.signatur} alt={`Unterschrift ${arzt.name}`} />
        : (
          <span className="arzt-fehlt" data-html2canvas-ignore="true">
            Unterschrift fehlt – in Pickadoc unter Einstellungen → Mitarbeiter{arzt?.name ? ` (${arzt.name})` : ''} hinterlegen
          </span>
        )}
    </div>
  )
}

import { useRef, useState } from 'react'
import { laborXmlLesen, type LaborXml } from '../laborxml'

interface Props {
  /** übernimmt die gelesene Datei und liefert die Meldungen für die Anzeige */
  uebernehmen: (x: LaborXml, datei: string) => string[]
}

/** Kostenvoranschlag oder Rechnung des Labors im XML-Format (Laborabrechnungsdaten KZBV/VDZI/VDDS 4.x) */
export default function LaborXmlKnopf({ uebernehmen }: Props) {
  const feld = useRef<HTMLInputElement>(null)
  const [meldung, setMeldung] = useState<{ fehler: string[]; info: string[] } | null>(null)

  const lesen = async (datei: File) => {
    const x = laborXmlLesen(await datei.text())
    if (x.fehler.length) setMeldung({ fehler: x.fehler, info: x.warnungen })
    else setMeldung({ fehler: [], info: uebernehmen(x, datei.name) })
  }

  return (
    <div className="labor-xml">
      <input ref={feld} type="file" accept=".xml,text/xml,application/xml" hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void lesen(f)
        }} />
      <button className="klein-btn sekundaer" onClick={() => feld.current?.click()}
        title="Kostenvoranschlag/Rechnung des Labors (XML 4.x) – ersetzt die Laborpositionen des Plans">
        Labor-XML einlesen
      </button>
      {meldung && (
        <ul className="xml-meldung">
          {meldung.fehler.map((m) => <li key={m} className="warn">{m}</li>)}
          {meldung.info.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
    </div>
  )
}

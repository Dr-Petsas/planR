import type { Abformung, Plan } from '../types'

export type AbformungWahl = Pick<Plan, 'abformung' | 'abformungProthese'>

type Art = { id: 'scan' | 'abdruck'; titel: string; text: string }

export const ABFORMUNG_ARTEN: Art[] = [
  {
    id: 'scan', titel: 'Intraoralscan',
    text: 'GOZ 0065 je Kieferhälfte/Frontzahnbereich (mit Gegenkiefer), gedruckte Modelle (BEB 0009), Kunststoffstümpfe bei Veneers.',
  },
  {
    id: 'abdruck', titel: 'Abdruck (konventionell)',
    text: 'Abformung in den Kronen-/Brückenleistungen enthalten, Sägemodell (BEB 0021) und Gegenkiefermodell (BEB 0002).',
  },
]

export const PROTHESE_ARTEN: Art[] = [
  {
    id: 'scan', titel: 'Intraoralscan (2. Sitzung)',
    text: 'Erneut GOZ 0065 je Kieferhälfte/Frontzahnbereich des Kiefers (3 je Kiefer) und gedrucktes Modell (BEB 0009).',
  },
  {
    id: 'abdruck', titel: 'Überabdruck',
    text: 'Z. B. über die eingesetzten Primärkronen: individueller Löffel (GOZ 5170, BEB 1006) und Modell nach Überabformung (BEB 0004).',
  },
]

function Optionen({ arten, wert, name, onChange, abwaehlbar = false }: {
  arten: Art[]; wert: Abformung; name: string; onChange: (a: Abformung) => void; abwaehlbar?: boolean
}) {
  return (
    <div className="abformung-wahl">
      {arten.map((a) => (
        <label key={a.id} className={`abformung-option${wert === a.id ? ' aktiv' : ''}`}>
          <input type="radio" name={name} checked={wert === a.id} onChange={() => onChange(a.id)} onClick={() => abwaehlbar && wert === a.id && onChange('')} />
          <b>{a.titel}</b>
          <small>{a.text}</small>
        </label>
      ))}
    </div>
  )
}

/** Zwei getrennte Abformungen: Zähne/Primärkronen und – bei Kombinationsarbeiten – der herausnehmbare Teil */
export function AbformungSchalter({ wahl, onChange, mitProthese, name = 'abformung' }: {
  wahl: AbformungWahl; onChange: (w: AbformungWahl) => void; mitProthese: boolean; name?: string
}) {
  const zweiSchritte = mitProthese || !!wahl.abformungProthese
  return (
    <>
      {zweiSchritte && <h5>1. Präparierte Zähne / Primärkronen</h5>}
      <Optionen arten={ABFORMUNG_ARTEN} wert={wahl.abformung} name={name} onChange={(abformung) => onChange({ ...wahl, abformung })} />
      {zweiSchritte && (
        <div className={mitProthese ? '' : 'abformung-unpassend'}>
          <h5>2. Herausnehmbarer Teil <small>{mitProthese ? 'eigene Sitzung – nochmals anklicken zum Abwählen' : 'kein herausnehmbarer Teil geplant – bitte abwählen'}</small></h5>
          <Optionen arten={PROTHESE_ARTEN} wert={wahl.abformungProthese} name={`${name}-prothese`} abwaehlbar onChange={(abformungProthese) => onChange({ ...wahl, abformungProthese })} />
        </div>
      )}
    </>
  )
}
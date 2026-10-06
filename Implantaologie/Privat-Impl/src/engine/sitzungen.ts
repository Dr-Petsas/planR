import type { Einstellungen, Plan, Position } from '../types'
import { GOZ } from './listen'
import { OP_ZUSCHLAG_STUFE } from '../data/goz-sonderregeln'
import { materialFuerKlasse } from '../data/material'
import { kieferVon } from './zahnschema'

export interface SitzungErgebnis {
  positionen: Position[]
  hinweise: string[]
}

const kieferAus = (zahn: string): 'OK' | 'UK' | '' => {
  if (zahn.startsWith('OK')) return 'OK'
  if (zahn.startsWith('UK')) return 'UK'
  if (/^\d\d$/.test(zahn)) return kieferVon(zahn)
  return ''
}

const istUkSeitenzahn = (zahn: string) =>
  zahn === 'UK' || zahn === 'UK-L' || zahn === 'UK-R' || (/^\d\d$/.test(zahn) && kieferVon(zahn) === 'UK' && !['1', '2', '3'].includes(zahn[1]))

/** Punkte einer GOZ-Nummer (für die Wahl des höchsten OP-Zuschlags). */
const punkte = (nr: string) => GOZ.get(nr)?.punkte ?? 0

/**
 * Ergänzt je Behandlungssitzung Anästhesie, einen OP-Zuschlag (nur den höchsten),
 * Kontrollröntgen sowie die globale Bildgebung. Nachsorge-/Begleitleistungen
 * kommen über den Regler (zusatz.ts).
 */
export function sitzungenErgaenzen(plan: Plan, eingang: Position[], _einst: Einstellungen): SitzungErgebnis {
  const positionen = [...eingang]
  const hinweise: string[] = []
  const klasse = plan.regler.materialKlasse

  // OP-Sitzungen = Sitzungen mit mindestens einer chirurgischen GOZ-Leistung
  const opNummern = new Set(Object.keys(OP_ZUSCHLAG_STUFE))
  const sitzungen = new Set(positionen.filter((p) => p.ebene === 'GOZ' && opNummern.has(p.nr) && p.sitzung).map((p) => p.sitzung!))

  for (const s of [...sitzungen].sort((a, b) => a - b)) {
    const inSitzung = positionen.filter((p) => p.sitzung === s && p.ebene === 'GOZ' && opNummern.has(p.nr))
    const kiefer = new Set(inSitzung.map((p) => kieferAus(p.zahn)).filter(Boolean) as ('OK' | 'UK')[])
    const brauchtLeitung = inSitzung.some((p) => istUkSeitenzahn(p.zahn))

    // Anästhesie je beteiligtem Kiefer
    for (const k of kiefer.size ? kiefer : new Set<'OK' | 'UK'>(['OK'])) {
      const leitung = k === 'UK' && brauchtLeitung
      const nr = leitung ? '0100' : '0090'
      positionen.push({ id: `auto:anae:${nr}:${k}:${s}`, ebene: 'GOZ', nr, zahn: k, anzahl: 1, sitzung: s, grund: leitung ? 'Leitungsanästhesie' : 'Infiltrationsanästhesie', auto: true })
    }
    // Anästhetikum als Material
    const anae = materialFuerKlasse('anaesthetikum', klasse)
    if (anae) positionen.push({ id: `mat:anae:${s}`, ebene: 'MAT', nr: anae.id, zahn: '', anzahl: Math.max(1, kiefer.size) * 2, sitzung: s, text: `${anae.titel}`, material: true, auto: true, grund: 'Lokalanästhetikum' })

    // OP-Zuschlag: nur der höchste (nach der höchstbewerteten Einzelleistung)
    const hoechste = inSitzung.slice().sort((a, b) => punkte(b.nr) - punkte(a.nr))[0]
    if (hoechste) {
      const zuschlag = OP_ZUSCHLAG_STUFE[hoechste.nr]
      positionen.push({ id: `auto:opzuschlag:${s}`, ebene: 'GOZ', nr: zuschlag, zahn: '', anzahl: 1, sitzung: s, grund: `OP-Zuschlag (höchste Leistung: GOZ ${hoechste.nr})`, auto: true })
    }

    // Kontrollröntgen nach dem Eingriff (Einzelzahnaufnahme)
    positionen.push({ id: `auto:roentgen-kontrolle:${s}`, ebene: 'GOAE', nr: '5000', zahn: '', anzahl: 1, sitzung: s, grund: 'Kontrollröntgen nach dem Eingriff', auto: true })
  }

  // Globale Bildgebung (Planung, Sitzung 1)
  const b = plan.global.bildgebung
  if (b === 'opg' || b === 'opg+dvt') positionen.push({ id: 'auto:bild:opg', ebene: 'GOAE', nr: '5004', zahn: '', anzahl: 1, sitzung: 1, grund: 'Panoramaschichtaufnahme (OPG)', auto: true })
  if (b === 'dvt' || b === 'opg+dvt') {
    positionen.push({ id: 'auto:bild:dvt', ebene: 'GOAE', nr: '5370', zahn: '', anzahl: 1, sitzung: 1, grund: 'DVT des Kopfbereichs', auto: true })
    positionen.push({ id: 'auto:bild:dvt-3d', ebene: 'GOAE', nr: '5377', zahn: '', anzahl: 1, sitzung: 1, grund: 'Zuschlag 3D-Rekonstruktion', auto: true })
  }

  if (plan.global.sedierung === 'itn') hinweise.push('Intubationsnarkose ist eine Fremdleistung (Anästhesist) nach § 4 Abs. 5 GOZ und wird gesondert durch den Anästhesisten berechnet.')

  return { positionen, hinweise }
}

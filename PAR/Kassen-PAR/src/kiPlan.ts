/** Der Kassen-PAR-Fall für die KI-Zeile (lesen). */
import type { ParFall } from './types'
import type { Pruefmeldung } from './engine/pruefung'
import type { streckeRechnen } from './engine/leistungen'
import { leseDienst, type PlanKiDienst } from './planKi'

type Strecke = ReturnType<typeof streckeRechnen>

export function parKi(lesen: () => { fall: ParFall; gesperrt: boolean; strecke: Strecke; meldungen: Pruefmeldung[] }): PlanKiDienst {
  return leseDienst(() => {
    const { fall, gesperrt, strecke, meldungen } = lesen()
    return {
      planart: 'kassen-par', name: 'Parodontitis-Behandlungsstrecke der gesetzlichen Kasse (BEMA Teil 4, PAR-Richtlinie)',
      nummer: fall.nummer, gesperrt, kann: [], ebenen: [],
      positionen: strecke.je.flatMap(({ termin, r }) => r.positionen.map((p) => ({
        id: `${termin.id}|${p.schluessel}`, ebene: p.privat ? 'GOZ' : p.sys, nr: p.nr, zahn: '', anzahl: p.menge,
        ...(p.faktor != null ? { faktor: p.faktor } : {}),
        betrag: p.euro, text: p.titel, sitzung: `${termin.titel}${termin.datum ? ` ${termin.datum}` : ''}${termin.erbracht ? ' (erbracht)' : ''}`, auto: true,
      }))),
      summen: { gesamt: strecke.summe, kasse: strecke.kasse, privat: strecke.privat, erbracht: strecke.erbracht },
      angaben: {
        termine: fall.termine.map((t) => `${t.titel}${t.datum ? ` am ${t.datum}` : ''}${t.erbracht ? ', erbracht' : ''}`).join('; ') || 'keine',
        modus: String(fall.modus),
        cpt: fall.mitCPT ? 'chirurgische Therapie vorgesehen' : 'keine chirurgische Therapie vorgesehen',
        aufbau: 'Die Leistungen je Termin wählt die Praxis über die Kacheln der Strecke.',
      },
      schalter: [],
      hinweise: meldungen.map((m) => ({ stufe: m.art === 'hinweis' ? 'info' as const : m.art, text: `${m.bereich}: ${m.text}` })),
    }
  }, () => lesen().strecke.summe)
}

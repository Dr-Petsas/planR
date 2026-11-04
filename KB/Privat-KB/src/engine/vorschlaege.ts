// Schlaue Ergänzungen zum Plan: je nach Inhalt und Thema die wenigen Kombinationen, die fachlich
// fehlen – mit Grund und Mehrbetrag. Bereits enthaltene Leistungen werden nicht vorgeschlagen.

import { RESMED_MUNDOEFFNUNG, VORLAGEN, type VorlagenPosition } from '../data/katalog'
import type { Einstellungen, Plan, Position, Thema } from '../types'
import { abformungAnwenden, istUkps, rechnen, umfangAnwenden, vorlageAnwenden } from './kb'

export interface Vorschlag {
  id: string
  titel: string
  warum: string
  pos: VorlagenPosition[]
}

const vorlage = (id: string) => VORLAGEN.find((v) => v.id === id)?.pos ?? []

const KANDIDATEN: (Vorschlag & { passt: (h: Hat) => boolean })[] = [
  {
    id: 'titration', titel: 'Nachadaption und Kontrollen', warum: 'Die UKPS wirkt erst nach schrittweisem Vorschub – Sitzungen gleich mit einplanen',
    pos: vorlage('ukps-titration'), passt: (h) => h.ukps && !h.analog('5090'),
  },
  {
    id: 'morgenschiene', titel: 'Morgenschiene', warum: 'Tiefziehschiene zum Zurückführen des Bisses nach der Nacht – beugt Bissveränderung durch die UKPS vor',
    pos: [{ ebene: 'GOZ', nr: '7000', anzahl: 1 }, { ebene: 'LABOR', nr: '0001', anzahl: 1 }, { ebene: 'LABOR', nr: '7601', anzahl: 1 }],
    passt: (h) => h.ukps && !h.goz('7000'),
  },
  {
    id: 'mundoeffnung', titel: 'Mundöffnungsbegrenzung', warum: 'Bei Mundatmung bleibt der Unterkiefer vorn – sonst verliert die UKPS Wirkung',
    pos: [RESMED_MUNDOEFFNUNG], passt: (h) => h.labor('7607') && !h.labor('7628'),
  },
  {
    id: 'fal', titel: 'Klinische Funktionsanalyse', warum: 'Begründet die Schiene medizinisch – PKV und Beihilfe fragen oft danach',
    pos: vorlage('fal'), passt: (h) => h.schiene && !h.goz('8000'),
  },
  {
    id: 'fdi', titel: 'Instrumentelle Funktionsanalyse', warum: 'Registrat, Gesichtsbogen und Modellanalyse – für eine exakt eingestellte Schiene',
    pos: vorlage('fdi'), passt: (h) => h.schiene && h.goz('8000') && !['8020', '8030', '8035'].some(h.goz),
  },
  {
    id: 'kontrolle', titel: 'Kontrollen und Einschleifen', warum: 'Eine adjustierte Schiene braucht Nachkontrollen – sonst fehlen sie später in der Rechnung',
    pos: vorlage('kontrolle'), passt: (h) => h.schiene && !h.goz('7040'),
  },
  {
    id: 'opg', titel: 'OPG (Röntgen)', warum: 'Ausgangsbefund von Zähnen und Kiefergelenken – nur ohne aktuelle Aufnahme',
    pos: [{ ebene: 'GOAE', nr: '5004', anzahl: 1 }], passt: (h) => (h.schiene || h.ukps) && !h.goae('5004'),
  },
  {
    id: 'frs', titel: 'Fernröntgen mit Atemwegsanalyse', warum: 'Zeigt den Rachenraum (PAS) – untermauert die UKPS-Indikation',
    pos: [{ ebene: 'GOAE', nr: '5090', anzahl: 1 }], passt: (h) => h.ukps && !h.goae('5090'),
  },
]

const REIHENFOLGE: Record<Thema | 'keins', string[]> = {
  osas: ['titration', 'morgenschiene', 'mundoeffnung', 'opg', 'frs'],
  bruxismus: ['kontrolle', 'fal', 'opg', 'fdi'],
  cmd: ['fal', 'fdi', 'opg', 'kontrolle'],
  keins: ['titration', 'kontrolle', 'fal', 'morgenschiene', 'opg', 'mundoeffnung', 'fdi', 'frs'],
}

interface Hat {
  ukps: boolean
  schiene: boolean
  goz: (nr: string) => boolean
  analog: (nr: string) => boolean
  goae: (nr: string) => boolean
  labor: (nr: string) => boolean
}

function hat(positionen: Position[]): Hat {
  const da = (f: (p: Position) => boolean) => positionen.some((p) => p.anzahl > 0 && f(p))
  const goz = (nr: string) => da((p) => p.ebene === 'GOZ' && !p.analog && p.nr === nr)
  return {
    ukps: istUkps(positionen),
    schiene: goz('7010') || goz('7000'),
    goz,
    analog: (nr) => da((p) => p.ebene === 'GOZ' && !!p.analog && p.nr === nr),
    goae: (nr) => da((p) => p.ebene === 'GOAE' && p.nr === nr),
    labor: (nr) => da((p) => p.ebene === 'LABOR' && p.nr === nr),
  }
}

/** Ergänzt den Plan um einen Vorschlag (Abformweg und Umfang-Regler bleiben stimmig). */
export function vorschlagAnwenden(plan: Plan, v: Vorschlag, einst: Einstellungen): Plan {
  const neu = vorlageAnwenden(plan.positionen.filter((p) => !p.umfang), v.pos, einst)
  const pos = plan.abformung === 'scan' ? abformungAnwenden(neu, 'scan') : neu
  return { ...plan, positionen: umfangAnwenden(pos, plan.regler.faktor, plan.thema) }
}

/** Höchstens `max` passende Ergänzungen, nach Thema sortiert, jeweils mit Mehrbetrag (brutto). */
export function vorschlaege(plan: Plan, einst: Einstellungen, max = 4): (Vorschlag & { mehr: number })[] {
  const h = hat(plan.positionen)
  const vorher = rechnen(plan, einst).gesamt
  return REIHENFOLGE[plan.thema ?? 'keins']
    .map((id) => KANDIDATEN.find((k) => k.id === id)!)
    .filter((k) => k.passt(h))
    .slice(0, max)
    .map(({ passt: _, ...v }) => ({ ...v, mehr: Math.round((rechnen(vorschlagAnwenden(plan, v, einst), einst).gesamt - vorher) * 100) / 100 }))
}

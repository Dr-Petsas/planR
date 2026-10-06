import type { Ebene, FestzuschussBefund, HkpPlan, KlinischeAngaben, Position, Reparatur, ZahnZeilen } from '../types'
import { reparaturenAnwenden } from './reparaturen'
import { implantatPositionen } from './implantat'
import { abformungAnwenden, implantatAbformung } from './abformung'
import { TP_ZUORDNUNG, therapieplanAnwenden } from './therapie'
import {
  FEHLEND, KRONE_NOETIG, OBERKIEFER, TEILKRONE_NOETIG, UNTERKIEFER, VERSORGUNG_NOETIG,
  imVerblendbereich, istFrontzahn, istWeisheitszahn, kieferVon,
} from './zahnschema'

export interface RegelErgebnis {
  R: Record<string, string>
  befunde: FestzuschussBefund[]
  positionen: Position[]
  hinweise: string[]
}

let zaehler = 0
const id = () => `auto-${Date.now().toString(36)}-${(zaehler++).toString(36)}`

export { TP_ZUORDNUNG }

interface Luecke {
  zaehne: string[]
  vor: string
  nach: string
}

function pos(ebene: Ebene, nr: string, zahn: string, anzahl = 1): Position {
  return { id: id(), ebene, nr, zahn, anzahl, auto: true }
}

function befund(nr: string, zahnGebiet: string, anzahl = 1): FestzuschussBefund {
  return { id: id(), nr, zahnGebiet, anzahl, auto: true }
}

const kuerzel = (z: ZahnZeilen | undefined) => (z?.B ?? '').trim().toLowerCase()

/** Analysiert einen Kiefer: vorhandene Zähne, Lücken, Freiend */
function kieferAnalyse(reihe: string[], zaehne: Record<string, ZahnZeilen>) {
  const sitz = reihe.filter((z) => kuerzel(zaehne[z]) !== ')(')
  const fehlt = (z: string) => FEHLEND.has(kuerzel(zaehne[z]))
  const vorhanden = sitz.filter((z) => !fehlt(z))
  const fehlendOhne8 = sitz.filter((z) => fehlt(z) && !istWeisheitszahn(z))

  // Zahnbegrenzte Lücken zwischen vorhandenen Zähnen
  const luecken: Luecke[] = []
  let start = -1
  for (let i = 0; i < sitz.length; i++) {
    if (fehlt(sitz[i])) {
      if (start < 0) start = i
    } else {
      if (start > 0) luecken.push({ zaehne: sitz.slice(start, i), vor: sitz[start - 1], nach: sitz[i] })
      start = -1
    }
  }

  // Freiend: distale Zähne fehlen (Zahn 8 vorhanden gilt als Pfeiler)
  const freiendSeiten: { zaehne: string[]; bedarf: boolean }[] = []
  for (const seite of [sitz, [...sitz].reverse()]) {
    const distal: string[] = []
    for (const z of seite) {
      if (!fehlt(z)) break
      distal.push(z)
    }
    const ohne8 = distal.filter((z) => !istWeisheitszahn(z))
    // ein einzelner fehlender 7er ohne Versorgungsbedarf löst keine Freiendsituation aus
    const bedarf = ohne8.some((z) => VERSORGUNG_NOETIG.has(kuerzel(zaehne[z])))
    if (ohne8.length >= 2 || (ohne8.length === 1 && bedarf && kuerzel(zaehne[ohne8[0]]) !== 'f')) freiendSeiten.push({ zaehne: ohne8, bedarf })
  }
  return { sitz, vorhanden, fehlendOhne8, luecken, freiendSeiten, fehlt }
}

/**
 * Endpfeiler einer bis zum Eckzahn oder ersten Prämolaren verkürzten oder unterbrochenen Zahnreihe
 * (mindestens zwei nebeneinander fehlende Zähne distal davon) – Voraussetzung für Befund 3.2.
 */
function endpfeiler32(seite: string[], fehlt: (z: string) => boolean): string | undefined {
  const anPosition = (p: number) => seite.find((z) => Number(z[1]) === p)
  const fehltPos = (p: number) => {
    const z = anPosition(p)
    return !z || fehlt(z)
  }
  for (const p of [4, 3]) {
    const z = anPosition(p)
    if (z && !fehlt(z) && fehltPos(p + 1) && fehltPos(p + 2)) return z
  }
  return undefined
}

const IMPLANTAT_ERNEUERUNG = new Set(['skw', 'sbw'])
const IMPLANTAT_PROTHESE = new Set(['sew', 'sow', 'stw'])
const istImplantat = (k: string) => k.startsWith('s')

export interface RegelOptionen {
  /** endgültige Versorgung nicht sofort möglich – Interimsprothese (Befundklasse 5) */
  interimOK?: boolean
  interimUK?: boolean
  klinisch?: Partial<KlinischeAngaben>
  reparaturen?: Reparatur[]
}

/** Alle planbezogenen Eingaben der Regelengine außer dem Zahnschema */
export const regelOptionen = (plan: Pick<HkpPlan, 'weitere' | 'klinisch' | 'reparaturen'>): RegelOptionen =>
  ({ ...plan.weitere, klinisch: plan.klinisch, reparaturen: plan.reparaturen })

const KRONE_R = /^(K|KV|KH|KVH|PK|T|TV|T2|T2V|R)$/

/** Zuschlagsbefunde aus klinischen Angaben (1.4, 1.5, 2.6, 4.5, 4.9, 7.6) */
function zuschlaegeAnsetzen(
  k: Partial<KlinischeAngaben>, R: Record<string, string>, anker: Set<string>,
  befunde: FestzuschussBefund[], positionen: Position[], hinweise: string[],
) {
  const hatKrone = (z: string) => KRONE_R.test(R[z] ?? '') || anker.has(z)
  const spaeter = new Set(k.stiftNachtraeglich ?? [])
  const stift = (nr: '1.4' | '1.5', z: string, ...ps: Position[]) => {
    const n = spaeter.has(z) ? { nachtraeglich: true } : {}
    befunde.push({ ...befund(nr, z), ...n })
    positionen.push(...ps.map((p) => ({ ...p, ...n })))
    if (!hatKrone(z)) hinweise.push(`Zahn ${z}: Stiftaufbau (${nr}) ohne geplante Krone – Befund nur zusammen mit einer Überkronung ansetzbar.`)
  }
  const gesehen = new Set<string>()
  for (const [liste, nr, ps] of [
    [k.stiftKonfektioniert, '1.4', (z: string) => [pos('BEMA', '18a', z)]],
    [k.stiftGegossen, '1.5', (z: string) => [pos('BEMA', '18b', z), pos('BEL', '1050', z)]],
    // Kompendium S. 35/113: adhäsiv befestigte bzw. nicht-metallische Stifte sind gleichartig
    [k.stiftAdhaesiv, '1.4', (z: string) => [pos('GOZ', '2180', z), pos('GOZ', '2195', z), pos('GOZ', '2197', z)]],
  ] as const) {
    for (const z of liste ?? []) {
      if (gesehen.has(z)) { hinweise.push(`Zahn ${z}: mehrere Stiftaufbauten angegeben – je Zahn nur ein Befund 1.4 oder 1.5.`); continue }
      gesehen.add(z)
      stift(nr, z, ...ps(z))
    }
  }
  for (const z of spaeter) if (!gesehen.has(z)) hinweise.push(`Zahn ${z}: als nachträglicher Stiftbefund markiert, aber kein Stiftaufbau angegeben.`)

  const disparallel = new Set(k.disparallel ?? [])
  const luecken = befunde.filter((b) => /^2\.[1-5]$/.test(b.nr))
  for (const z of disparallel) if (!anker.has(z)) hinweise.push(`Zahn ${z}: als disparallel markiert, ist aber kein Brückenanker (2.6 nur bei festsitzender Brücke).`)
  for (const l of luecken) {
    const pfeiler = l.zahnGebiet.split('-').find((z) => disparallel.has(z))
    if (!pfeiler) continue
    befunde.push(befund('2.6', l.zahnGebiet))
    positionen.push(pos('BEMA', '91e', pfeiler), pos('BEL', '1341', pfeiler))
  }

  const total = (kiefer: 'OK' | 'UK') => befunde.some((b) => /^4\.[1-4]$/.test(b.nr) && b.zahnGebiet === kiefer)
  for (const kiefer of ['OK', 'UK'] as const) {
    if (!k[kiefer === 'OK' ? 'metallbasisOK' : 'metallbasisUK']) continue
    if (total(kiefer)) {
      befunde.push(befund('4.5', kiefer))
      positionen.push(pos('BEMA', '98e', kiefer), pos('BEL', '2010', kiefer))
    } else hinweise.push(`${kiefer}: Metallbasis (4.5) nur bei Total- oder schleimhautgetragener Deckprothese (Befund 4.1–4.4), nicht bei Modellguss.`)
  }

  if (k.stuetzstift) {
    const kiefer = (['OK', 'UK'] as const).filter(total)
    if (kiefer.length) {
      befunde.push(befund('4.9', kiefer.join(',')))
      positionen.push(pos('BEMA', '98d', kiefer[0]), pos('BEL', '0214', kiefer[0]), pos('BEL', '0230', kiefer[0]))
    } else hinweise.push('Stützstiftregistrierung (4.9) nur bei Total- oder schleimhautgetragener Deckprothese (Befund 4.1–4.4).')
  }

  for (const kiefer of ['OK', 'UK'] as const) {
    if (!k[kiefer === 'OK' ? 'atrophieOK' : 'atrophieUK']) continue
    if (!befunde.some((b) => b.nr === '7.5' && b.zahnGebiet === kiefer)) {
      hinweise.push(`${kiefer}: atrophierter Kiefer (7.6) nur als Zuschlag zu Befund 7.5 (implantatgetragene Prothese).`)
      continue
    }
    const konnektoren = Object.entries(R).filter(([z, r]) => kieferVon(z) === kiefer && (r === 'SO' || r === 'ST')).length
    if (!konnektoren) {
      hinweise.push(`${kiefer}: 7.6 je implantatgetragenem Konnektor – im Zahnschema keine Konnektoren (sow/stw) eingetragen.`)
      continue
    }
    befunde.push(befund('7.6', kiefer, Math.min(konnektoren, 4)))
    if (konnektoren > 4) hinweise.push(`${kiefer}: 7.6 höchstens viermal je Kiefer (${konnektoren} Konnektoren).`)
    hinweise.push(`${kiefer}: Ausnahmefall Nr. 36 ZE-Richtlinie (atrophierter zahnloser Kiefer) – Regelversorgung nach BEMA mit Implantat-Kennzeichnung, bitte Leistungen prüfen.`)
  }
}

export function regelversorgungErmitteln(zaehne: Record<string, ZahnZeilen>, optionen: RegelOptionen = {}): RegelErgebnis {
  zaehler = 0
  const R: Record<string, string> = {}
  const befunde: FestzuschussBefund[] = []
  const positionen: Position[] = []
  const hinweise: string[] = []
  const anker = new Set<string>()
  const glieder = new Set<string>()
  const teleskope = new Set<string>()
  const verblend27: string[] = []
  let festsitzend = false
  const prothesenKiefer: string[] = []

  const teleskopAnker = (z: string, nr: '3.2' | '4.6') => {
    teleskope.add(z)
    befunde.push(befund(nr, z))
    R[z] = imVerblendbereich(z) ? 'TV' : 'T'
    if (imVerblendbereich(z)) befunde.push(befund('4.7', z))
    positionen.push(pos('BEMA', '91d', z), pos('BEMA', '19', z), pos('BEL', '1200', z))
    if (imVerblendbereich(z)) positionen.push(pos('BEL', '1620', z))
  }

  for (const [kiefer, reihe] of [['OK', OBERKIEFER], ['UK', UNTERKIEFER]] as const) {
    const a = kieferAnalyse(reihe, zaehne)
    const kieferName = kiefer === 'OK' ? 'Oberkiefer' : 'Unterkiefer'
    const versorgungsLuecken = a.luecken.filter((l) => l.zaehne.some((z) => VERSORGUNG_NOETIG.has(kuerzel(zaehne[z]))))
    const neuVersorgung = versorgungsLuecken.length > 0 || a.freiendSeiten.some((f) => f.bedarf)
    for (const z of a.sitz) if (kuerzel(zaehne[z]) === 'x') hinweise.push(`Zahn ${z} ist nicht erhaltungswürdig (x) und wird als fehlend geplant.`)

    // ---- Befundklasse 5: Interimsversorgung ----
    if (kiefer === 'OK' ? optionen.interimOK : optionen.interimUK) {
      const n = a.fehlendOhne8.length
      if (a.vorhanden.length === 0) befunde.push(befund('5.4', kiefer))
      else if (n > 0) befunde.push(befund(n <= 4 ? '5.1' : n <= 8 ? '5.2' : '5.3', kiefer))
      if (a.vorhanden.length === 0) positionen.push(pos('BEMA', kiefer === 'OK' ? '97a' : '97b', kiefer))
      else if (n > 0) positionen.push(pos('BEMA', n <= 4 ? '96a' : n <= 8 ? '96b' : '96c', kiefer))
      if (n > 0) hinweise.push(`${kieferName}: Interimsprothese (Befund 5.x) – zahntechnische Leistungen bitte ergänzen.`)
      else hinweise.push(`${kieferName}: Interimsversorgung angekreuzt, aber kein fehlender Zahn im Befund.`)
    }

    // ---- Befund 6.10: erneuerungsbedürftiges Sekundärteleskop (t2w), Einarbeitung in die vorhandene Prothese ----
    const t2w = a.sitz.filter((z) => kuerzel(zaehne[z]) === 't2w')
    if (t2w.length && neuVersorgung) {
      hinweise.push(`${kieferName}: t2w bei Neuversorgung des Kiefers – das Teleskop wird mit der neuen Prothese geplant; 6.10 nur bei Erhalt der Prothese.`)
    } else if (t2w.length) {
      for (const z of t2w) {
        const verblend = imVerblendbereich(z)
        teleskope.add(z)
        R[z] = verblend ? 'T2V' : 'T2'
        befunde.push(befund('6.10', z))
        if (verblend) befunde.push(befund('4.7', z))
        positionen.push(pos('BEMA', '91d', z), pos('BEL', '1201', z))
        if (verblend) positionen.push(pos('BEL', '1620', z))
      }
      befunde.push(befund('6.3', kiefer))
      positionen.push(pos('BEMA', '100b', kiefer), pos('BEL', '0010', kiefer), pos('BEL', '8010', kiefer), pos('BEL', '8070', kiefer))
      hinweise.push(`${kieferName}: Sekundärteleskop ${t2w.join(', ')} erneuern (6.10) mit Einarbeitung in die Prothese (6.3, Modellgussbasis). Bei schleimhautgetragener Deckprothese stattdessen 6.2.`)
    }

    if (!neuVersorgung) continue

    // ---- Befundklasse 4: Restzahnbestand bis 3 Zähne oder zahnlos ----
    if (a.vorhanden.length <= 3) {
      const nr = a.vorhanden.length === 0 ? (kiefer === 'OK' ? '4.2' : '4.4') : kiefer === 'OK' ? '4.1' : '4.3'
      befunde.push(befund(nr, kiefer))
      for (const z of a.sitz) if (a.fehlt(z) && !istWeisheitszahn(z) && kuerzel(zaehne[z]) !== 'rw' && !istImplantat(kuerzel(zaehne[z]))) R[z] = 'E'
      prothesenKiefer.push(kiefer)
      positionen.push(pos('BEMA', kiefer === 'OK' ? '97a' : '97b', kiefer))
      positionen.push(pos('BEMA', kiefer === 'OK' ? '98b' : '98c', kiefer))
      const n = a.fehlendOhne8.length
      positionen.push(
        pos('BEL', '0010', kiefer, 2), pos('BEL', '0211', kiefer), pos('BEL', '0213', kiefer), pos('BEL', '0220', kiefer),
        pos('BEL', '0120', kiefer), pos('BEL', '3010', kiefer), pos('BEL', '3020', kiefer, n),
        pos('BEL', '3610', kiefer), pos('BEL', '3620', kiefer, n),
      )
      // Kombinationsversorgung: Teleskopkronen (4.6/4.7) bzw. Wurzelstiftkappen (4.8) an den Restzähnen
      for (const z of a.vorhanden) {
        const k = kuerzel(zaehne[z])
        if (k === 't' || istImplantat(k)) continue
        teleskopAnker(z, '4.6')
      }
      for (const z of a.sitz.filter((z) => kuerzel(zaehne[z]) === 'rw')) {
        befunde.push(befund('4.8', z))
        R[z] = 'R'
        positionen.push(pos('BEMA', '90', z), pos('BEL', '1013', z), pos('BEL', '1343', z))
      }
      if (a.vorhanden.length > 0)
        hinweise.push(`${kieferName}: Restzahnbestand bis 3 Zähne – Kombinationsversorgung mit Teleskopkronen (4.6/4.7) angesetzt. Notwendigkeit der dentalen Verankerung bitte prüfen.`)
      continue
    }

    // ---- Befundklasse 2: zahnbegrenzte Lücken (Lückensituation I) ----
    const passtKlasse2 =
      a.freiendSeiten.length === 0 &&
      a.fehlendOhne8.length <= 4 &&
      versorgungsLuecken.every((l) => l.zaehne.length <= 3 || (l.zaehne.length === 4 && l.zaehne.every(istFrontzahn)))

    if (passtKlasse2) {
      festsitzend = true
      let vorherige: Luecke | undefined
      for (const l of versorgungsLuecken) {
        const n = l.zaehne.length
        let nr = n === 1 ? '2.1' : n === 2 ? '2.2' : n === 3 ? '2.3' : '2.4'
        if (n === 1 && vorherige && vorherige.nach === l.vor) nr = '2.5'
        befunde.push(befund(nr, `${l.vor}-${l.nach}`))
        for (const z of [l.vor, l.nach]) {
          anker.add(z)
          R[z] = imVerblendbereich(z) ? 'KV' : 'K'
        }
        for (const z of l.zaehne) {
          glieder.add(z)
          R[z] = imVerblendbereich(z) ? 'BV' : 'B'
        }
        positionen.push(pos('BEMA', '92', `${l.vor}-${l.nach}`))
        vorherige = l
      }
      continue
    }

    // ---- Befundklasse 3: übrige Lücken / Freiend -> Modellgussprothese ----
    befunde.push(befund('3.1', kiefer))
    prothesenKiefer.push(kiefer)
    // fehlender 8er am Ende einer Freiendlücke zählt mit (E für BEMA 96, ohne Einfluss auf den Festzuschuss)
    const zuErsetzen = a.sitz.filter((z) => a.fehlt(z) && !istImplantat(kuerzel(zaehne[z])) &&
      (!istWeisheitszahn(z) || (a.sitz.includes(`${z[0]}7`) && a.fehlt(`${z[0]}7`))))
    for (const z of zuErsetzen) R[z] = 'E'
    // Halteelemente an den lückenbegrenzenden Zähnen
    const halte = new Set<string>()
    for (let i = 0; i < a.sitz.length; i++) {
      const z = a.sitz[i]
      if (a.fehlt(z)) continue
      if ((i > 0 && a.fehlt(a.sitz[i - 1])) || (i < a.sitz.length - 1 && a.fehlt(a.sitz[i + 1]))) halte.add(z)
    }
    // ---- Befund 3.2: beidseitig bis 3er/4er verkürzte oder unterbrochene Zahnreihe -> Teleskopkronen ----
    const seite = (q: string[]) => a.sitz.filter((z) => q.includes(z[0])).sort((x, y) => Number(x[1]) - Number(y[1]))
    const pfeiler32 = [endpfeiler32(seite(['1', '4']), a.fehlt), endpfeiler32(seite(['2', '3']), a.fehlt)]
    if (pfeiler32[0] && pfeiler32[1]) {
      for (const z of pfeiler32 as string[]) {
        halte.delete(z)
        teleskopAnker(z, '3.2')
      }
      hinweise.push(`${kieferName}: Befund 3.2 – Kombinationsversorgung mit Teleskopkronen an ${pfeiler32.join(' und ')}. Notwendigkeit der dentalen Verankerung bitte prüfen.`)
    }
    for (const z of halte) R[z] = KRONE_NOETIG.has(kuerzel(zaehne[z])) ? (imVerblendbereich(z) ? 'KVH' : 'KH') : 'H'
    const n = zuErsetzen.length
    positionen.push(pos('BEMA', n <= 4 ? '96a' : n <= 8 ? '96b' : '96c', kiefer))
    positionen.push(pos('BEMA', '98g', kiefer))
    if (halte.size) positionen.push(pos('BEMA', halte.size >= 2 ? '98h/2' : '98h/1', kiefer))
    positionen.push(
      pos('BEL', '0010', kiefer, 2), pos('BEL', '0021', kiefer), pos('BEL', '0213', kiefer),
      pos('BEL', '0220', kiefer), pos('BEL', '0120', kiefer), pos('BEL', '2010', kiefer),
    )
    hinweise.push(`${kieferName}: Modellguss – BEMA 98a und BEL 0211 nur bei Abformung mit individuellem Löffel ergänzen (in den Berechnungsbeispielen des Kompendiums nicht enthalten).`)
    if (halte.size) positionen.push(pos('BEL', '2031', [...halte].join(','), halte.size))
    positionen.push(pos('BEL', '3010', kiefer), pos('BEL', '3030', kiefer, n), pos('BEL', '3610', kiefer), pos('BEL', '3620', kiefer, n))
  }

  // ---- Befundklasse 7: erneuerungsbedürftige Suprakonstruktionen ----
  for (const [kiefer, reihe] of [['OK', OBERKIEFER], ['UK', UNTERKIEFER]] as const) {
    const natuerlich = (z: string | undefined) => {
      if (!z) return false
      const k = kuerzel(zaehne[z])
      return !FEHLEND.has(k) && !istImplantat(k)
    }
    let n72 = 0
    for (let i = 0; i < reihe.length; i++) {
      const z = reihe[i]
      const k = kuerzel(zaehne[z])
      if (!IMPLANTAT_ERNEUERUNG.has(k)) continue
      const einzelzahnluecke = k === 'skw' && natuerlich(reihe[i - 1]) && natuerlich(reihe[i + 1])
      if (einzelzahnluecke) befunde.push(befund('7.1', z))
      else if (n72 < 4) {
        befunde.push(befund('7.2', z))
        n72++
      } else hinweise.push(`Zahn ${z}: Befund 7.2 ist höchstens viermal je Kiefer ansetzbar.`)
      const verblend = imVerblendbereich(z)
      R[z] = (k === 'skw' ? 'SK' : 'SB') + (verblend ? 'V' : '')
      if (k === 'skw' && verblend) befunde.push(befund('1.3', z))
      const zuo = TP_ZUORDNUNG[R[z]]
      if (zuo.goz) positionen.push(pos('GOZ', zuo.goz, z))
      for (const b of zuo.beb) positionen.push(pos('BEB', b, z))
    }
    const prothese = reihe.filter((z) => IMPLANTAT_PROTHESE.has(kuerzel(zaehne[z])))
    if (prothese.length) {
      befunde.push(befund('7.5', kiefer))
      for (const z of prothese) R[z] = kuerzel(zaehne[z]).slice(0, 2).toUpperCase()
      // Leistungen nach den Berechnungsbeispielen des Kompendiums (GOZ/BEB, Regelversorgung nur im Ausnahmefall Nr. 36)
      const zahnlos = reihe.filter((z) => !istWeisheitszahn(z)).every((z) => !natuerlich(z))
      const ersetzt = reihe.filter((z) => /^se/.test(kuerzel(zaehne[z]))).length
      const konnektoren = reihe.filter((z) => kuerzel(zaehne[z]) === 'sow').length
      const sekundaer = reihe.filter((z) => kuerzel(zaehne[z]) === 'stw').length
      if (zahnlos) {
        positionen.push(pos('GOZ', kiefer === 'OK' ? '5220' : '5230', kiefer), pos('GOZ', kiefer === 'OK' ? '5180' : '5190', kiefer))
        if (konnektoren) positionen.push(pos('GOZ', '5090', kiefer, konnektoren))
        positionen.push(pos('BEB', '0018', kiefer), pos('BEB', '1108', kiefer), pos('BEB', '6001', kiefer), pos('BEB', '6002', kiefer, ersetzt),
          pos('BEB', '6301', kiefer), pos('BEB', '6302', kiefer, ersetzt))
      } else {
        positionen.push(pos('GOZ', '5210', kiefer))
        if (sekundaer) positionen.push(pos('GOZ', '5100', kiefer, sekundaer))
        positionen.push(pos('BEB', '0018', kiefer), pos('BEB', '4001', kiefer), pos('BEB', '6001', kiefer), pos('BEB', '6003', kiefer, ersetzt),
          pos('BEB', '6311', kiefer), pos('BEB', '6312', kiefer, ersetzt))
      }
      hinweise.push(`${kiefer === 'OK' ? 'Oberkiefer' : 'Unterkiefer'}: Implantatgetragene Prothesenkonstruktion (Befund 7.5) – Leistungen nach GOZ/BEB vorgeschlagen, bitte prüfen. Natürliche Pfeiler (tw) werden gesondert geplant.`)
    }
    if (reihe.some((z) => IMPLANTAT_ERNEUERUNG.has(kuerzel(zaehne[z]))))
      hinweise.push(`${kiefer === 'OK' ? 'Oberkiefer' : 'Unterkiefer'}: Suprakonstruktionen werden nach GOZ/BEB abgerechnet; der Festzuschuss richtet sich nach Befund 7.1/7.2. Implantologische Leistungen gehören nicht in den HKP.`)
  }

  // ---- Befundklasse 1: Einzelkronen ----
  for (const z of [...OBERKIEFER, ...UNTERKIEFER]) {
    const k = kuerzel(zaehne[z])
    if (anker.has(z) || glieder.has(z) || teleskope.has(z)) continue
    if (KRONE_NOETIG.has(k)) {
      festsitzend = true
      befunde.push(befund('1.1', z))
      const halte = R[z]?.endsWith('H')
      if (!halte) R[z] = imVerblendbereich(z) ? 'KV' : 'K'
      if (imVerblendbereich(z)) befunde.push(befund('1.3', z))
      positionen.push(pos('BEMA', imVerblendbereich(z) ? '20b' : '20a', z), pos('BEMA', '19', z))
    } else if (TEILKRONE_NOETIG.has(k)) {
      festsitzend = true
      befunde.push(befund('1.2', z))
      R[z] = 'PK'
      positionen.push(pos('BEMA', '20c', z), pos('BEMA', '19', z))
    }
  }

  // ---- Brückenanker und -glieder ----
  for (const z of anker) {
    positionen.push(pos('BEMA', imVerblendbereich(z) ? '91b' : '91a', z), pos('BEMA', '19', z))
    if (imVerblendbereich(z)) verblend27.push(z)
  }
  for (const z of glieder) {
    positionen.push(pos('BEMA', '19', z))
    if (imVerblendbereich(z)) verblend27.push(z)
  }
  if (verblend27.length) befunde.push(befund('2.7', verblend27.join(','), verblend27.length))

  // ---- Laborleistungen festsitzender Zahnersatz (BEL II) ----
  for (const z of Object.keys(R)) {
    const r = R[z]
    if (r === 'K' || r === 'KH') positionen.push(pos('BEL', '1021', z))
    if (r === 'KV' || r === 'KVH') positionen.push(pos('BEL', '1024', z), pos('BEL', '1620', z))
    if (r === 'PK') positionen.push(pos('BEL', '1022', z))
    if (r === 'B') positionen.push(pos('BEL', '1100', z))
    if (r === 'BV') positionen.push(pos('BEL', '1100', z), pos('BEL', '1620', z))
  }
  const einheiten = Object.values(R).filter((r) => /^(K|KV|KH|KVH|PK|B|BV)$/.test(r)).length
  if (festsitzend && einheiten) {
    const kiefer = new Set(Object.keys(R).filter((z) => /^(K|KV|KH|KVH|PK|B|BV)$/.test(R[z])).map((z) => (z[0] <= '2' ? 'OK' : 'UK')))
    positionen.push(pos('BEL', '0010', '', 1), pos('BEL', '0051', [...kiefer].join(','), kiefer.size), pos('BEL', '0120', ''))
    positionen.push(pos('BEL', '9700', '', einheiten))
  }
  zuschlaegeAnsetzen(optionen.klinisch ?? {}, R, anker, befunde, positionen, hinweise)

  const neuePlanung = befunde.some((b) => !b.nr.startsWith('6.') && !(b.nr === '4.7' && R[b.zahnGebiet]?.startsWith('T2')))
  const rep = reparaturenAnwenden(optionen.reparaturen ?? [])
  befunde.push(...rep.befunde)
  positionen.push(...rep.positionen)
  hinweise.push(...new Set(rep.hinweise))

  if (neuePlanung) {
    positionen.unshift(pos('BEMA', '7b', ''))
    positionen.push(pos('BEL', '9330', '', 2))
  }
  if (!befunde.length) hinweise.push('Aus Zeile B ergibt sich kein Versorgungsbedarf.')
  return { R, befunde, positionen, hinweise }
}

/**
 * Ersetzt für Zähne mit Therapieplanung (TP ≠ R) die zahnärztlichen Leistungen durch GOZ
 * und die zahntechnischen durch BEB. Provisorien und fallbezogene Leistungen bleiben im BEMA/BEL.
 */
export function therapieAnwenden(
  regel: RegelErgebnis, zaehne: Record<string, ZahnZeilen>,
  plan?: Pick<HkpPlan, 'implantat' | 'einstellungen'> & Partial<Pick<HkpPlan, 'abformung' | 'abformungProthese'>>,
): RegelErgebnis {
  const r = therapieplanAnwenden(regel, zaehne)
  if (!plan) return r
  const mitR = { ...zaehne, ...Object.fromEntries(Object.entries(r.R).map(([z, R]) => [z, { ...(zaehne[z] ?? { B: '', TP: '' }), R }])) }
  const imp = implantatPositionen(mitR, { ...plan.implantat, abformung: implantatAbformung(plan) }, plan.einstellungen.labor === 'gewerbe' ? 'fremd' : undefined)
  const abf = abformungAnwenden([...r.positionen, ...imp.positionen], mitR, plan.abformung ?? '', plan.abformungProthese ?? '', plan.einstellungen.labor === 'praxis')
  return { ...r, positionen: abf.positionen, hinweise: [...r.hinweise, ...imp.hinweise, ...abf.hinweise] }
}

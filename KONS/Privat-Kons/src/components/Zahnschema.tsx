import type { Plan, Therapie, ZahnLeistung } from '../types'
import { THERAPIE, THERAPIE_NACH_KUERZEL, THERAPIEN } from '../data/katalog'
import { OBERKIEFER, UNTERKIEFER, kanaeleTypisch } from '../engine/zahnschema'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
}

/** Was die Ziffer hinter dem Kürzel bedeutet. */
const ZIFFER: Partial<Record<Therapie, { feld: 'flaechen' | 'kanaele' | 'sitzungen'; max: number }>> = {
  komposit: { feld: 'flaechen', max: 5 },
  inlay: { feld: 'flaechen', max: 3 },
  goldhaemmer: { feld: 'flaechen', max: 3 },
  endo: { feld: 'kanaele', max: 5 },
  revision: { feld: 'kanaele', max: 5 },
  bleaching: { feld: 'sitzungen', max: 6 },
}

export function standardLeistung(therapie: Therapie, zahn: string): ZahnLeistung {
  switch (therapie) {
    case 'komposit': return { therapie, flaechen: 2 }
    case 'inlay': return { therapie, flaechen: 2, labor: 'keramik', sitzungen: 2 }
    case 'goldhaemmer': return { therapie, flaechen: 1 }
    case 'endo': return { therapie, kanaele: kanaeleTypisch(zahn), vital: true, sitzungen: 2 }
    case 'revision': return { therapie, kanaele: kanaeleTypisch(zahn), sitzungen: 2 }
    case 'vital': return { therapie, vitalArt: 'indirekt' }
    case 'bleaching': return { therapie, sitzungen: 2 }
    default: return { therapie }
  }
}

/** "W3" = Endo mit drei Kanälen, "F2" = zweiflächige Füllung, "B3" = drei Bleaching-Sitzungen. */
export function ausKuerzel(roh: string, zahn: string, vorher?: ZahnLeistung): ZahnLeistung | null | 'unbekannt' {
  const s = roh.trim().toUpperCase()
  if (!s) return null
  const t = THERAPIE_NACH_KUERZEL[s[0]]
  if (!t) return 'unbekannt'
  const basis = vorher?.therapie === t.id ? vorher : standardLeistung(t.id, zahn)
  const z = ZIFFER[t.id]
  const ziffer = /\d$/.test(s) ? Number(s.at(-1)) : 0
  if (!z || ziffer < 1) return basis
  return { ...basis, [z.feld]: Math.min(z.max, ziffer) }
}

export function kuerzelText(z: ZahnLeistung) {
  const f = ZIFFER[z.therapie]
  return `${THERAPIE[z.therapie].kuerzel}${f ? z[f.feld] ?? '' : ''}`
}

export default function Zahnschema({ plan, setPlan }: Props) {
  const setze = (zahn: string, roh: string) => {
    const neu = ausKuerzel(roh, zahn, plan.zaehne[zahn])
    const naechste = { ...plan.zaehne }
    if (neu === null || neu === 'unbekannt') delete naechste[zahn]
    else naechste[zahn] = neu
    setPlan({ ...plan, zaehne: naechste })
  }

  const reihe = (zaehne: string[], label: string) => (
    <div className="zs-reihe">
      <span className="zs-label">{label}</span>
      {zaehne.map((zahn) => {
        const z = plan.zaehne[zahn]
        return (
          <label key={zahn} className="zs-zelle">
            <input
              className={`zs-feld ${z ? `belegt zs-${THERAPIE[z.therapie].kasse}` : ''}`}
              value={z ? kuerzelText(z) : ''}
              maxLength={3}
              onChange={(e) => setze(zahn, e.target.value)}
              title={z ? `Zahn ${zahn}: ${THERAPIE[z.therapie].titel}` : `Zahn ${zahn}`}
            />
          </label>
        )
      })}
    </div>
  )

  const nummern = (zaehne: string[]) => (
    <div className="zs-reihe">
      <span className="zs-label" />
      {zaehne.map((z) => <span key={z} className="zs-nr">{z}</span>)}
    </div>
  )

  return (
    <div className="block">
      <h3>Zahnschema – Therapie je Zahn</h3>
      <p className="hilfe">
        Kürzel je Zahn, die Ziffer dahinter zählt mit: <b>F2</b> zweiflächige Füllung, <b>W3</b> Endo mit drei Kanälen,
        <b> B3</b> drei Bleaching-Sitzungen. Zusatzleistungen wählen Sie in der Tabelle darunter.
      </p>
      <div className="zahnschema">
        <div className="zs-kiefer">
          {nummern(OBERKIEFER)}
          {reihe(OBERKIEFER, 'OK')}
          <div className="zs-trenner"><span>rechts</span><span>links</span></div>
          {reihe(UNTERKIEFER, 'UK')}
          {nummern(UNTERKIEFER)}
        </div>
      </div>
      <div className="zs-hilfe">
        {THERAPIEN.map((t) => (
          <span key={t.id} className="chip" title={t.hinweis}><b>{t.kuerzel}</b> {t.kurz}</span>
        ))}
      </div>
    </div>
  )
}

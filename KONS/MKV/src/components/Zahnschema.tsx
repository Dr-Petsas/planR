import type { Plan, ZahnLeistung } from '../types'
import { THERAPIE, THERAPIE_NACH_KUERZEL, THERAPIEN } from '../data/katalog'
import { OBERKIEFER, UNTERKIEFER } from '../engine/zahnschema'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
}

/** Ein Kürzel mit Ziffer setzt gleich die Flächenzahl: "K3" = dreiflächige Kompositfüllung. */
export function ausKuerzel(roh: string, vorher?: ZahnLeistung): ZahnLeistung | null | 'unbekannt' {
  const s = roh.trim().toUpperCase()
  if (!s) return null
  const t = THERAPIE_NACH_KUERZEL[s[0]]
  if (!t) return 'unbekannt'
  const ziffer = /\d$/.test(s) ? Number(s.at(-1)) : 0
  const max = t.plastisch ? 5 : 3
  const flaechen = ziffer >= 1 ? Math.min(max, ziffer) : vorher?.therapie === t.id ? vorher.flaechen : 2
  const basis: ZahnLeistung = vorher?.therapie === t.id ? vorher : { therapie: t.id, flaechen, labor: t.id === 'inlay' ? 'keramik' : undefined }
  return { ...basis, flaechen: Math.min(max, flaechen) }
}

export default function Zahnschema({ plan, setPlan }: Props) {
  const setze = (zahn: string, roh: string) => {
    const neu = ausKuerzel(roh, plan.zaehne[zahn])
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
        const wert = z ? `${THERAPIE[z.therapie].kuerzel}${z.flaechen}` : ''
        return (
          <label key={zahn} className="zs-zelle">
            <input
              className={`zs-feld ${z ? `belegt zs-${z.therapie}` : ''}`}
              value={wert}
              maxLength={3}
              onChange={(e) => setze(zahn, e.target.value)}
              title={z ? `Zahn ${zahn}: ${THERAPIE[z.therapie].titel}, ${z.flaechen} Fläche(n)` : `Zahn ${zahn}`}
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
      <h3>Zahnschema – Füllung je Zahn</h3>
      <p className="hilfe">
        Kürzel und Flächenzahl eintragen, z. B. <b>K2</b> für eine zweiflächige Kompositfüllung oder <b>I3</b> für ein
        dreiflächiges Inlay. Feinheiten stellen Sie in der Tabelle darunter ein.
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

import type { Plan, ZahnLeistung } from '../types'
import { KATALOG_NACH_KUERZEL, KONS_KATALOG, kuerzelFuer } from '../data/katalog'
import { OBERKIEFER, UNTERKIEFER, kanaeleTypisch } from '../engine/zahnschema'

interface Props {
  plan: Plan
  setPlan: (p: Plan) => void
}

function standardLeistung(therapieId: string, zahn: string): ZahnLeistung {
  const kat = KONS_KATALOG.find((k) => k.id === therapieId)!
  const z: ZahnLeistung = { therapie: therapieId }
  if (kat.felder.flaechen) z.flaechen = kat.kategorie === 'inlay' ? 2 : 2
  if (kat.felder.kanaele) z.kanaele = kanaeleTypisch(zahn)
  if (kat.materialVorgabe && kat.felder.material) z.material = kat.materialVorgabe
  if (kat.kategorie === 'endo') z.elektrometrie = true
  return z
}

export default function Zahnschema({ plan, setPlan }: Props) {
  const setzeKuerzel = (zahn: string, roh: string) => {
    const kuerzel = roh.trim().toUpperCase()
    const naechste = { ...plan.zaehne }
    if (!kuerzel) {
      delete naechste[zahn]
      setPlan({ ...plan, zaehne: naechste })
      return
    }
    const kat = KATALOG_NACH_KUERZEL[kuerzel]
    if (!kat) {
      // Unbekanntes Kürzel: als Rohwert merken, damit das Feld rot wird
      naechste[zahn] = { therapie: `?${kuerzel}` }
      setPlan({ ...plan, zaehne: naechste })
      return
    }
    const vorher = plan.zaehne[zahn]
    naechste[zahn] = vorher && vorher.therapie === kat.id ? vorher : standardLeistung(kat.id, zahn)
    setPlan({ ...plan, zaehne: naechste })
  }

  const reihe = (zaehne: string[], label: string) => (
    <div className="zs-reihe">
      <span className="zs-label">{label}</span>
      {zaehne.map((zahn) => {
        const z = plan.zaehne[zahn]
        const kuerzel = z ? (z.therapie.startsWith('?') ? z.therapie.slice(1) : kuerzelFuer(z.therapie)) : ''
        const unbekannt = !!z && z.therapie.startsWith('?')
        return (
          <label key={zahn} className="zs-zelle">
            <input
              className={`zs-feld ${kuerzel ? 'belegt' : ''} ${unbekannt ? 'unbekannt' : ''}`}
              value={kuerzel}
              maxLength={2}
              onChange={(e) => setzeKuerzel(zahn, e.target.value)}
              title={`Zahn ${zahn}`}
            />
          </label>
        )
      })}
    </div>
  )

  const nummernReihe = (zaehne: string[]) => (
    <div className="zs-reihe">
      <span className="zs-label" />
      {zaehne.map((z) => (
        <span key={z} className="zs-nr">
          {z}
        </span>
      ))}
    </div>
  )

  return (
    <div className="block">
      <h3>Zahnschema – Therapie je Zahn</h3>
      <p className="hilfe">
        Kürzel je Zahn eintragen. Die Details (Flächen, Kanäle, Material, Zusatzleistungen) werden in der Tabelle darunter
        eingestellt.
      </p>
      <div className="zahnschema">
        <div className="zs-kiefer">
          {nummernReihe(OBERKIEFER)}
          {reihe(OBERKIEFER, 'OK')}
          <div className="zs-trenner">
            <span>rechts</span>
            <span>links</span>
          </div>
          {reihe(UNTERKIEFER, 'UK')}
          {nummernReihe(UNTERKIEFER)}
        </div>
      </div>
      <div className="zs-hilfe">
        {KONS_KATALOG.map((k) => (
          <span key={k.id} className="chip" title={k.titel}>
            <b>{k.kuerzel}</b> {k.kurz}
          </span>
        ))}
      </div>
    </div>
  )
}

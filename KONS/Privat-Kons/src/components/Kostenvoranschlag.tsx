import type { Einstellungen, Kalkulation, Plan } from '../types'
import { euro } from '../engine/berechnung'

interface Props {
  plan: Plan
  einst: Einstellungen
  kalk: Kalkulation
}

const datumDe = (iso: string) => {
  if (!iso) return ''
  const [j, m, t] = iso.split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}

export default function Kostenvoranschlag({ plan, einst, kalk }: Props) {
  const p = einst.praxis
  const gueltigBis = (() => {
    const d = new Date(plan.datum || Date.now())
    d.setMonth(d.getMonth() + einst.gueltigMonate)
    return d.toLocaleDateString('de-DE')
  })()

  return (
    <div className="kv-blatt">
      <div className="kv-kopf">
        <div className="kv-praxis">
          <div className="kv-praxisname">{p.name || 'Zahnarztpraxis'}</div>
          {p.zahnarzt && <div>{p.zahnarzt}</div>}
          <div>
            {p.strasse}
            {p.strasse && (p.plz || p.ort) ? ' · ' : ''}
            {p.plz} {p.ort}
          </div>
          {(p.telefon || p.email) && (
            <div>
              {p.telefon}
              {p.telefon && p.email ? ' · ' : ''}
              {p.email}
            </div>
          )}
        </div>
      </div>

      <div className="kv-adresse">
        <div className="kv-absender">
          {p.name} · {p.strasse} · {p.plz} {p.ort}
        </div>
        <div>
          <strong>{plan.patient.name || 'Patientin / Patient'}</strong>
        </div>
        {plan.patient.geburtsdatum && <div>geb. {datumDe(plan.patient.geburtsdatum)}</div>}
        {plan.patient.kasse && <div>{plan.patient.kasse}</div>}
        {plan.patient.versichertennr && <div>Vers.-Nr. {plan.patient.versichertennr}</div>}
      </div>

      <div className="kv-meta">
        <div>
          <span>Plan-Nr.</span>
          {plan.nummer}
        </div>
        <div>
          <span>Datum</span>
          {datumDe(plan.datum)}
        </div>
        <div>
          <span>Gültig bis</span>
          {gueltigBis}
        </div>
      </div>

      <h1>Mehrkostenvereinbarung</h1>
      <p className="kv-untertitel">Konservierende Zahnheilkunde · höherwertige Leistungen gegen Mehrkosten (§ 28 Abs. 2 SGB V)</p>

      <h2>Geplante Leistungen</h2>
      <table className="kv-tabelle kv-zaehne">
        <thead>
          <tr>
            <th>Zahn</th>
            <th>Leistung</th>
            <th className="r">Kasse trägt</th>
            <th className="r">Privatleistung</th>
            <th className="r">Mehrkosten</th>
          </tr>
        </thead>
        <tbody>
          {kalk.gruppen.map((g) => (
            <tr key={g.key}>
              <td>{g.zahn ?? '–'}</td>
              <td>
                {g.titel.replace(/^Zahn \d+ · /, '')}
                {g.modellHinweis ? <div className="kv-fuss">{g.modellHinweis}</div> : null}
              </td>
              <td className="r">{g.art === 'verlangen' ? '—' : euro(g.kassenanteil)}</td>
              <td className="r">{euro(g.gozSumme || g.mehrkosten)}</td>
              <td className="r">{euro(g.mehrkosten)}</td>
            </tr>
          ))}
          {!kalk.gruppen.length && (
            <tr>
              <td colSpan={5} className="leer">
                Keine Leistungen geplant.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="kv-summe">
        <div>
          <span>Privatleistung gesamt (GOZ)</span>
          <span>{euro(kalk.gozGesamt)}</span>
        </div>
        <div>
          <span>davon Kassenanteil (Sachleistung)</span>
          <span>− {euro(kalk.kassenGesamt)}</span>
        </div>
        <div className="gesamt">
          <span>Von Ihnen zu zahlende Mehrkosten</span>
          <span>{euro(kalk.mehrkostenGesamt)}</span>
        </div>
      </div>

      {plan.bemerkung && (
        <>
          <h2>Bemerkung</h2>
          <p className="kv-bemerkung">{plan.bemerkung}</p>
        </>
      )}

      <div className="kv-hinweise">
        <p>
          Die gesetzliche Krankenkasse trägt den Sachleistungsanteil der medizinisch ausreichenden Regelversorgung (BEMA). Für die
          gewählte höherwertige Versorgung entstehen Mehrkosten, die privat nach der Gebührenordnung für Zahnärzte (GOZ) berechnet
          werden und von Ihnen selbst zu tragen sind (§ 28 Abs. 2 SGB V).
        </p>
        <p>
          Verlangensleistungen (z. B. Fissurenversiegelung außerhalb der Kassenrichtlinie, professionelle Zahnreinigung) sind keine
          Leistungen der gesetzlichen Krankenversicherung und werden nach § 1 Abs. 2, § 2 Abs. 3 GOZ vollständig privat berechnet.
        </p>
        <p>
          Dieser Kostenvoranschlag ist unverbindlich; die endgültige Abrechnung richtet sich nach dem tatsächlichen Aufwand. Angaben
          ohne Umsatzsteuer; zahnärztliche Leistungen sind umsatzsteuerfrei (§ 4 Nr. 14 UStG). Gültig bis {gueltigBis}.
        </p>
        {kalk.hinweise.map((h, i) => (
          <p key={i}>{h}</p>
        ))}
      </div>

      <div className="kv-unterschriften">
        <div>
          <span />
          Ort, Datum / Unterschrift Patientin/Patient
        </div>
        <div>
          <span />
          {p.zahnarzt || 'Unterschrift Zahnärztin/Zahnarzt'}
        </div>
      </div>
    </div>
  )
}

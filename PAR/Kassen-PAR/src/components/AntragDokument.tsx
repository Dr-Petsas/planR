import type { Befund, DiagnoseErgebnis, Einstellungen, Plan } from '../types'
import { berechnen, euro, uptPlan } from '../engine/strecke'
import { diagnoseText } from '../engine/diagnose'
import { OBERKIEFER, UNTERKIEFER } from '../engine/zahnschema'

function stText(w: number | null, bop: boolean) {
  if (w == null) return ''
  return `${w}${bop ? '*' : ''}`
}

function BefundTabelle({ titel, befund }: { titel: string; befund: Befund }) {
  const reihe = (zaehne: string[]) => (
    <table className="druck-perio">
      <tbody>
        <tr className="dp-nr">
          <th>Zahn</th>
          {zaehne.map((z) => (
            <td key={z}>{z}</td>
          ))}
        </tr>
        <tr>
          <th>ZS</th>
          {zaehne.map((z) => (
            <td key={z}>{befund.zaehne[z].zs === 1 ? '—' : befund.zaehne[z].zs}</td>
          ))}
        </tr>
        <tr>
          <th>vest.</th>
          {zaehne.map((z) => (
            <td key={z} className="dp-st">
              {[0, 1, 2].map((i) => (
                <span key={i} className={befund.zaehne[z].st[i] != null && befund.zaehne[z].st[i]! >= 4 ? 'tief' : ''}>
                  {stText(befund.zaehne[z].st[i], befund.zaehne[z].bop[i]) || '·'}
                </span>
              ))}
            </td>
          ))}
        </tr>
        <tr>
          <th>oral</th>
          {zaehne.map((z) => (
            <td key={z} className="dp-st">
              {[3, 4, 5].map((i) => (
                <span key={i} className={befund.zaehne[z].st[i] != null && befund.zaehne[z].st[i]! >= 4 ? 'tief' : ''}>
                  {stText(befund.zaehne[z].st[i], befund.zaehne[z].bop[i]) || '·'}
                </span>
              ))}
            </td>
          ))}
        </tr>
        <tr>
          <th>L / F</th>
          {zaehne.map((z) => (
            <td key={z}>
              {befund.zaehne[z].lockerung}/{befund.zaehne[z].fb}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
  return (
    <div className="druck-befund">
      <h4>
        {titel} <span className="df-datum">({befund.datum})</span>
      </h4>
      {reihe(OBERKIEFER)}
      {reihe(UNTERKIEFER)}
    </div>
  )
}

export default function AntragDokument({
  plan,
  einst,
  diag,
}: {
  plan: Plan
  einst: Einstellungen
  diag: DiagnoseErgebnis
}) {
  const { positionen, punkteGesamt, summe } = berechnen(plan, einst, diag)
  const termine = uptPlan(diag.grad)
  const pw = einst.bemaPunktwert
  const p = plan.patient
  const pr = einst.praxis

  return (
    <div className="dokument">
      <div className="dok-werkzeug">
        <button className="primaer" onClick={() => window.print()}>
          Drucken / als PDF speichern
        </button>
      </div>

      <div className="blatt">
        <div className="dok-kopf">
          <div>
            <div className="dok-titel">Parodontitis-Behandlungsplan (PAR-Status)</div>
            <div className="dok-unter">Antrag an die gesetzliche Krankenkasse · BEMA Teil 4 · § 13 PAR-Richtlinie</div>
          </div>
          <div className="dok-nr">
            {plan.nummer}
            <br />
            {plan.datum}
          </div>
        </div>

        <div className="dok-gitter">
          <section>
            <h3>Praxis</h3>
            <div>{pr.name}</div>
            <div>{pr.strasse}</div>
            <div>
              {pr.plz} {pr.ort}
            </div>
            <div>{pr.telefon}</div>
            <div>Behandler: {pr.behandler}</div>
            <div>
              Zahnarzt-Nr. {pr.zahnarztNr} · Abr.-Nr. {pr.abrechnungsNr}
            </div>
          </section>
          <section>
            <h3>Patient</h3>
            <div>{p.name || '—'}</div>
            <div>geb. {p.geburtsdatum || '—'}</div>
            <div>{p.kasse}</div>
            <div>Vers.-Nr. {p.versichertennr}</div>
            <div>Kostenträger {p.kostentraegerkennung}</div>
          </section>
        </div>

        <section>
          <h3>Diagnose</h3>
          <div className="dok-diagnose">{diagnoseText(diag)}</div>
          <div className="dok-diag-detail">
            <span>Stadium {['', 'I', 'II', 'III', 'IV'][diag.stadium]} – {diag.stadiumText}</span>
            <span>Ausmaß: {diag.ausmass} ({diag.anteilProzent} % der Zähne)</span>
            <span>Grad {diag.grad} ({diag.gradBasis})</span>
            {plan.diagnose.knochenabbauZahn ? (
              <span>
                max. Knochenabbau {plan.diagnose.knochenabbauProzent} % an Zahn {plan.diagnose.knochenabbauZahn}
              </span>
            ) : null}
          </div>
          {plan.bemerkung ? <div className="dok-bemerkung">{plan.bemerkung}</div> : null}
        </section>

        <section>
          <h3>Geplante Leistungen (BEMA Teil 4)</h3>
          <table className="dok-tab">
            <thead>
              <tr>
                <th>Abschnitt</th>
                <th>BEMA</th>
                <th>Leistung</th>
                <th className="r">Anz.</th>
                <th className="r">Pkt.</th>
                <th className="r">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {positionen.map((x, i) => (
                <tr key={i}>
                  <td>{x.phase}</td>
                  <td className="mono">{x.nr}</td>
                  <td>
                    {x.titel}
                    {x.detail ? <span className="pos-detail"> ({x.detail})</span> : null}
                  </td>
                  <td className="r">{x.anzahl}</td>
                  <td className="r">{x.punkteGesamt}</td>
                  <td className="r">{euro(x.punkteGesamt * pw)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="r">
                  Summe ({punkteGesamt} Punkte × {euro(pw)})
                </td>
                <td className="r">{punkteGesamt}</td>
                <td className="r">{euro(summe)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section>
          <h3>UPT-Zeitplan (Grad {diag.grad}, 2 Jahre)</h3>
          <table className="dok-tab">
            <thead>
              <tr>
                <th>UPT</th>
                <th className="r">ab Monat</th>
                <th>Leistungen</th>
              </tr>
            </thead>
            <tbody>
              {termine.map((t) => (
                <tr key={t.index}>
                  <td>{t.label}</td>
                  <td className="r">{t.monatAbStart}</td>
                  <td className="mono">{t.leistungen.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="dok-unterschrift">
          <div>
            <div className="us-linie" />
            Datum, Unterschrift Zahnarzt/Zahnärztin
          </div>
          <div>
            <div className="us-linie" />
            Genehmigung der Krankenkasse
          </div>
        </div>
      </div>

      <div className="blatt">
        <div className="dok-kopf">
          <div className="dok-titel">Parodontalstatus – Befund (Blatt 2)</div>
          <div className="dok-nr">
            {p.name || '—'} · {plan.nummer}
          </div>
        </div>
        <p className="dok-legende">
          ST = Sondierungstiefe in mm · <b>*</b> = Sondierungsbluten (BOP) · <span className="tief">fett</span> = ST ≥ 4 mm ·
          ZS 0 vorhanden / 1 fehlt / 2 nicht erhaltungswürdig / 3 Krone / 4 Brückenpfeiler / 5 Ersatz / 6 Implantat ·
          L = Lockerung · F = Furkation
        </p>
        <BefundTabelle titel="Initialbefund" befund={plan.befunde.initial} />
        {plan.befunde.beva ? <BefundTabelle titel="Befundevaluation BEV a" befund={plan.befunde.beva} /> : null}
        {plan.befunde.bevb ? <BefundTabelle titel="Befundevaluation BEV b" befund={plan.befunde.bevb} /> : null}
      </div>
    </div>
  )
}

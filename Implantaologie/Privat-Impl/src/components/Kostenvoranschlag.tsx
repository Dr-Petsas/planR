import type { Einstellungen, Plan } from '../types'
import { euro, type Kalkulation, type Zeile } from '../engine/berechnung'
import { ALLE_ZAEHNE, BEFUND_KUERZEL, PLANUNG_KUERZEL } from '../engine/zahnschema'
import { SITZUNG_NAME } from '../engine/planung'
import { standardProtokoll } from '../data/blutprotokolle'

interface Props {
  plan: Plan
  einst: Einstellungen
  kalk: Kalkulation
}

const datum = (iso: string) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('de-DE') : '')
const faktorText = (f?: number) => (f ?? 0).toFixed(1).replace('.', ',')
function gueltigBis(iso: string, monate: number) {
  const d = new Date(iso + 'T12:00:00')
  d.setMonth(d.getMonth() + monate)
  return d.toLocaleDateString('de-DE')
}

export function Kostenvoranschlag({ plan, einst, kalk }: Props) {
  const { praxis } = einst
  const { patient } = plan
  const versorgt = ALLE_ZAEHNE.filter((z) => plan.zaehne[z]?.TP || plan.zaehne[z]?.B)
  const begruendungen = [...kalk.honorarGoz, ...kalk.honorarGoae].filter((z) => z.begruendung && (z.faktor ?? 0) > 2.3)
  const analoge = [...kalk.honorarGoz, ...kalk.honorarGoae].filter((z) => z.analog)
  const ueber35 = kalk.honorarGoz.some((z) => (z.faktor ?? 0) > 3.5)
  const protokoll = plan.global.blut !== 'keine' ? standardProtokoll(plan.global.blut) : null
  const sitzungen = [...new Set([...kalk.honorarGoz, ...kalk.honorarGoae, ...kalk.material].map((z) => z.sitzung ?? 0))].filter(Boolean).sort((a, b) => a - b)

  const honorarZeile = (z: Zeile, mitFaktor: boolean) => (
    <tr key={z.id}>
      <td className="mono">{z.nr}{z.analog ? ' A' : ''}{z.gebuehrenanteil && z.gebuehrenanteil < 1 ? (z.gebuehrenanteil === 0.5 ? ' ½' : ' ⅓') : ''}</td>
      <td>{z.zahn}</td>
      <td>{z.analog ? z.analogText : z.text}</td>
      <td className="r">{z.anzahl.toLocaleString('de-DE')}</td>
      {mitFaktor && <td className="r">{z.preis !== undefined && !z.analog ? '–' : faktorText(z.faktor)}</td>}
      <td className="r">{euro(z.einzel)}</td>
      <td className="r">{euro(z.betrag)}</td>
    </tr>
  )
  const matZeile = (z: Zeile) => (
    <tr key={z.id}>
      <td>{z.zahn}</td><td>{z.text}</td>
      <td className="r">{z.anzahl.toLocaleString('de-DE')}</td>
      <td className="r">{euro(z.einzel)}</td><td className="r">{euro(z.betrag)}</td>
    </tr>
  )

  return (
    <article className="kv-blatt">
      <header className="kv-kopf">
        <div className="kv-praxis">
          <div className="kv-praxisname">{praxis.name || 'Zahnarztpraxis'}</div>
          {praxis.zahnarzt && <div>{praxis.zahnarzt}</div>}
          <div>{[praxis.strasse, praxis.plzOrt].filter(Boolean).join(' · ')}</div>
          <div>{[praxis.telefon && `Tel. ${praxis.telefon}`, praxis.email].filter(Boolean).join(' · ')}</div>
        </div>
      </header>

      <div className="kv-adresse">
        <div className="kv-absender">{[praxis.name, praxis.strasse, praxis.plzOrt].filter(Boolean).join(' · ')}</div>
        <div>{patient.anrede}</div>
        <div>{[patient.vorname, patient.name].filter(Boolean).join(' ') || '(Patient)'}</div>
        <div>{patient.strasse}</div>
        <div>{patient.plzOrt}</div>
      </div>

      <div className="kv-meta">
        <div><span>Datum</span>{datum(plan.datum)}</div>
        <div><span>Nummer</span>{plan.nummer}</div>
        {patient.geburtsdatum && <div><span>geb. am</span>{datum(patient.geburtsdatum)}</div>}
        <div><span>gültig bis</span>{gueltigBis(plan.datum, einst.gueltigMonate)}</div>
      </div>

      <h1>Kostenvoranschlag Implantologie</h1>
      <p className="kv-untertitel">Privatbehandlung nach GOZ und – soweit zahnärztlich geöffnet – GOÄ (§ 6 Abs. 2 GOZ)</p>

      <p>
        {patient.anrede ? `Guten Tag ${patient.anrede} ${patient.name},` : 'Sehr geehrte Patientin, sehr geehrter Patient,'}
        <br />für den besprochenen implantatchirurgischen Eingriff erhalten Sie nachfolgend die voraussichtlichen Kosten.
      </p>

      {versorgt.length > 0 && (
        <section>
          <h2>Befund und geplante Behandlung</h2>
          <table className="kv-tabelle kv-zaehne">
            <thead><tr><th>Zahn</th><th>Befund</th><th>Geplant</th></tr></thead>
            <tbody>
              {versorgt.map((z) => (
                <tr key={z}>
                  <td className="mono">{z}</td>
                  <td>{plan.zaehne[z]?.B ? BEFUND_KUERZEL[plan.zaehne[z]!.B] ?? plan.zaehne[z]!.B : '–'}</td>
                  <td>{plan.zaehne[z]?.TP ? PLANUNG_KUERZEL[plan.zaehne[z]!.TP] ?? plan.zaehne[z]!.TP : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sitzungen.length > 0 && <p className="kv-ablauf"><b>Behandlungsablauf:</b> {sitzungen.map((s) => SITZUNG_NAME[s] ?? `Sitzung ${s}`).join(' → ')}</p>}
        </section>
      )}

      <section>
        <h2>1. Zahnärztliches Honorar (GOZ)</h2>
        <table className="kv-tabelle">
          <thead><tr><th>GOZ</th><th>Region</th><th>Leistung</th><th className="r">Anz.</th><th className="r">Faktor</th><th className="r">Einzel</th><th className="r">Betrag</th></tr></thead>
          <tbody>{kalk.honorarGoz.map((z) => honorarZeile(z, true))}</tbody>
          <tfoot><tr><td colSpan={6}>Summe GOZ</td><td className="r">{euro(kalk.summeGoz)}</td></tr></tfoot>
        </table>
        <p className="kv-fuss">„A" = Analogberechnung nach § 6 Abs. 1 GOZ (entsprechend der angegebenen Ziffer, § 10 Abs. 4 GOZ). „½/⅓" = reduzierter Gebührenanteil nach GOZ-Bestimmung.</p>
      </section>

      {kalk.honorarGoae.length > 0 && (
        <section>
          <h2>2. Ärztliche Leistungen (GOÄ)</h2>
          <table className="kv-tabelle">
            <thead><tr><th>GOÄ</th><th>Region</th><th>Leistung</th><th className="r">Anz.</th><th className="r">Faktor</th><th className="r">Einzel</th><th className="r">Betrag</th></tr></thead>
            <tbody>{kalk.honorarGoae.map((z) => honorarZeile(z, true))}</tbody>
            <tfoot><tr><td colSpan={6}>Summe GOÄ</td><td className="r">{euro(kalk.summeGoae)}</td></tr></tfoot>
          </table>
        </section>
      )}

      {protokoll && (
        <section className="kv-eigenblut">
          <h2>3. Eigenblut-Aufbereitung im Praxislabor</h2>
          <p><b>{protokoll.titel}</b> – {protokoll.produkt}. Röhrchen: {protokoll.roehrchen}; Zusätze: {protokoll.zusatz}.</p>
          <ol>{protokoll.schritte.map((s) => <li key={s}>{s}</li>)}</ol>
          <p className="kv-fuss">Das Zentrifugieren ist Teil der Herstellung und wird nicht gesondert berechnet. Berechnet werden die Blutentnahme (GOÄ 250) sowie – soweit angesetzt – die Analogleistung. {protokoll.anzeigepflichtig && 'Die Herstellung des Blutprodukts ist nach § 67 AMG angezeigt; über die Anwendung wird gesondert aufgeklärt.'}</p>
        </section>
      )}

      {kalk.material.length > 0 && (
        <section>
          <h2>{protokoll ? 4 : 3}. Implantate und Material (Einkaufspreis, § 10 Abs. 2 Nr. 6 GOZ)</h2>
          <table className="kv-tabelle">
            <thead><tr><th>Region</th><th>Material</th><th className="r">Anz.</th><th className="r">Einzel</th><th className="r">Betrag</th></tr></thead>
            <tbody>{kalk.material.map(matZeile)}</tbody>
            <tfoot><tr><td colSpan={4}>Summe Material netto</td><td className="r">{euro(kalk.summeMaterialNetto)}</td></tr></tfoot>
          </table>
        </section>
      )}

      {kalk.labor.length > 0 && (
        <section>
          <h2>{(protokoll ? 4 : 3) + (kalk.material.length ? 1 : 0)}. Zahntechnik (BEB)</h2>
          <table className="kv-tabelle">
            <thead><tr><th>Region</th><th>Leistung</th><th className="r">Anz.</th><th className="r">Einzel</th><th className="r">Betrag</th></tr></thead>
            <tbody>{kalk.labor.map(matZeile)}</tbody>
            <tfoot><tr><td colSpan={4}>Summe Labor netto</td><td className="r">{euro(kalk.summeLaborNetto)}</td></tr></tfoot>
          </table>
        </section>
      )}

      <section className="kv-summe">
        <div><span>Honorar GOZ</span><span>{euro(kalk.summeGoz)}</span></div>
        {kalk.summeGoae > 0 && <div><span>Honorar GOÄ</span><span>{euro(kalk.summeGoae)}</span></div>}
        <div><span>Material + Labor netto</span><span>{euro(kalk.summeMaterialNetto + kalk.summeLaborNetto)}</span></div>
        <div><span>zzgl. {einst.mwst} % MwSt. auf Material/Labor</span><span>{euro(kalk.mwst)}</span></div>
        <div className="gesamt"><span>Voraussichtliche Gesamtkosten</span><span>{euro(kalk.gesamt)}</span></div>
      </section>

      {plan.zeVerweis && (
        <section className="kv-verweis">
          <h2>Prothetische Fortsetzung (Suprakonstruktion)</h2>
          <p>Die Suprakonstruktion wird gesondert geplant: Kostenvoranschlag {plan.zeVerweis.nummer} vom {datum(plan.zeVerweis.datum)}, voraussichtlich {euro(plan.zeVerweis.betrag)}. {plan.zeVerweis.zusammenfassung}</p>
        </section>
      )}

      {begruendungen.length > 0 && (
        <section className="kv-begruendung">
          <h2>Begründungen für Faktoren über der Schwelle (§ 10 Abs. 3 GOZ / § 5 Abs. 2 GOÄ)</h2>
          {begruendungen.map((z) => <p key={z.id}><b>{z.ebene === 'GOAE' ? 'GOÄ' : 'GOZ'} {z.nr}{z.zahn && ` (${z.zahn})`}, Faktor {faktorText(z.faktor)}:</b> {z.begruendung}</p>)}
        </section>
      )}

      {analoge.length > 0 && (
        <section className="kv-risiko">
          <h2>Analogleistungen und Erstattungshinweise (§ 6 Abs. 1 GOZ)</h2>
          {analoge.map((z) => <p key={z.id}><b>{z.text} (entsprechend {z.basisEbene === 'GOAE' ? 'GOÄ' : 'GOZ'} {z.nr}, Erstattungsrisiko {z.risiko}):</b> {z.begruendung}</p>)}
        </section>
      )}

      {plan.bemerkung && <section><h2>Bemerkungen</h2><p className="kv-bemerkung">{plan.bemerkung}</p></section>}

      <section className="kv-hinweise">
        <p>Dieser Kostenvoranschlag beruht auf dem heutigen Befund. Ergibt sich während der Operation ein anderer Aufwand (z. B. größerer Knochendefekt), können die Kosten abweichen; übersteigen sie die Schätzung erheblich, werden Sie vorher informiert.</p>
        <p>Material und Implantatteile werden zum tatsächlichen Einkaufspreis nach Art, Menge und Preis berechnet (§ 10 Abs. 2 Nr. 6 GOZ). Analog berechnete Leistungen (§ 6 Abs. 1 GOZ) sind nach Art, Zeitaufwand und Schwierigkeit gleichwertig bewertet; eine Erstattung durch private Krankenversicherung oder Beihilfe kann nicht zugesichert werden.</p>
        {plan.global.sedierung === 'itn' && <p>Eine Intubationsnarkose ist eine Fremdleistung des Anästhesisten (§ 4 Abs. 5 GOZ) und wird von diesem gesondert abgerechnet.</p>}
        <p>Der Kostenvoranschlag ist gültig bis {gueltigBis(plan.datum, einst.gueltigMonate)}.</p>
      </section>

      {ueber35 && (
        <section className="kv-vereinbarung">
          <h2>Vereinbarung einer abweichenden Gebührenhöhe (§ 2 Abs. 1, 2 GOZ)</h2>
          <p>Für die mit einem Steigerungsfaktor über 3,5 bewerteten Leistungen wird vor Behandlungsbeginn eine schriftliche Vereinbarung nach § 2 Abs. 1 und 2 GOZ getroffen. Die Vereinbarung enthält Nummer, Leistung, Steigerungssatz und den sich daraus ergebenden Betrag; eine Erstattung durch Dritte ist dadurch nicht gewährleistet.</p>
          <div className="kv-vereinbarung-tabelle">
            <table className="kv-tabelle">
              <thead><tr><th>GOZ</th><th>Region</th><th>Leistung</th><th className="r">Faktor</th><th className="r">Betrag</th></tr></thead>
              <tbody>{kalk.honorarGoz.filter((z) => (z.faktor ?? 0) > 3.5).map((z) => (
                <tr key={z.id}><td className="mono">{z.nr}</td><td>{z.zahn}</td><td>{z.text}</td><td className="r">{faktorText(z.faktor)}</td><td className="r">{euro(z.betrag)}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <footer className="kv-unterschriften">
            <div><span />Ort, Datum, Unterschrift Zahnärztin / Zahnarzt</div>
            <div><span />Ort, Datum, Unterschrift Patient/in</div>
          </footer>
        </section>
      )}

      <footer className="kv-unterschriften">
        <div><span />Ort, Datum, Unterschrift Zahnärztin / Zahnarzt</div>
        <div><span />Ich bin mit der geplanten Behandlung einverstanden.<br />Ort, Datum, Unterschrift Patient/in</div>
      </footer>
    </article>
  )
}

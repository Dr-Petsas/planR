import type { Einstellungen, Plan, Rechnung, Zeile } from '../types'
import { euro, faktorText } from '../engine/kfo'
import { KRITERIEN_REGELBISS, KRITERIEN_UMFORMUNG } from '../data/katalog'
import { anschrift, patientName, plzOrt } from '../stammdaten'

interface Props {
  plan: Plan
  einst: Einstellungen
  rechnung: Rechnung
}

const datum = (iso: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '—')

function gueltigBis(iso: string, monate: number) {
  const d = iso ? new Date(iso) : new Date()
  d.setMonth(d.getMonth() + monate)
  return d.toLocaleDateString('de-DE')
}

function Kopf({ plan, einst }: Omit<Props, 'rechnung'>) {
  const p = einst.praxis
  const pat = plan.patient
  return (
    <>
      <div className="kv-kopf">
        <div className="kv-praxis">
          <div className="kv-praxisname">{p.name}</div>
          {p.zahnarzt && <div>{p.zahnarzt}</div>}
          <div>{[p.strasse, plzOrt(p)].filter(Boolean).join(' · ')}</div>
          <div>{[p.telefon, p.email].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="kv-meta">
        <div><span>Patient/in</span>{patientName(pat) || '—'}</div>
        <div><span>geboren</span>{datum(pat.geburtsdatum)}</div>
        {anschrift(pat) && <div><span>Anschrift</span>{anschrift(pat)}</div>}
        {pat.kasse && <div><span>Versicherung</span>{pat.kasse}</div>}
        <div><span>Nr.</span>{plan.nummer}</div>
        <div><span>Datum</span>{datum(plan.datum)}</div>
      </div>
    </>
  )
}

const Unterschriften = () => (
  <div className="kv-unterschriften">
    <div><span />Ort, Datum, Unterschrift Patient/in bzw. Zahlungspflichtige/r</div>
    <div><span />Unterschrift Zahnärztin / Zahnarzt</div>
  </div>
)

const nrText = (z: Zeile) => (z.ebene === 'GOAE' ? `Ä${z.nr}` : z.nr)

function Tabelle({ zeilen, mitFaktor }: { zeilen: Zeile[]; mitFaktor: boolean }) {
  return (
    <table className="kv-tabelle kv-leistung">
      <thead>
        <tr>
          <th>Nr.</th><th>Leistung</th><th className="r">Anz.</th>
          {mitFaktor && <th className="r">Faktor</th>}<th className="r">Einzel</th><th className="r">Betrag</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.id}>
            <td className="mono">{nrText(z)}</td>
            <td>{z.text}{z.analog && <span className="analog-text">{z.analog}</span>}</td>
            <td className="r">{z.anzahl}</td>
            {mitFaktor && <td className="r">{z.faktor ? faktorText(z.faktor) : ''}</td>}
            <td className="r">{euro(z.einzel)}</td>
            <td className="r">{euro(z.summe)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Kriterien({ plan }: { plan: Plan }) {
  const a = plan.aufgabe
  const liste = (titel: string, k: string[], texte: Record<string, string>) =>
    k.length ? <li><b>{titel}:</b> {[...k].sort().map((x) => `${x}) ${texte[x]}`).join('; ')}</li> : <li><b>{titel}:</b> kein Kriterium – geringer Umfang</li>
  if (!a.umformungOk && !a.umformungUk && !a.regelbiss) return null
  return (
    <ul className="kv-kriterien">
      {a.umformungOk && liste('Umformung Oberkiefer', a.kriterienOk, KRITERIEN_UMFORMUNG)}
      {a.umformungUk && liste('Umformung Unterkiefer', a.kriterienUk, KRITERIEN_UMFORMUNG)}
      {a.regelbiss && liste('Einstellung in den Regelbiss', a.kriterienRegelbiss, KRITERIEN_REGELBISS)}
    </ul>
  )
}

export default function Dokument({ plan, einst, rechnung }: Props) {
  const leer = !rechnung.aufgabe.length && !rechnung.honorar.length && !rechnung.labor.length && !rechnung.mehr.length
  const einzel = rechnung.summeHonorar - rechnung.summeAufgabe
  return (
    <>
      <div className="kv-blatt">
        <Kopf plan={plan} einst={einst} />
        <h1>Heil- und Kostenplan Kieferorthopädie</h1>
        <p className="kv-untertitel">nach der Gebührenordnung für Zahnärzte (GOZ 0040) · voraussichtliche Behandlungsdauer {plan.quartale} Quartale</p>
        {plan.diagnose && <p><b>Befund / Diagnose:</b> {plan.diagnose}</p>}
        {plan.therapie && <p><b>Behandlungsziel und -mittel:</b> {plan.therapie}</p>}

        {leer ? (
          <p className="leer">Noch keine Leistung geplant.</p>
        ) : (
          <>
            {rechnung.aufgabe.length > 0 && (
              <>
                <h2>Kieferorthopädische Behandlung (Behandlungsaufgabe)</h2>
                <Kriterien plan={plan} />
                <Tabelle zeilen={rechnung.aufgabe} mitFaktor />
              </>
            )}
            {rechnung.honorar.length > 0 && (<><h2 style={{ marginTop: 12 }}>Diagnostik und Einzelleistungen</h2><Tabelle zeilen={rechnung.honorar} mitFaktor /></>)}
            {rechnung.labor.length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>Material- und Laborkosten{einst.laborName ? ` (${einst.laborName})` : ''}</h2>
                <Tabelle zeilen={rechnung.labor} mitFaktor={false} />
              </>
            )}
            <div className="kv-summe">
              {rechnung.aufgabe.length > 0 && <div><span>Behandlungsaufgabe</span><b>{euro(rechnung.summeAufgabe)}</b></div>}
              {einzel > 0 && <div><span>Diagnostik und Einzelleistungen</span><b>{euro(einzel)}</b></div>}
              <div><span>Material- und Laborkosten (§ 9 GOZ)</span><b>{euro(rechnung.summeLabor)}</b></div>
              {rechnung.summeMehr > 0 && <div><span>Materialmehrkosten laut Vereinbarung</span><b>{euro(rechnung.summeMehr)}</b></div>}
              <div className="gesamt"><span>voraussichtliche Gesamtkosten</span><b>{euro(rechnung.gesamt)}</b></div>
            </div>
            {rechnung.aufgabe.length > 0 && (
              <p className="kv-abschlag">
                Die Behandlungsaufgabe ({euro(rechnung.summeAufgabe)}) wird in Abschlägen über {plan.quartale} Quartale berechnet,
                je Quartal {euro(rechnung.abschlag)}. Einzelleistungen, Material und Labor werden berechnet, wenn sie anfallen.
              </p>
            )}
          </>
        )}

        {plan.bemerkung && <p className="kv-bemerkung">{plan.bemerkung}</p>}

        <div className="kv-hinweise">
          <p>
            Die Beträge sind voraussichtlich. Die Leistungen der Behandlungsaufgabe umfassen alle im Behandlungsplan festgelegten
            Maßnahmen innerhalb eines Zeitraums von bis zu vier Jahren; der endgültige Steigerungsfaktor wird mit der Schlussrechnung
            festgelegt. Material- und Laborkosten werden nach tatsächlichem Anfall berechnet.
          </p>
          {rechnung.begruendung.length > 0 && <p>Für Faktoren über dem Schwellenwert erhalten Sie die Begründung mit der Rechnung.</p>}
          {rechnung.vereinbarung2.length > 0 && <p>Für Faktoren über 3,5 gilt die gesonderte Vereinbarung nach § 2 GOZ.</p>}
          {rechnung.mehr.length > 0 && <p>Die Mehrkosten für Material über dem Standard gelten nur mit der gesonderten Vereinbarung über Materialmehrkosten.</p>}
          <p>Ob und in welchem Umfang eine private Versicherung oder Beihilfe erstattet, richtet sich nach Ihrem Vertrag bzw. den Beihilfevorschriften.</p>
          <p>Dieser Heil- und Kostenplan gilt bis {gueltigBis(plan.datum, einst.gueltigMonate)}.</p>
        </div>
        <Unterschriften />
      </div>

      {rechnung.mehr.length > 0 && (
        <div className="kv-blatt kv-blatt-folge">
          <Kopf plan={plan} einst={einst} />
          <h1>Vereinbarung über Materialmehrkosten</h1>
          <p className="kv-untertitel">GOZ Abschnitt G, Allgemeine Bestimmungen – vor der Verwendung nach persönlicher Absprache</p>
          <p>
            Die Leistungen nach den Nummern 6100, 6120, 6140 und 6150 enthalten die Kosten für Standardmaterial. Für das folgende,
            darüber hinausgehende Material werden die Mehrkosten gesondert berechnet:
          </p>
          <table className="kv-tabelle kv-leistung">
            <thead>
              <tr><th>Material</th><th>&nbsp;</th><th className="r">Anz.</th><th className="r">Preis je</th><th className="r">Standard je</th><th className="r">Mehrkosten</th></tr>
            </thead>
            <tbody>
              {rechnung.mehr.map((z) => (
                <tr key={z.id}>
                  <td>{z.text}</td><td />
                  <td className="r">{z.anzahl}</td>
                  <td className="r">{euro(z.preisMehr ?? 0)}</td>
                  <td className="r">{euro(z.preisStandard ?? 0)}</td>
                  <td className="r">{euro(z.summe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="kv-summe">
            <div className="gesamt"><span>voraussichtliche Materialmehrkosten</span><b>{euro(rechnung.summeMehr)}</b></div>
          </div>
          <p className="kv-erstattung">
            Eine Erstattung durch Erstattungsstellen ist möglicherweise nicht im vollen Umfang gewährleistet.
          </p>
          <Unterschriften />
        </div>
      )}

      {rechnung.vereinbarung2.length > 0 && (
        <div className="kv-blatt kv-blatt-folge">
          <Kopf plan={plan} einst={einst} />
          <h1>Vereinbarung nach § 2 Abs. 1 und 2 GOZ</h1>
          <p className="kv-untertitel">abweichende Höhe der Vergütung</p>
          <Tabelle zeilen={rechnung.vereinbarung2} mitFaktor />
          <p className="kv-erstattung">
            Eine Erstattung der Vergütung durch Erstattungsstellen ist möglicherweise nicht in vollem Umfang gewährleistet.
          </p>
          <Unterschriften />
        </div>
      )}
    </>
  )
}

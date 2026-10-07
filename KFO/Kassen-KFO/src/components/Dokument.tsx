import type { Einstellungen, Plan, Rechnung, Stufen, Zeile } from '../types'
import { BEHANDLUNGSART_NAME, PLANART_NAME, RASTER_119, RASTER_120, kigText } from '../data/katalog'
import { euro, faktorText, pwText, rasterPunkte } from '../engine/kfo'
import { FORMULAR_NAME } from '../engine/listen'
import { anschrift, patientName, plzOrt } from '../stammdaten'

interface Props {
  plan: Plan
  einst: Einstellungen
  rechnung: Rechnung
}

const datum = (iso: string) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '—')
const KASSENART = { primaer: 'Primärkasse', ersatz: 'Ersatzkasse' } as const

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
          <div>{[p.zahnarztNr && `ZA-Nr. ${p.zahnarztNr}`, p.abrechnungsNr && `Abr.-Nr. ${p.abrechnungsNr}`].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="kv-meta">
        <div><span>Versicherte/r</span>{patientName(pat) || '—'}</div>
        <div><span>geboren</span>{datum(pat.geburtsdatum)}</div>
        {anschrift(pat) && <div><span>Anschrift</span>{anschrift(pat)}</div>}
        <div><span>Krankenkasse</span>{[pat.kasse, KASSENART[pat.kassenart]].filter(Boolean).join(' · ') || '—'}</div>
        {pat.versichertenNr && <div><span>Vers.-Nr.</span>{pat.versichertenNr}</div>}
        <div><span>Nr.</span>{plan.nummer}{plan.angaben.antragsnummer ? ` · Antrag ${plan.angaben.antragsnummer}` : ''}</div>
        <div><span>Datum</span>{datum(plan.datum)}</div>
      </div>
    </>
  )
}

function Tabelle({ zeilen, mitPunkten }: { zeilen: Zeile[]; mitPunkten: boolean }) {
  return (
    <table className="kv-tabelle kv-leistung">
      <thead>
        <tr>
          <th>Nr.</th><th>Leistung</th><th className="r">Anz.</th>
          {mitPunkten && <th className="r">Punkte</th>}<th className="r">Einzel</th><th className="r">Betrag</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map((z) => (
          <tr key={z.id}>
            <td className="mono">{z.nr}</td>
            <td>{z.text}{z.ohneEigenanteil && <span className="analog-text">ohne Eigenanteil</span>}</td>
            <td className="r">{z.anzahl}</td>
            {mitPunkten && <td className="r">{z.punkte ?? ''}</td>}
            <td className="r">{euro(z.einzel)}</td>
            <td className="r">{euro(z.summe)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RasterTabelle({ plan, rechnung }: Omit<Props, 'einst'>) {
  const e = plan.einstufung
  if (!rechnung.einstufung.length) return null
  const zeile = (titel: string, raster: typeof RASTER_119 | typeof RASTER_120, s: Stufen, nr: string) => {
    const { punkte } = rasterPunkte(raster, s)
    return (
      <tr key={titel}>
        <td>{titel}</td>
        {[0, 1, 2, 3, 4].map((i) => {
          const st = s[i]
          const spalte = i < raster.length && st != null ? raster[i].stufen[st] : null
          return <td key={i}>{spalte ? spalte[1] : i < raster.length ? '·' : ''}</td>
        })}
        <td><b>{punkte}</b></td>
        <td><b>{nr || '—'}</b></td>
      </tr>
    )
  }
  const nr = (b: string) => rechnung.einstufung.find((x) => x.bereich === b)?.nr ?? ''
  return (
    <table className="kv-raster">
      <thead><tr><th>Einstufung</th><th>I</th><th>II</th><th>III</th><th>IV</th><th>V</th><th>Summe</th><th>Schlüssel</th></tr></thead>
      <tbody>
        {e.okAktiv && zeile('OK 119', RASTER_119, e.ok, nr('ok'))}
        {e.ukAktiv && zeile('UK 119', RASTER_119, e.uk, nr('uk'))}
        {e.bissAktiv && zeile('120', RASTER_120, e.biss, nr('biss'))}
      </tbody>
    </table>
  )
}

const Unterschriften = ({ links }: { links: string }) => (
  <div className="kv-unterschriften">
    <div><span />{links}</div>
    <div><span />Unterschrift Zahnärztin / Zahnarzt</div>
  </div>
)

export default function Dokument({ plan, einst, rechnung }: Props) {
  const a = plan.angaben
  const leer = !rechnung.honorar.length && !rechnung.labor.length && !rechnung.material.length
  const kig = kigText(a.kigGruppe, a.kigGrad)
  const dt = (titel: string, wert: string) => (wert ? <p><b>{titel}:</b> {wert}</p> : null)

  return (
    <>
      <div className="kv-blatt">
        <Kopf plan={plan} einst={einst} />
        <h1>Kieferorthopädischer {PLANART_NAME[a.planArt]}</h1>
        <p className="kv-untertitel">{FORMULAR_NAME} · Abrechnung über die KZV (BEMA Teil 3)</p>

        <div className="kv-felder">
          <div><b className="kv-kreuz">{kig ? '×' : ''}</b>KIG {kig || '—'}{a.e34Uk ? ' · E3/E4 UK' : ''}</div>
          <div><b className="kv-kreuz">×</b>{BEHANDLUNGSART_NAME[a.behandlungsArt]}</div>
          <div><b className="kv-kreuz">{a.unfall ? '×' : ''}</b>Unfall / Unfallfolgen</div>
          {a.planArt !== 'plan' && <div><span>ursprünglicher Antrag</span> {a.bezugsantrag || '—'}</div>}
        </div>
        {dt('Anamnese', a.anamnese)}
        {(a.diagnoseOk || a.diagnoseUk || a.diagnoseBiss || a.therapieOk || a.therapieUk || a.therapieBiss) && (
          <table className="kv-tabelle">
            <thead><tr><th /><th>Diagnose</th><th>Therapie</th></tr></thead>
            <tbody>
              <tr><td>Oberkiefer</td><td>{a.diagnoseOk}</td><td>{a.therapieOk}</td></tr>
              <tr><td>Unterkiefer</td><td>{a.diagnoseUk}</td><td>{a.therapieUk}</td></tr>
              <tr><td>Bisslage</td><td>{a.diagnoseBiss}</td><td>{a.therapieBiss}</td></tr>
            </tbody>
          </table>
        )}
        {dt('Verwendete Geräte', a.geraete)}
        <RasterTabelle plan={plan} rechnung={rechnung} />

        {leer ? (
          <p className="leer">Noch keine Leistung geplant.</p>
        ) : (
          <>
            {rechnung.honorar.length > 0 && (<><h2 style={{ marginTop: 12 }}>Zahnärztliche Leistungen</h2><Tabelle zeilen={rechnung.honorar} mitPunkten /></>)}
            {rechnung.labor.length > 0 && (
              <><h2 style={{ marginTop: 12 }}>Labor nach {rechnung.belListe} ({plan.labor === 'praxis' ? 'Praxislabor' : 'gewerbliches Labor'})</h2><Tabelle zeilen={rechnung.labor} mitPunkten={false} /></>
            )}
            {rechnung.material.length > 0 && (<><h2 style={{ marginTop: 12 }}>Praxismaterial</h2><Tabelle zeilen={rechnung.material} mitPunkten={false} /></>)}
            <div className="kv-summe">
              <div><span>Zahnärztliches Honorar (Punktwert KFO {pwText(rechnung.punktwertKfo)} €)</span><b>{euro(rechnung.summeHonorar)}</b></div>
              <div><span>geschätzte Material- und Laborkosten</span><b>{euro(rechnung.summeLabor + rechnung.summeMaterial)}</b></div>
              <div className="gesamt"><span>voraussichtliche Gesamtkosten · {a.quartale} Quartale</span><b>{euro(rechnung.gesamt)}</b></div>
            </div>
            {rechnung.kassenleistung && (
              <p className="kv-abschlag">
                Eigenanteil {rechnung.eigenanteilSatz} %: voraussichtlich {euro(rechnung.eigenanteil)} (von {euro(rechnung.eigenanteilBasis)};
                Röntgen und konservierend-chirurgische Leistungen ohne Eigenanteil). Er wird quartalsweise mit der Leistung berechnet,
                rechnerisch etwa {euro(rechnung.eigenanteil / Math.max(1, a.quartale))} je Quartal. Die Krankenkasse erstattet ihn, wenn die
                Behandlung in dem im Plan bestimmten medizinisch erforderlichen Umfang abgeschlossen ist. Den Rest von {euro(rechnung.kassenanteil)} trägt
                die Krankenkasse.
              </p>
            )}
          </>
        )}

        {plan.bemerkung && <p className="kv-bemerkung">{plan.bemerkung}</p>}
        <div className="kv-hinweise">
          <p>Der Plan wird vor Behandlungsbeginn elektronisch an die Krankenkasse übermittelt; behandelt wird nach der Kostenübernahme. Die Beträge sind voraussichtlich.</p>
          {!rechnung.kassenleistung && <p>Nach der KIG-Einstufung liegt keine Kassenleistung vor (Grade 3 bis 5 erforderlich).</p>}
        </div>
      </div>

      {rechnung.privat.length > 0 && (
        <div className="kv-blatt kv-blatt-folge">
          <Kopf plan={plan} einst={einst} />
          <h1>Vereinbarung und Erklärung zu Mehr- und Zusatzleistungen</h1>
          <p className="kv-untertitel">bei der kieferorthopädischen Behandlung gemäß § 29 Abs. 7 SGB V (Vordruck 4d, Anlage 14a BMV-Z)</p>
          <table className="kv-tabelle kv-leistung">
            <thead>
              <tr><th>Art</th><th>Nr.</th><th>Leistung nach GOZ</th><th className="r">Faktor</th><th className="r">Anz.</th><th className="r">Betrag</th><th>BEMA</th><th className="r">Anz.</th><th className="r">Betrag</th><th className="r">Anteil</th></tr>
            </thead>
            <tbody>
              {rechnung.privat.map((z) => (
                <tr key={z.id}>
                  <td>{z.art}</td>
                  <td className="mono">{z.nr}</td>
                  <td>{z.text}</td>
                  <td className="r">{z.faktor ? faktorText(z.faktor) : ''}</td>
                  <td className="r">{z.anzahl}</td>
                  <td className="r">{euro(z.betrag)}</td>
                  <td className="mono">{z.vergleich ?? ''}</td>
                  <td className="r">{z.vergleich ? z.vergleichAnzahl : ''}</td>
                  <td className="r">{z.vergleich ? euro(z.bema) : ''}</td>
                  <td className="r">{euro(z.anteil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="kv-summe">
            <div><span>Privatzahnärztliche Leistungen nach GOZ</span><b>{euro(rechnung.summePrivat)}</b></div>
            <div><span>abzüglich von der Krankenkasse zu tragender Kostenanteil nach BEMA</span><b>− {euro(rechnung.summePrivatBema)}</b></div>
            <div><span>Zwischensumme (Ihr Anteil an den Leistungen)</span><b>{euro(rechnung.summePrivatAnteil)}</b></div>
            <div><span>voraussichtliche private Material- und Laborkosten</span><b>{euro(rechnung.summePrivatMaterial)}</b></div>
            <div className="gesamt"><span>Ihr voraussichtlicher Kostenanteil</span><b>{euro(rechnung.privatGesamt)}</b></div>
          </div>
          <p className="kv-erstattung">
            M = Mehrleistung: einen Teil der Kosten trägt die Krankenkasse, den anderen die/der Versicherte. Z = Zusatzleistung und
            A = andere Leistung: die Kosten trägt vollständig die/der Versicherte. Vergütungen und Preise können sich im Lauf der
            Behandlung ändern; die Beträge sind voraussichtlich.
          </p>
          <p className="kv-erstattung">
            Meine Zahnärztin/mein Zahnarzt hat mir verschiedene kieferorthopädische Behandlungsmethoden erklärt und mich informiert,
            dass ich Anspruch auf eine kieferorthopädische Behandlung habe, bei der meine Krankenkasse alle Kosten trägt (Leistungen
            nach BEMA) und bei der ich nichts zusätzlich zahlen muss. Im Wissen um diesen Anspruch wünsche ich die oben genannten
            privaten Leistungen und verpflichte mich, die anfallenden Mehrkosten selbst zu tragen.
          </p>
          <Unterschriften links="Ort, Datum, Unterschrift Zahlungspflichtige/r" />
        </div>
      )}
    </>
  )
}

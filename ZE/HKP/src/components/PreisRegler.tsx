import { useMemo, useRef } from 'react'
import type { Einstellungen, HkpPlan } from '../types'
import { BEB_AUFSCHLAG_MAX, GOZ_HOECHSTSATZ, GOZ_SCHWELLENWERT, berechnen, type Ergebnis, type Listen } from '../engine/berechnung'
import { XML_VERSION, auftragsnummerErzeugen, laborXmlErstellen, laborXmlLesen, laborXmlUebernehmen } from '../engine/laborxml'
import { ZUSATZ_STUFEN } from '../engine/zusatzleistungen'
import { PRIVAT_STUFEN, PRIVAT_STUFE_MAX, privatKandidaten, privatProthesen, privatStufeAnwenden } from '../engine/aufwertung'
import { herunterladen } from '../store/import'
import { euro, zahlDe } from '../format'

interface Props {
  plan: HkpPlan
  setPlan: (f: (p: HkpPlan) => HkpPlan) => void
  ergebnis: Ergebnis
  listen: Listen
  setEinstellung: <K extends keyof Einstellungen>(k: K, v: Einstellungen[K]) => void
  onMeldungen: (m: string[]) => void
  onBerechnen?: () => void
  /** Handy: nur Regler und Summen (kein Berechnen, kein Labor-XML) */
  mobil?: boolean
}

const delta = (n: number) => (n > 0.004 ? `+${euro(n)}` : n < -0.004 ? `−${euro(-n)}` : '±0,00 €')

export function PreisRegler({ plan, setPlan, ergebnis, listen, setEinstellung, onMeldungen, onBerechnen, mobil = false }: Props) {
  const e = plan.einstellungen
  const hatBefund = Object.values(plan.zaehne).some((z) => z.B.trim()) || plan.reparaturen.length > 0
  const xmlRef = useRef<HTMLInputElement>(null)
  const pStufe = Math.min(Math.max(0, e.eigenPrivatStufe ?? 0), PRIVAT_STUFE_MAX)
  const kandidaten = useMemo(() => privatKandidaten(plan), [plan])
  const prothesen = useMemo(() => privatProthesen(plan), [plan])
  const aufwertbar = [
    ...(kandidaten.length ? [`Zahn ${kandidaten.join(', ')}`] : []),
    ...(['OK', 'UK'] as const).filter((k) => prothesen[k].length).map((k) => `Prothese ${k}`),
  ]
  const basis = useMemo(() => {
    const ohne: HkpPlan = { ...plan, einstellungen: { ...e, honorarFaktor: 0, gozZusatzStufe: 0, eigenKasseProzent: 100, eigenPrivatAufschlag: 0 } }
    return berechnen(pStufe > 0 ? privatStufeAnwenden(ohne, 0).plan : ohne, listen).summen
  }, [plan, e, listen, pStufe])
  const s = ergebnis.summen
  const anzahl = (f: (p: Ergebnis['positionen'][number]) => boolean) => ergebnis.positionen.filter(f).length
  const nGoz = anzahl((p) => p.ebene === 'GOZ')
  const nEigenBel = anzahl((p) => p.ebene === 'BEL' && p.labor === 'eigen')
  const nEigenBeb = anzahl((p) => p.ebene === 'BEB' && p.labor === 'eigen')
  const nFremd = anzahl((p) => p.labor === 'fremd')
  const nEigen = nEigenBel + nEigenBeb
  const nFremdLab = anzahl((p) => (p.ebene === 'BEL' || p.ebene === 'BEB') && p.labor === 'fremd')

  const stufe = Math.min(Math.max(0, e.gozZusatzStufe ?? 0), ZUSATZ_STUFEN.length - 1)
  const min = Math.min(e.gozFaktor, GOZ_SCHWELLENWERT)
  const faktor = e.honorarFaktor > min ? e.honorarFaktor : min
  const faktorTitel = nGoz === 0 ? 'Faktor wirkt nur auf GOZ-Positionen – BEMA hat feste Punktwerte.'
    : faktor > GOZ_SCHWELLENWERT ? 'Über 2,3: Begründung je Position (§ 10 GOZ); max. 3,5 ohne Vereinbarung (§ 2 GOZ).'
      : 'Bis 2,3 ohne Begründung.'
  const privatTitel = pStufe > 0 || aufwertbar.length ? undefined
    : !nEigen && nFremdLab ? 'Gesperrt: alle Laborarbeiten gehen ans Fremdlabor – oben „Eigenlabor“ wählen.'
      : 'Keine Eigenlabor-Versorgung in der Regelversorgung.'
  const fl = plan.fremdlabor
  const geaendert = e.honorarFaktor > 0 || stufe > 0 || e.eigenKasseProzent !== 100 || e.eigenPrivatAufschlag > 0 || pStufe > 0

  function privatStufe(v: number) {
    const r = privatStufeAnwenden(plan, v)
    setPlan(() => r.plan)
    onMeldungen(r.hinweise)
  }

  function laborWechseln(labor: Einstellungen['labor']) {
    setPlan((p) => {
      const q: HkpPlan = {
        ...p,
        einstellungen: { ...p.einstellungen, labor },
        positionen: p.positionen.map((x) => {
          if (x.ausXml || x.id.startsWith('aufw-')) return x
          if (x.ebene === 'BEL' || x.ebene === 'BEB') return { ...x, labor: undefined }
          if (x.ebene === 'MAT' && x.id.startsWith('impl-')) return { ...x, labor: labor === 'gewerbe' ? 'fremd' as const : undefined }
          return x
        }),
      }
      return labor === 'gewerbe' && (p.einstellungen.eigenPrivatStufe ?? 0) > 0 ? privatStufeAnwenden(q, 0).plan : q
    })
  }

  function zuruecksetzen() {
    const ohne: HkpPlan = { ...plan, einstellungen: { ...e, honorarFaktor: 0, gozZusatzStufe: 0, gozZusatzAus: [], eigenKasseProzent: 100, eigenPrivatAufschlag: 0, eigenPrivatAus: [] } }
    setPlan(() => (pStufe > 0 ? privatStufeAnwenden(ohne, 0).plan : ohne))
  }

  function xmlErstellen() {
    const an = fl.auftragsnummer || auftragsnummerErzeugen(plan)
    if (!fl.auftragsnummer) setPlan((p) => ({ ...p, fremdlabor: { ...p.fremdlabor, auftragsnummer: an } }))
    herunterladen(`${an}.xml`, laborXmlErstellen(plan, ergebnis.positionen, listen, an), 'application/xml')
    onMeldungen([
      `Labor-Auftrag ${an}.xml erstellt (${nFremd} Positionen, Format Laborabrechnungsdaten ${XML_VERSION}). An das Labor senden; dessen Kostenvoranschlag/Rechnung als XML wieder einlesen.`,
      ...(!plan.verwaltung.zahnarztNr || !e.praxisPlz ? ['Für die Standortnummer der Auftragsnummer fehlen Zahnarzt-Nr. (Teil 1) und/oder Praxis-PLZ (Einstellungen) – es wurden Nullen verwendet.'] : []),
    ])
  }

  function xmlEinlesen(f: File | undefined) {
    if (!f) return
    f.text().then((t) => {
      const x = laborXmlLesen(t)
      if (x.fehler.length) {
        onMeldungen(['Labor-XML nicht übernommen:', ...x.fehler])
        return
      }
      const r = laborXmlUebernehmen(plan, x, f.name)
      setPlan(() => r.plan)
      onMeldungen(r.meldungen.map((m) => `Fremdlabor: ${m}`))
    })
    if (xmlRef.current) xmlRef.current.value = ''
  }

  return (
    <div className={`kostenleiste bildschirm${mobil ? ' kl-mobil' : ''}`}>
      {!mobil && (
        <button className="primaer kl-berechnen" onClick={onBerechnen} disabled={!hatBefund}
          title="Ermittelt aus Zeile B (und ggf. TP) Regelversorgung, Festzuschuss-Befunde, BEMA-/GOZ-Positionen und Laborkosten">
          ▶ HKP berechnen
          <small>{hatBefund ? 'Regelversorgung, Festzuschüsse, Positionen, Labor' : 'zuerst Befund in Zeile B eintragen'}</small>
        </button>
      )}
      {/* ---- Zahnarzt ---- */}
      <section className="kl-block kl-zahnarzt">
        <h4>Zahnärztliches Honorar</h4>
        <label className="regler">
          <span className="regler-kopf">
            Zusätzliche GOZ-Leistungen <b>Stufe {stufe}</b> <small>{ZUSATZ_STUFEN[stufe].titel}</small>
          </span>
          <input
            type="range" min={0} max={ZUSATZ_STUFEN.length - 1} step={1} value={stufe}
            onChange={(ev) => setEinstellung('gozZusatzStufe', Number(ev.target.value))}
          />
        </label>
        <label className="regler" title={faktorTitel}>
          <span className="regler-kopf">GOZ-Faktor erhöhen <b>{zahlDe(faktor)}</b></span>
          <input
            type="range" min={min} max={GOZ_HOECHSTSATZ} step={0.1} value={faktor} list="goz-marken"
            onChange={(ev) => { const v = Number(ev.target.value); setEinstellung('honorarFaktor', v <= min ? 0 : v) }}
          />
          <datalist id="goz-marken"><option value={GOZ_SCHWELLENWERT} /><option value={GOZ_HOECHSTSATZ} /></datalist>
        </label>
        <dl className="kl-werte">
          <dt>BEMA (fest)</dt><dd>{euro(s.bemaHonorar)}</dd>
          <dt>GOZ</dt><dd>{euro(s.gozHonorar)} <i>{delta(s.gozHonorar - basis.gozHonorar)}</i></dd>
        </dl>
      </section>

      {/* ---- Eigenlabor ---- */}
      <section className="kl-block kl-eigen">
        <h4>Eigenlabor <span>Praxislabor</span></h4>
        <div className="kl-laborwahl" title="Wer fertigt die Laborarbeiten? Einzelne Positionen lassen sich in der Positionsliste mit →E / →F verschieben.">
          <span>Laborarbeiten</span>
          <button className={nEigen && !nFremdLab ? 'aktiv' : ''} onClick={() => laborWechseln('praxis')}>Eigenlabor</button>
          <button className={nFremdLab && !nEigen ? 'aktiv' : ''} onClick={() => laborWechseln('gewerbe')}>Fremdlabor</button>
          {nEigen > 0 && nFremdLab > 0 && <small>gemischt</small>}
        </div>
        <label className="regler" title="BEL-Höchstpreis Praxislabor = 95 % der Gewerbepreise (§ 88 SGB V), mehr als 100 % ist nicht zulässig.">
          <span className="regler-kopf">Kasse · BEL II <b>{e.eigenKasseProzent} %</b> <small>vom Höchstpreis</small></span>
          <input type="range" min={50} max={100} step={1} value={e.eigenKasseProzent} disabled={!nEigenBel}
            onChange={(ev) => setEinstellung('eigenKasseProzent', Number(ev.target.value))} />
        </label>
        <label className="regler" title={privatTitel}>
          <span className="regler-kopf">Kasse → Privat <b>Stufe {pStufe}</b> <small>{PRIVAT_STUFEN[pStufe].titel}</small></span>
          <input type="range" min={0} max={PRIVAT_STUFE_MAX} step={1} value={pStufe} disabled={!aufwertbar.length && pStufe === 0}
            onChange={(ev) => privatStufe(Number(ev.target.value))} />
        </label>
        <label className="regler">
          <span className="regler-kopf">Privat · BEB <b>+{e.eigenPrivatAufschlag} %</b> <small>Aufschlag</small></span>
          <input type="range" min={0} max={BEB_AUFSCHLAG_MAX} step={1} value={e.eigenPrivatAufschlag} disabled={!nEigenBeb}
            onChange={(ev) => setEinstellung('eigenPrivatAufschlag', Number(ev.target.value))} />
        </label>
        <dl className="kl-werte">
          <dt>Kasse ({nEigenBel})</dt><dd>{euro(s.eigenBel)} <i>{delta(s.eigenBel - basis.eigenBel)}</i></dd>
          <dt>Privat ({nEigenBeb})</dt><dd>{euro(s.eigenBeb)} <i>{delta(s.eigenBeb - basis.eigenBeb)}</i></dd>
          {s.eigenMat !== 0 && <><dt>Material</dt><dd>{euro(s.eigenMat)}</dd></>}
          <dt>MwSt. {zahlDe(e.mwstLabor)} %</dt><dd>{euro(s.eigenMwst)}</dd>
          <dt className="kl-summe">Eigenlabor</dt><dd className="kl-summe">{euro(s.eigenNetto + s.eigenMwst)}</dd>
        </dl>
      </section>

      {/* ---- Fremdlabor ---- */}
      {(nFremd > 0 || fl.import) && <section className="kl-block kl-fremd">
        <h4>Fremdlabor <span>{mobil ? fl.name || 'gewerblich' : 'gewerblich · XML 4.5'}</span></h4>
        {!mobil && <>
        <div className="kl-zeile">
          <input className="kl-name" placeholder="Name des Labors" value={fl.name}
            onChange={(ev) => setPlan((p) => ({ ...p, fremdlabor: { ...p.fremdlabor, name: ev.target.value } }))} />
        </div>
        <div className="kl-zeile kl-an" title="Auftragsnummer nach KZBV-Vorgabe (Standort-Pseudonym-ZE-Plan-lfd. Nr.-Prüfziffer)">
          Auftrag <code>{fl.auftragsnummer || '– noch nicht erstellt –'}</code>
        </div>
        <div className="kl-zeile">
          <button onClick={xmlErstellen} disabled={!nFremd}>⬇ Auftrag als XML</button>
          <input ref={xmlRef} type="file" accept=".xml" hidden onChange={(ev) => xmlEinlesen(ev.target.files?.[0])} />
          <button onClick={() => xmlRef.current?.click()}>⬆ Labor-XML einlesen</button>
        </div>
        </>}
        <dl className="kl-werte">
          <dt>BEL ({anzahl((p) => p.ebene === 'BEL' && p.labor === 'fremd')})</dt><dd>{euro(s.fremdBel)}</dd>
          <dt>BEB/NBL ({anzahl((p) => p.ebene === 'BEB' && p.labor === 'fremd')})</dt><dd>{euro(s.fremdBeb)}</dd>
          {s.fremdMat !== 0 && <><dt>Material/EM</dt><dd>{euro(s.fremdMat)}</dd></>}
          <dt>MwSt. {zahlDe(e.mwstLabor)} %</dt><dd>{euro(s.fremdMwst)}</dd>
          <dt className="kl-summe">Fremdlabor</dt><dd className="kl-summe">{euro(s.fremdNetto + s.fremdMwst)}</dd>
        </dl>
        <p className={`regler-info ${fl.import ? 'ok' : nFremd ? 'begruendung' : ''}`}>
          {fl.import
            ? `✓ Preise aus Labor-XML: Rechnung ${fl.import.rechnungsnummer} vom ${fl.import.lieferdatum}${fl.import.software ? ` (${fl.import.software})` : ''}`
            : nFremd ? 'Vorläufig: Höchstpreise/Listenpreise – Kostenvoranschlag des Labors als XML einlesen.' : 'Keine Fremdlabor-Positionen.'}
        </p>
      </section>}

      {/* ---- Summe ---- */}
      <section className="kl-block kl-summenblock">
        <h4>Gesamt</h4>
        <dl className="kl-werte">
          <dt>Honorar</dt><dd>{euro(s.bemaHonorar + s.gozHonorar)}</dd>
          <dt>Labor + Material</dt><dd>{euro(s.materialUndLabor)}</dd>
          <dt className="kl-summe">Gesamt</dt><dd className="kl-summe">{euro(s.gesamt)} <i>{delta(s.gesamt - basis.gesamt)}</i></dd>
          <dt>Festzuschuss</dt><dd>− {euro(s.kassenanteil)}</dd>
          <dt className="kl-summe">Eigenanteil</dt><dd className="kl-summe rot">{euro(s.eigenanteil)}</dd>
        </dl>
        {geaendert && (
          <button className="klein-btn" onClick={zuruecksetzen}>
            Regler zurücksetzen
          </button>
        )}
      </section>
    </div>
  )
}

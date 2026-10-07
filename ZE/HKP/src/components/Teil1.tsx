import type { ReactNode } from 'react'
import type { AbformungWahl, FestzuschussBefund, HkpPlan, WeitereAngaben } from '../types'
import { befundeZusammenfassen, type BefundZeile, type BerechnetePosition, type Ergebnis, type Listen } from '../engine/berechnung'
import { Zahnschema } from './Zahnschema'
import { Befundergaenzung } from './Befundergaenzung'
import { reparaturArt } from '../engine/reparaturen'
import { euroCt, neueId } from '../format'

interface Props {
  plan: HkpPlan
  setPlan: (f: (p: HkpPlan) => HkpPlan) => void
  ergebnis: Ergebnis
  listen: Listen
  /** wechselt Intraoralscan/Abdruck und rechnet neu */
  onAbformung: (a: AbformungWahl) => void
}

const ZUSCHUSS_STUFEN = [['60', 'ohne Bonus'], ['70', 'Bonus 5 Jahre'], ['75', 'Bonus 10 Jahre'], ['100', 'Härtefall']] as const
const VERSORGUNG_TEXT = { regel: 'Regelversorgung', gleichartig: 'Gleichartige Versorgung', andersartig: 'Andersartige Versorgung' }
const BEFUND_ZEILEN = 10
const BEMA_SPALTE = 7
const BEMA_FORTSETZUNG = 3

/** Kürzelverzeichnis des Vordrucks („Erläuterungen“) */
const ERL_BEFUND: [string, string][] = [
  ['a', 'Adhäsivbrücke (Anker)'], ['pw', 'erhaltungswürdiger Zahn mit partiellen Substanzdefekten'],
  ['ab', 'Adhäsivbrücke (Brückenglied)'], ['r', 'Wurzelstiftkappe'],
  ['aw', 'erneuerungsbedürftige Adhäsivbrücke (Anker)'], ['rw', 'erneuerungsbedürftige Wurzelstiftkappe'],
  ['abw', 'erneuerungsbedürftige Adhäsivbrücke (Brückenglied)'], ['sw', 'erneuerungsbedürftige Suprakonstruktion'],
  ['b', 'Brückenglied'], ['t', 'Teleskop'],
  ['bw', 'erneuerungsbedürftiges Brückenglied'], ['tw', 'erneuerungsbedürftiges Teleskop'],
  ['e', 'ersetzter Zahn'], ['ur', 'unzureichende Retention'],
  ['ew', 'ersetzter, aber erneuerungsbedürftiger Zahn'], ['ww', 'erhaltungswürdiger Zahn mit weitgehender Zerstörung'],
  ['f', 'fehlender Zahn'], ['x', 'nicht erhaltungswürdiger Zahn'],
  ['i', 'Implantat mit intakter Suprakonstruktion'], [')(', 'Lückenschluss'],
  ['ix', 'zu entfernendes Implantat'], ['', ''],
  ['k', 'klinisch intakte Krone'], ['', ''],
  ['kw', 'erneuerungsbedürftige Krone'], ['', ''],
]
const ERL_PLANUNG: [string, string][] = [
  ['A', 'Adhäsivbrücke (Anker)'], ['M', 'Vollkeramische oder keramisch voll verblendete Restauration'],
  ['ABV', 'Adhäsivbrücke (Brückenglied) mit vestibulärer Verblendung'], ['O', 'Geschiebe, Steg etc.'],
  ['ABM', 'Adhäsivbrücke (Brückenglied) vollkeramisch oder keramisch voll verblendet'], ['PK', 'Teilkrone'],
  ['B', 'Brückenglied'], ['R', 'Wurzelstiftkappe'],
  ['E', 'zu ersetzender Zahn'], ['S', 'implantatgetragene Suprakonstruktion'],
  ['H', 'gegossene Halte- und Stützvorrichtung'], ['T', 'Teleskopkrone'],
  ['K', 'Krone'], ['V', 'Vestibuläre Verblendung'],
]

const RECHNUNG = [
  'ZA-Honorar (BEMA siehe III)', 'ZA-Honorar zusätzl. Leist. BEMA', 'ZA-Honorar GOZ', 'Mat.- und Lab.-Kosten Gewerbl.',
  'Mat.- und Lab.-Kosten Praxis', 'Versandkosten Praxis', 'Gesamtsumme', 'Festzuschuss Kasse', 'Versichertenanteil',
]

/** Feld des Vordrucks: kleine Beschriftung oben links, Eingabe darunter */
function Feld({ titel, children, className = '' }: { titel: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <label className={`hb-feld ${className}`}>
      <span className="hb-titel">{titel}</span>
      {children}
    </label>
  )
}

function Kaestchen({ checked, onChange, children, disabled }: { checked?: boolean; onChange?: (v: boolean) => void; children?: ReactNode; disabled?: boolean }) {
  return (
    <label className="hb-check">
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

function EuroCt({ wert, vorschau }: { wert?: number; vorschau?: boolean }) {
  if (wert === undefined) return <><td className="hb-euro" /><td className="hb-ct" /></>
  const [e, c] = euroCt(wert)
  const k = vorschau ? ' vorschau' : ''
  return <><td className={`hb-euro${k}`}>{e}</td><td className={`hb-ct${k}`}>{c}</td></>
}

/** BEMA-Nummern mit Gesamtanzahl in der Reihenfolge des ersten Auftretens */
function bemaZusammenfassen(positionen: BerechnetePosition[]) {
  const m = new Map<string, number>()
  for (const p of positionen) if (p.ebene === 'BEMA' && p.nr) m.set(p.nr, (m.get(p.nr) ?? 0) + p.anzahl)
  return [...m].map(([nr, anzahl]) => ({ nr, anzahl }))
}

function Erlaeuterung({ titel, zusatz, liste }: { titel: string; zusatz?: string; liste: [string, string][] }) {
  return (
    <>
      <div className="hb-erl-titel"><b>{titel}</b>{zusatz && <small> {zusatz}</small>}</div>
      <div className="hb-erl-liste">
        {liste.map(([k, t], i) => <span key={i}>{k && <><b>{k}</b> = {t}</>}</span>)}
      </div>
    </>
  )
}

export function Teil1({ plan, setPlan, ergebnis, listen, onAbformung }: Props) {
  const s = ergebnis.summen
  const feld = <K extends keyof HkpPlan>(k: K, v: HkpPlan[K]) => setPlan((p) => ({ ...p, [k]: v }))
  const patient = (k: keyof HkpPlan['patient'], v: string) => setPlan((p) => ({ ...p, patient: { ...p.patient, [k]: v } }))
  const verwaltung = (k: keyof HkpPlan['verwaltung'], v: string) => setPlan((p) => ({ ...p, verwaltung: { ...p.verwaltung, [k]: v } }))
  const weitere = (teil: Partial<WeitereAngaben>) => setPlan((p) => ({ ...p, weitere: { ...p.weitere, ...teil } }))
  const w = plan.weitere

  /** Eine zusammengefasste Zeile: die Nr. gilt für alle ihre Befunde, Zahn/Anzahl machen daraus einen Befund. */
  const befundAendern = (zeile: BefundZeile | undefined, teil: Partial<FestzuschussBefund>) =>
    setPlan((p) => {
      const ids = new Set(zeile?.ids ?? [])
      const index = p.befunde.findIndex((b) => ids.has(b.id))
      const alt = p.befunde[index]
      if (!alt || !zeile) return { ...p, befunde: [...p.befunde, { id: neueId(), nr: '', zahnGebiet: '', anzahl: 1, ...teil }] }
      if (ids.size > 1 && teil.nr !== undefined) return { ...p, befunde: p.befunde.map((b) => (ids.has(b.id) ? { ...b, nr: teil.nr!, auto: false } : b)) }
      const neu = { ...alt, zahnGebiet: zeile.zahnGebiet, anzahl: zeile.anzahl, ...teil, auto: false }
      const leer = !neu.nr && !neu.zahnGebiet
      return { ...p, befunde: p.befunde.flatMap((b, i) => (i === index ? (leer ? [] : [neu]) : ids.has(b.id) ? [] : [b])) }
    })

  const bema = bemaZusammenfassen(ergebnis.positionen)
  const bemaZelle = (i: number, cls = '') => {
    const b = bema[i]
    return <><td className={`hb-nr ${cls}`}>{b?.nr}</td><td className={`hb-anz ${cls}`}>{b?.anzahl}</td></>
  }
  const fortsetzung = (start: number) => bemaZelle(BEMA_SPALTE + start, 'hb-fort-zelle')
  const zuViel = bema.length > BEMA_SPALTE + 2 * BEMA_FORTSETZUNG
  const zeilen = befundeZusammenfassen(ergebnis.befunde)
  const beantragt = zeilen.filter((b) => !b.nachtraeglich)
  const nachtraeglich = zeilen.filter((b) => b.nachtraeglich)
  const befundZeilen = Math.max(BEFUND_ZEILEN, beantragt.length + 1)
  const summeBeantragt = beantragt.reduce((t, b) => t + b.betrag, 0)
  const reparaturText = plan.reparaturen
    .map((r) => { const a = reparaturArt(r.art); return a && r.gebiet ? `${r.gebiet}: ${a.titel.replace(/ \(.*\)$/, '')}` : '' })
    .filter(Boolean).join('; ')

  return (
    <div className="hkp-seite">
      <div className="hkp-blatt teil1">
        <div className="hb-rand-text">Bei Handbeschriftung unbedingt in Blockschrift schreiben</div>

        {/* ---------- Kopf ---------- */}
        <div className="hb-kopf">
          <div className="hb-personalien">
            <Feld titel="Krankenkasse bzw. Kostenträger" className="hb-zeile hb-kasse-zeile">
              <input value={plan.patient.kasse} onChange={(e) => patient('kasse', e.target.value)} />
            </Feld>
            <div className="hb-zeile hb-name">
              <Feld titel="Name, Vorname des Versicherten" className="hb-grow">
                <span className="hb-zwei">
                  <input placeholder="Name" value={plan.patient.name} onChange={(e) => patient('name', e.target.value)} />
                  <input placeholder="Vorname" value={plan.patient.vorname} onChange={(e) => patient('vorname', e.target.value)} />
                </span>
              </Feld>
              <Feld titel="geb. am" className="hb-geb">
                <input type="date" value={plan.patient.geburtsdatum} onChange={(e) => patient('geburtsdatum', e.target.value)} />
              </Feld>
            </div>
            <div className="hb-zeile hb-drei">
              <Feld titel="Kostenträgerkennung"><input value={plan.patient.kassenNr} onChange={(e) => patient('kassenNr', e.target.value)} /></Feld>
              <Feld titel="Versicherten-Nr."><input value={plan.patient.versichertenNr} onChange={(e) => patient('versichertenNr', e.target.value)} /></Feld>
              <Feld titel="Status"><input value={plan.patient.status} onChange={(e) => patient('status', e.target.value)} /></Feld>
            </div>
            <div className="hb-zeile hb-drei">
              <span />
              <Feld titel="Vertragszahnarzt-Nr."><input value={plan.verwaltung.zahnarztNr} onChange={(e) => verwaltung('zahnarztNr', e.target.value)} /></Feld>
              <Feld titel="Datum"><input type="date" value={plan.verwaltung.ausstellungsdatum} onChange={(e) => verwaltung('ausstellungsdatum', e.target.value)} /></Feld>
            </div>
          </div>

          <div className="hb-erklaerung">
            <div className="hb-erkl-kopf">Erklärung des Versicherten</div>
            <div className="hb-erkl-box">
              <p>
                Ich bin bei der genannten Krankenkasse versichert. Ich bin über Art, Umfang und Kosten der Regel-, der gleich- und
                andersartigen Versorgung sowie über den voraussichtlichen Herstellungsort bzw. das voraussichtliche Herstellungsland
                des Zahnersatzes{' '}
                <input
                  className="hb-herstellung" placeholder="z. B. D München" title="Herstellungsort bzw. -land (Inland mit vorangestelltem „D“)"
                  value={plan.verwaltung.herstellungsort} onChange={(e) => verwaltung('herstellungsort', e.target.value)}
                />{' '}
                aufgeklärt worden und wünsche die Behandlung entsprechend diesem Kostenplan.
              </p>
              <div className="hb-unterschrift">Datum/Unterschrift des <b>Versicherten</b></div>
            </div>
          </div>

          <div className="hb-stempel-spalte">
            <div className="hb-lfd"><b>Lfd.-Nr.</b><input className="hb-box" value={plan.verwaltung.lfdNr} onChange={(e) => verwaltung('lfdNr', e.target.value)} /></div>
            <div className="hb-stempel">Stempel des <b>Zahnarztes</b></div>
          </div>

          <div className="hb-titel-block">
            <h2>Heil- und Kostenplan</h2>
            <p>Hinweis an den Versicherten:<br />Bonusheft bitte zur Zuschussfestsetzung beifügen.</p>
          </div>
        </div>

        {/* ---------- I. Befund ---------- */}
        <div className="hb-abschnitt">
          <span>I. Befund des gesamten Gebisses/Behandlungsplan</span>
          <span className="hb-legende"><span>TP = Therapieplanung</span><span>R = Regelversorgung</span><span>B = Befund</span></span>
        </div>
        <Zahnschema
          zaehne={plan.zaehne}
          onChange={(zahn, aenderung) => setPlan((p) => ({ ...p, zaehne: { ...p.zaehne, [zahn]: { ...(p.zaehne[zahn] ?? { B: '', R: '', TP: '' }), ...aenderung } } }))}
        />
        <Feld titel="Bemerkungen (bei Wiederherstellung Art der Leistung)" className="hb-bemerkungen">
          <input value={plan.bemerkungen} placeholder={reparaturText} onChange={(e) => feld('bemerkungen', e.target.value)} />
        </Feld>

        <Befundergaenzung plan={plan} setPlan={setPlan} onAbformung={onAbformung} />

        {/* ---------- II. Befunde / IV. Zuschussfestsetzung / Angaben ---------- */}
        <div className="hb-mitte">
          <div className="hb-spalten-hinweis"><span>(Spalten 1–3 vom Zahnarzt auszufüllen)</span></div>
          <table className="hb-tabelle hb-befunde">
            <colgroup><col style={{ width: '21%' }} /><col style={{ width: '27%' }} /><col style={{ width: '11%' }} /><col style={{ width: '29%' }} /><col style={{ width: '12%' }} /></colgroup>
            <thead>
              <tr>
                <th colSpan={3} className="hb-kopfzeile">II. Befunde für Festzuschüsse</th>
                <th colSpan={2} className="hb-kopfzeile hb-iv">IV. Zuschussfestsetzung</th>
              </tr>
              <tr className="hb-unterkopf">
                <th>Befund Nr.<sup>1</sup></th><th>Zahn/Gebiet <sup>2</sup></th><th>Anz.<sup>3</sup></th>
                <th className="hb-iv-l"><b>Betrag</b> Euro</th><th className="hb-iv-r">Ct</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: befundZeilen }, (_, i) => {
                const b = beantragt[i]
                return (
                  <tr
                    key={b?.id ?? `leer-${i}`}
                    className={b?.fehler ? 'zeile-fehler' : b?.fakultativ ? 'zeile-fakultativ' : ''}
                    title={b ? b.fehler ?? `${b.text}${b.fakultativ ? ' – fakultativ (DPF-Vorschlag „?“)' : ''}` : 'Befund-Nr. eintragen, um einen Befund hinzuzufügen'}
                  >
                    <td><input list="liste-fz" value={b?.nr ?? ''} onChange={(e) => befundAendern(b, { nr: e.target.value })} /></td>
                    <td><input className={(b?.zahnGebiet.length ?? 0) > 17 ? 'hb-sehr-lang' : (b?.zahnGebiet.length ?? 0) > 11 ? 'hb-lang' : ''} title={b?.zahnGebiet} value={b?.zahnGebiet ?? ''} onChange={(e) => befundAendern(b, { zahnGebiet: e.target.value })} /></td>
                    <td><input className="r" value={b ? String(b.anzahl) : ''} onChange={(e) => befundAendern(b, { anzahl: Number(e.target.value) || 1 })} /></td>
                    <EuroCt wert={b ? b.betrag : undefined} vorschau />
                  </tr>
                )
              })}
              <tr className="hb-summe">
                <td colSpan={3} className="r"><b>vorläufige Summe</b> <span className="hb-pfeil">▶</span></td>
                <EuroCt wert={beantragt.length ? summeBeantragt : undefined} vorschau />
              </tr>
              <tr className="hb-nachtraeglich"><td colSpan={3}>Nachträgliche Befunde:</td><td className="hb-iv-l" /><td className="hb-iv-r" /></tr>
              {Array.from({ length: Math.max(1, nachtraeglich.length) }, (_, i) => {
                const b = nachtraeglich[i]
                const ende = i === Math.max(1, nachtraeglich.length) - 1 ? ' hb-iv-ende' : ''
                return (
                  <tr key={b?.id ?? 'nachtrag-leer'} className="hb-nachtraeglich" title={b ? `${b.text} – nachträglich, keine erneute Genehmigung (Abrechnung)` : 'Stiftbefunde nach der Bewilligung: unter „Klinische Angaben“ als nachträglich markieren'}>
                    <td>{b?.nr}</td><td>{b?.zahnGebiet}</td><td className="r">{b?.anzahl}</td>
                    {b ? <EuroCt wert={b.betrag} vorschau /> : <><td className={`hb-iv-l${ende}`} /><td className={`hb-iv-r${ende}`} /></>}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <datalist id="liste-fz">
            {listen.fz?.eintraege.map((e) => <option key={e.nr} value={e.nr}>{e.text}</option>)}
          </datalist>

          <div className="hb-rechts">
            <div className="hb-angaben">
              <Kaestchen checked={w.unfall} onChange={(v) => weitere({ unfall: v })}>Unfall oder Unfallfolgen/<br />Berufskrankheit</Kaestchen>
              <Kaestchen checked={w.interimOK || w.interimUK} onChange={(v) => weitere({ interimOK: v, interimUK: false })}>Interimsversorgung</Kaestchen>
              <Kaestchen checked={w.unbrauchbarOK || w.unbrauchbarUK} onChange={(v) => weitere({ unbrauchbarOK: v, unbrauchbarUK: false })}>Unbrauchbare<br />Prothese/Brücke/Krone</Kaestchen>
              <Kaestchen checked={w.ser} onChange={(v) => weitere({ ser: v })}>Versorgungsleiden</Kaestchen>
              <Kaestchen checked={w.immediatOK || w.immediatUK} onChange={(v) => weitere({ immediatOK: v, immediatUK: false })}>Immediatversorgung</Kaestchen>
              <span className="hb-alter">
                Alter ca.
                <input value={w.alterOK || w.alterUK} onChange={(e) => weitere({ alterOK: e.target.value, alterUK: '' })} />
                Jahre
              </span>
              <Kaestchen checked={w.nem} onChange={(v) => weitere({ nem: v })}>NEM</Kaestchen>
              <Kaestchen checked={ergebnis.direktabrechnung} disabled>Direktabrechnung</Kaestchen>
            </div>

            <div className="hb-kasse-reihe">
              <div className="hb-kasse">
                <p>
                  Die Krankenkasse übernimmt die nebenstehenden Festzuschüsse, höchstens jedoch die tatsächlichen Kosten.
                  Voraussetzung ist, dass der Zahnersatz innerhalb von 6 Monaten in der vorgesehenen Weise eingegliedert wird.
                </p>
                <div className="hb-klein hb-kasse-unterschrift">Datum, Unterschrift<br />und Stempel der Krankenkasse</div>
                <div className="hb-hinweis-kasse">
                  <b>Hinweis:</b>
                  <Kaestchen disabled>% Festzuschuss</Kaestchen>
                  <Kaestchen disabled>Es liegt ein Härtefall vor.</Kaestchen>
                </div>
              </div>
              <div className="hb-erlaeuterungen">
                <div className="hb-erl-kopf">Erläuterungen</div>
                <Erlaeuterung titel="Befund" zusatz="(Kombinationen sind zulässig)" liste={ERL_BEFUND} />
                <Erlaeuterung titel="Behandlungsplanung:" liste={ERL_PLANUNG} />
              </div>
            </div>
          </div>
        </div>

        {/* ---------- III. Kostenplanung / V. Rechnungsbeträge ---------- */}
        <div className="hb-unten">
          <div>
            <table className="hb-tabelle hb-kosten">
              <colgroup>
                <col style={{ width: '22%' }} /><col style={{ width: '5%' }} />
                <col style={{ width: '22%' }} /><col style={{ width: '5%' }} />
                <col style={{ width: '22%' }} /><col style={{ width: '5%' }} />
                <col style={{ width: '13%' }} /><col style={{ width: '6%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="hb-kopfzeile">III. Kostenplanung</th><th />
                  <th className="hb-fort">1 Fortsetzung</th><th className="hb-fort hb-anz">Anz.</th>
                  <th className="hb-fort">1 Fortsetzung</th><th className="hb-fort hb-anz">Anz.</th>
                  <th /><th />
                </tr>
              </thead>
              <tbody>
                <tr><td className="hb-nr-kopf">1 BEMA-Nrn.</td><td className="hb-anz hb-klein">Anz.</td>{fortsetzung(0)}{fortsetzung(BEMA_FORTSETZUNG)}<td /><td /></tr>
                <tr>{bemaZelle(0)}{fortsetzung(1)}{fortsetzung(BEMA_FORTSETZUNG + 1)}<td /><td /></tr>
                <tr className="hb-fort-ende">{bemaZelle(1)}{fortsetzung(2)}{fortsetzung(BEMA_FORTSETZUNG + 2)}<td className="hb-euro-kopf">Euro</td><td className="hb-ct-kopf">Ct</td></tr>
                <tr className="hb-zeile-betrag">{bemaZelle(2)}<td colSpan={4}><span className="hb-ziffer">2</span>Zahnärztliches Honorar BEMA:</td><EuroCt wert={s.bemaHonorar || undefined} /></tr>
                <tr className="hb-zeile-betrag">{bemaZelle(3)}<td colSpan={4}><span className="hb-ziffer">3</span>Zahnärztliches Honorar GOZ:<br /><span className="hb-ziffer" />(geschätzt)</td><EuroCt wert={s.gozHonorar || undefined} /></tr>
                <tr className="hb-zeile-betrag">{bemaZelle(4)}<td colSpan={4}><span className="hb-ziffer">4</span>Material- und Laborkosten:<br /><span className="hb-ziffer" />(geschätzt)</td><EuroCt wert={s.materialUndLabor || undefined} /></tr>
                <tr className="hb-zeile-betrag">{bemaZelle(5)}<td colSpan={4}><span className="hb-ziffer">5</span>Behandlungskosten insgesamt:<br /><span className="hb-ziffer" />(geschätzt)</td><EuroCt wert={s.gesamt || undefined} /></tr>
                <tr>{bemaZelle(6)}<td colSpan={6} className="hb-za-zeile"><span className="hb-datumbox" /></td></tr>
              </tbody>
            </table>
            <div className="hb-klein hb-unterschrift-za">Datum/Unterschrift des <b>Zahnarztes</b></div>
          </div>

          <table className="hb-tabelle hb-rechnung">
            <colgroup><col style={{ width: '6%' }} /><col style={{ width: '46%' }} /><col style={{ width: '32%' }} /><col style={{ width: '16%' }} /></colgroup>
            <thead>
              <tr><th colSpan={2} className="hb-kopfzeile">V. Rechnungsbeträge <span>(siehe Anlage)</span></th><th className="c">Euro</th><th className="c">Ct</th></tr>
            </thead>
            <tbody>
              {RECHNUNG.map((t, i) => (
                <tr key={t} className={i === 6 ? 'hb-strich' : ''}><td className="c">{i + 1}</td><td>{t}</td><td className="hb-euro" /><td className="hb-ct" /></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ---------- Fuß ---------- */}
        <div className="hb-fuss">
          <Feld titel={<>Anschrift des <b>Versicherten</b></>} className="hb-anschrift">
            <div className="hb-anschrift-felder">
              <input value={plan.patient.strasse} placeholder="Straße, Nr." onChange={(e) => patient('strasse', e.target.value)} />
              <div>
                <input className="hb-plz" value={plan.patient.plz} placeholder="PLZ" inputMode="numeric" onChange={(e) => patient('plz', e.target.value)} />
                <input value={plan.patient.ort} placeholder="Ort" onChange={(e) => patient('ort', e.target.value)} />
              </div>
            </div>
          </Feld>
          <div className="hb-gutachter">
            <div className="hb-gutachter-box">
              Gutachterlich befürwortet
              <span><Kaestchen disabled>ja</Kaestchen><Kaestchen disabled>nein</Kaestchen><Kaestchen disabled>teilweise</Kaestchen></span>
            </div>
            <div className="hb-gutachter-stempel" />
            <div className="hb-klein">Datum/Unterschrift und Stempel<br />des <b>Gutachters</b></div>
          </div>
          <div className="hb-eingliederung">
            <div className="hb-eingl-datum">
              <span>Eingliederungs-<br />datum:</span>
              <input className="hb-box" type="date" value={plan.verwaltung.eingliederungsdatum} onChange={(e) => verwaltung('eingliederungsdatum', e.target.value)} />
            </div>
            <label>Herstellungsort bzw. Herstellungsland des Zahnersatzes:
              <input value={plan.verwaltung.herstellungsortEingliederung} onChange={(e) => verwaltung('herstellungsortEingliederung', e.target.value)} />
            </label>
            <p>Der Zahnersatz wurde in der vorgesehenen Weise eingegliedert.</p>
            <div className="hb-klein hb-eingl-unterschrift">Datum/Unterschrift des <b>Zahnarztes</b></div>
          </div>
        </div>
        <div className="hb-stand">(10.2020)</div>
      </div>

      {/* ---------- Arbeitsbereich (nur Bildschirm) ---------- */}
      <div className="hkp-arbeitsbereich bildschirm">
        <section className="abschnitt">
          {zuViel && <p className="hinweis warnung">Mehr BEMA-Nummern als Zeilen im Vordruck – bitte eine Fortsetzungsseite verwenden.</p>}
          <div className="berechnung-zeile">
            <div className="zuschuss-wahl" role="radiogroup" aria-label="Voraussichtliche Zuschusshöhe">
              {ZUSCHUSS_STUFEN.map(([wert, text]) => {
                const aktiv = wert === '100' ? plan.zuschuss.haertefall : !plan.zuschuss.haertefall && plan.zuschuss.bonus === wert
                return (
                  <button
                    key={wert} role="radio" aria-checked={aktiv} className={aktiv ? 'aktiv' : ''}
                    onClick={() => feld('zuschuss', wert === '100' ? { ...plan.zuschuss, haertefall: true } : { ...plan.zuschuss, bonus: wert, haertefall: false })}
                  >
                    <b>{wert} %</b><small>{text}</small>
                  </button>
                )
              })}
            </div>
            <div className="berechnung-info">
            <span className={`berechnung-status versorgung-${ergebnis.versorgungsart}`} title="Automatisch aus Zeile R und TP ermittelt">
              {VERSORGUNG_TEXT[ergebnis.versorgungsart]}
            </span>
            <span
              className={`berechnung-status ${ergebnis.direktabrechnung ? 'direkt' : 'kzv'}`}
              title={ergebnis.direktabrechnung
                ? 'Andersartige Versorgung: Rechnung über die Gesamtkosten an den Patienten, Festzuschuss zahlt die Kasse an ihn (Vordruck 3e)'
                : 'Festzuschuss wird über die KZV abgerechnet'}
            >
              {ergebnis.direktabrechnung ? 'Direktabrechnung' : 'Abrechnung über KZV'}
            </span>
            </div>
            {plan.versorgungsart !== 'auto' && (
              <button className="klein-btn" title="Versorgungsart wurde aus der DPF übernommen bzw. früher von Hand gesetzt" onClick={() => feld('versorgungsart', 'auto')}>
                automatisch bestimmen
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

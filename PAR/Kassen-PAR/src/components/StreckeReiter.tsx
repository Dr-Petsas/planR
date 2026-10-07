import { useMemo, useState } from 'react'
import { ANALOG } from '../data/gebuehren'
import { KATEGORIEN, ROENTGEN_WAHL, type Kachel } from '../data/kacheln'
import {
  reglerGesamt, reglerTermin, roentgenWahl, streckeRechnen, terminKontext, type KachelStand, type Preise, type TerminRechnung,
} from '../engine/leistungen'
import { euro, uptFrequenz } from '../engine/strecke'
import {
  ART_LABEL, datumDe, fristenPruefen, terminePlanen, wochentag, type Fristmeldung,
} from '../engine/termine'
import { ALLE_ZAEHNE } from '../engine/zahnschema'
import type { DiagnoseErgebnis, ParFall, Planung, Termin, TerminArt, UptModul } from '../types'

interface Props {
  fall: ParFall
  setFall: (f: ParFall) => void
  diag: DiagnoseErgebnis
  preise: Preise
}

const FAKTOREN = [1.0, 1.8, 2.3, 3.5]
const MODULE: UptModul[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
const zahlDe = (n: number) => n.toFixed(1).replace('.', ',')

export default function StreckeReiter({ fall, setFall, diag, preise }: Props) {
  const neuPlanen = (f: ParFall) => setFall({ ...f, termine: terminePlanen(f, diag) })
  const setPlanung = (patch: Partial<Planung>) => neuPlanen({ ...fall, planung: { ...fall.planung, ...patch } })
  const p = fall.planung
  const [offen, setOffen] = useState<Set<string>>(new Set())

  const summen = useMemo(() => streckeRechnen(fall, preise), [fall, preise])
  const fristen = useMemo(() => fristenPruefen(fall, diag), [fall, diag])
  const ersteUpt = fall.termine.find((t) => t.art === 'upt')

  const setTermin = (t: Termin, neuberechnen = false) => {
    const f = { ...fall, termine: fall.termine.map((x) => (x.id === t.id ? t : x)) }
    if (neuberechnen) neuPlanen(f)
    else setFall(f)
  }

  const zusatzTermin = (art: TerminArt) => {
    const datum = fall.termine.at(-1)?.datum || p.start
    const t: Termin = {
      id: 'extra-' + Math.random().toString(36).slice(2, 10), schluessel: 'extra-' + Date.now().toString(36),
      art, titel: ART_LABEL[art], datum, datumManuell: true, erbracht: false, zaehne: null,
      module: art === 'upt' ? ['a', 'b', 'c', 'e', 'f'] : [], verlaengerung: false,
      auswahl: [], abgewaehlt: [], auto: [], mengen: {}, faktoren: {}, roentgen: '', bemerkung: '',
    }
    setFall({ ...fall, termine: [...fall.termine, t].sort((a, b) => a.datum.localeCompare(b.datum)) })
  }

  const umschalten = (id: string) => setOffen((o) => {
    const n = new Set(o)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const alleOffen = fall.termine.length > 0 && fall.termine.every((t) => offen.has(t.id))

  return (
    <div className="strecke-seite">
      <section className="umsatz-leiste keindruck">
        <div className="umsatz-kopf">
          <div className="karte-titel">Umsatz</div>
          <div className="badge-gruppe">
            <button className={fall.modus === 'bema' ? 'aktiv' : ''} onClick={() => setFall({ ...fall, modus: 'bema' })}>nur BEMA</button>
            <button className={fall.modus === 'bemaplus' ? 'aktiv' : ''} onClick={() => setFall({ ...fall, modus: 'bemaplus' })}>BEMA + privat</button>
          </div>
        </div>
        <div className="summen">
          <div><span>Kasse</span><b>{euro(summen.kasse)}</b></div>
          <div><span>Privat</span><b>{euro(summen.privat)}</b></div>
          <div className="gross"><span>Gesamt</span><b>{euro(summen.summe)}</b></div>
          <div><span>erbracht</span><b>{euro(summen.erbracht)}</b></div>
        </div>
        <div className="umsatz-regler">
          <Regler min={summen.basis} max={summen.potential} wert={summen.summe}
            onChange={(v) => setFall({ ...fall, zielGesamt: v, termine: reglerGesamt(fall, preise, v) })} />
          <p className="hinweis-klein">Der Regler verteilt den Zielumsatz reihum auf alle offenen Termine: erst
            Kassen-Begleitleistungen, dann private Zusatzleistungen, je Termin die wertvollste zuerst.
            Von Hand Gewähltes bleibt, ★ = vom Regler.</p>
        </div>
        <div className="knopf-spalte">
          <button onClick={() => setFall({ ...fall, zielGesamt: 0, termine: fall.termine.map((t) => (t.erbracht ? t : { ...t, auto: [] })) })}>Regler zurücksetzen</button>
          <button onClick={() => setOffen(alleOffen ? new Set() : new Set(fall.termine.map((t) => t.id)))}>{alleOffen ? 'Alle zuklappen' : 'Alle aufklappen'}</button>
        </div>
      </section>

    <div className="strecke">
      <aside className="strecke-links keindruck">
        <section className="karte">
          <div className="karte-titel">Planung <button className="klein" onClick={() => neuPlanen(fall)}>neu berechnen</button></div>
          <div className="feld-paar">
            <label className="feld"><span className="feld-label">Befundaufnahme</span>
              <input type="date" value={p.start} onChange={(e) => setPlanung({ start: e.target.value })} /></label>
            <label className="feld"><span className="feld-label">Tage bis ATG</span>
              <input type="number" min={0} max={120} value={p.genehmigungTage} onChange={(e) => setPlanung({ genehmigungTage: Number(e.target.value) || 0 })} /></label>
          </div>
          <div className="badge-gruppe">
            <span className="feld-label">AIT</span>
            {([1, 2, 4] as const).map((n) => (
              <button key={n} className={p.aitSitzungen === n ? 'aktiv' : ''} onClick={() => setPlanung({ aitSitzungen: n })}>
                {n === 1 ? '1 Sitzung' : n === 2 ? 'OK / UK' : 'Quadranten'}
              </button>
            ))}
          </div>
          <div className="feld-paar">
            <label className="feld"><span className="feld-label">Abstand AIT (Tage)</span>
              <input type="number" min={1} max={60} value={p.aitAbstandTage} onChange={(e) => setPlanung({ aitAbstandTage: Number(e.target.value) || 1 })} /></label>
            <label className="feld"><span className="feld-label">Praxistage</span>
              <select value={p.werktage} onChange={(e) => setPlanung({ werktage: Number(e.target.value) as 5 | 6 })}>
                <option value={5}>Mo–Fr</option><option value={6}>Mo–Sa</option>
              </select></label>
          </div>
          <div className="schalter-spalte">
            <label className="schalter"><input type="checkbox" checked={p.mitPzr} onChange={(e) => setPlanung({ mitPzr: e.target.checked })} /><span>private Vorbehandlung (PZR)</span></label>
            <label className="schalter"><input type="checkbox" checked={fall.mitCPT} onChange={(e) => neuPlanen({ ...fall, mitCPT: e.target.checked })} /><span>CPT (offenes Vorgehen)</span></label>
            {fall.mitCPT && (
              <div className="badge-gruppe pink">
                <span className="feld-label">CPT</span>
                {([1, 2, 4] as const).map((n) => (
                  <button key={n} className={p.cptSitzungen === n ? 'aktiv' : ''} onClick={() => setPlanung({ cptSitzungen: n })}>
                    {n === 1 ? '1 Sitzung' : n === 2 ? 'OK / UK' : 'Quadranten'}
                  </button>
                ))}
              </div>
            )}
            <label className="schalter"><input type="checkbox" checked={p.par22a} onChange={(e) => setPlanung({ par22a: e.target.checked })} /><span>§ 22a SGB V (Anzeige 5e)</span></label>
            <label className="schalter"><input type="checkbox" checked={fall.uebernahmefall} onChange={(e) => neuPlanen({ ...fall, uebernahmefall: e.target.checked })} /><span>Übernahmefall</span></label>
            {fall.uebernahmefall && (
              <div className="feld-paar">
                <select value={p.einstieg} onChange={(e) => setPlanung({ einstieg: e.target.value as Planung['einstieg'] })}>
                  <option value="komplett">Einstieg komplett</option>
                  <option value="ait">ab AIT</option>
                  <option value="bev">ab BEV</option>
                  <option value="upt">ab UPT</option>
                </select>
                {p.einstieg === 'upt' && (
                  <label className="inline-feld">ab UPT Nr.
                    <input type="number" min={1} max={8} value={p.uptAb} onChange={(e) => setPlanung({ uptAb: Number(e.target.value) || 1 })} />
                  </label>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="karte">
          <div className="karte-titel">UPT – Grad {diag.grad}</div>
          <div className="feld-paar">
            <label className="feld"><span className="feld-label">Erste UPT am</span>
              <input type="date" value={p.uptStart || ersteUpt?.datum || ''} onChange={(e) => setPlanung({ uptStart: e.target.value })} /></label>
            <label className="feld"><span className="feld-label">Verlängerung (Monate)</span>
              <input type="number" min={0} max={24} value={p.verlaengerungMonate} onChange={(e) => setPlanung({ verlaengerungMonate: Number(e.target.value) || 0 })} /></label>
          </div>
          {p.uptStart && <button className="klein" onClick={() => setPlanung({ uptStart: '' })}>Start wieder nach der Befundevaluation</button>}
          <p className="hinweis-klein">{uptText(diag.grad)}{p.par22a ? ' · § 22a: 4 UPT im Abstand von 5 Monaten (Prototyp, vor Abrechnung prüfen).' : ''}</p>
        </section>

      </aside>

      <div className="timeline keindruck">
        {fall.termine.length === 0 && <button className="primaer" onClick={() => neuPlanen(fall)}>Strecke anlegen</button>}
        {summen.je.map(({ termin, r }) => (
          <div key={termin.id}>
            {termin === ersteUpt && (
              <div className="phase">
                <b>Unterstützende Parodontitistherapie</b> ab {wochentag(termin.datum)} {datumDe(termin.datum)} · {uptText(diag.grad)}
              </div>
            )}
            <TerminKarte
              fall={fall} termin={termin} r={r} preise={preise} offen={offen.has(termin.id)} onUmschalten={() => umschalten(termin.id)}
              fristen={fristen.filter((f) => f.terminId === termin.id)}
              onChange={setTermin}
              onLoeschen={() => setFall({ ...fall, termine: fall.termine.filter((x) => x.id !== termin.id) })}
            />
          </div>
        ))}
        <div className="knopf-reihe">
          <span className="feld-label">Termin hinzufügen:</span>
          {(['kontrolle', 'nachbehandlung', 'upt', 'pzr'] as TerminArt[]).map((a) => (
            <button key={a} onClick={() => zusatzTermin(a)}>+ {ART_LABEL[a]}</button>
          ))}
        </div>
      </div>

    </div>
    </div>
  )
}

/** Kurzform der Gebuehrennummer fuer Badges: Analogleistungen als "4005a". */
function kurzNr(sys: string, nr: string): string {
  if (sys !== 'ANALOG') return nr
  const bezug = ANALOG[nr]?.bezug
  return bezug ? `${bezug.replace(/^GOZ /, '')}a` : nr
}

function uptText(g: 'A' | 'B' | 'C') {
  const f = uptFrequenz(g)
  if (g === 'A') return 'UPT a/b/c/e/f 2× im Abstand von mind. 10 Monaten, UPT g einmal'
  return `UPT a/b/c/e/f ${f.sitzungen}× im Abstand von mind. ${f.abstandMon} Monaten, UPT d ${f.dMax}×, UPT g einmal`
}

function Regler({ min, max, wert, onChange, aus }: {
  min: number; max: number; wert: number; onChange: (v: number) => void; aus?: boolean
}) {
  const leer = aus || max - min < 0.01
  return (
    <div className="regler">
      <input type="range" min={Math.floor(min)} max={Math.ceil(max)} step={1} value={Math.round(wert)}
        disabled={leer} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="regler-werte">
        <span>{euro(min)}</span>
        <input type="number" min={Math.floor(min)} max={Math.ceil(max)} step={1} value={Math.round(wert)}
          disabled={leer} onChange={(e) => onChange(Number(e.target.value))} />
        <span>{euro(max)}</span>
      </div>
    </div>
  )
}

function TerminKarte({ fall, termin: t, r, preise, fristen, offen, onUmschalten, onChange, onLoeschen }: {
  fall: ParFall; termin: Termin; r: TerminRechnung; preise: Preise; fristen: Fristmeldung[]
  offen: boolean; onUmschalten: () => void
  onChange: (t: Termin, neuberechnen?: boolean) => void; onLoeschen: () => void
}) {
  const [zaehneOffen, setZaehneOffen] = useState(false)
  const extra = t.schluessel.startsWith('extra-')

  const klick = (k: Kachel, aktiv: boolean, auto: boolean) => {
    if (t.erbracht) return
    const ohne = (a: string[]) => a.filter((x) => x !== k.id)
    if (aktiv) {
      if (auto) onChange({ ...t, auto: ohne(t.auto), abgewaehlt: [...t.abgewaehlt, k.id] })
      else if (t.auswahl.includes(k.id)) onChange({ ...t, auswahl: ohne(t.auswahl) })
      else onChange({ ...t, abgewaehlt: [...t.abgewaehlt, k.id] })
    } else if (t.abgewaehlt.includes(k.id)) {
      onChange({ ...t, abgewaehlt: ohne(t.abgewaehlt), auswahl: [...ohne(t.auswahl), k.id] })
    } else {
      onChange({ ...t, auswahl: [...t.auswahl, k.id] })
    }
  }

  const autoZaehne = terminKontext(fall, { ...t, zaehne: null }).behandelt
  const zahnUmschalten = (z: string) => {
    const basis = t.zaehne ?? autoZaehne
    const neu = basis.includes(z) ? basis.filter((x) => x !== z) : ALLE_ZAEHNE.filter((x) => basis.includes(x) || x === z)
    onChange({ ...t, zaehne: neu })
  }
  const zeigtZaehne = ['ait', 'cpt', 'nachbehandlung', 'upt', 'pzr'].includes(t.art)
  const fehler = fristen.some((f) => f.art === 'fehler')
  const nachKategorie = KATEGORIEN.map((kat) => [kat, r.kacheln.filter((s) => s.kachel.kategorie === kat)] as const)
    .filter(([, l]) => l.length > 0)
  const kachelVon = (id: string) => r.kacheln.find((s) => s.kachel.id === id)

  return (
    <section className={`result-card art-${t.art}${t.erbracht ? ' erbracht' : ''}${fehler ? ' fristfehler' : ''}${offen ? ' offen' : ''}`}>
      <div className="result-header" onClick={onUmschalten}>
        <div className="date-wrapper" onClick={(e) => e.stopPropagation()}>
          <input className={`result-date${fehler ? ' warning' : ''}`} type="date" value={t.datum}
            onChange={(e) => onChange({ ...t, datum: e.target.value, datumManuell: true }, true)} />
          <span className="wochentag">{wochentag(t.datum)}</span>
        </div>
        <div className="text-wrapper">
          <h3>{t.titel}</h3>
          <div className="sch-badges">
            {t.art === 'upt' && t.module.map((m) => <span key={m} className={`sch-badge${m === 'd' || m === 'g' ? ' stark' : ''}`}>UPT {m}</span>)}
            {zeigtZaehne && <span className="sch-badge hell">{r.ctx.behandelt.length} Zähne</span>}
            {t.datumManuell && !extra && <span className="sch-badge hell">Datum von Hand</span>}
            {t.erbracht && <span className="sch-badge gruen">erbracht</span>}
          </div>
          {!offen && r.positionen.length > 0 && (
            <div className="pos-badges">
              {r.positionen.map((p) => {
                const auto = kachelVon(p.kachelId)?.auto
                return (
                  <span key={`${p.schluessel}-${p.menge}`} className={`pos-badge${auto ? ' auto' : ''}`} data-sys={p.sys}
                    title={`${p.titel} – ${euro(p.euro)}`}>
                    {kurzNr(p.sys, p.nr)}{p.menge > 1 && <small>×{p.menge}</small>}{auto && <i>★</i>}
                  </span>
                )
              })}
            </div>
          )}
        </div>
        <div className="ts-cockpit" onClick={(e) => e.stopPropagation()}>
          <label className="schalter klein" title="Termin erbracht"><input type="checkbox" checked={t.erbracht}
            onChange={(e) => onChange({ ...t, erbracht: e.target.checked })} /><span>erbracht</span></label>
          <button className="ts-chip" onClick={onUmschalten}>{offen ? 'Leistungen ▴' : 'Leistungen ▾'}</button>
          <span className="ts-total-badge">{euro(r.summe)}</span>
          {extra && <button className="ts-del" title="Termin löschen" onClick={onLoeschen}>×</button>}
        </div>
      </div>

      {fristen.map((f, i) => (
        <p key={i} className={`frist ${f.art}`}>
          {f.text}
          {f.fruehestens && (
            <button className="fix-btn" onClick={() => onChange({ ...t, datum: f.fruehestens!, datumManuell: true }, true)}>
              auf {datumDe(f.fruehestens)} schieben
            </button>
          )}
          {t.datumManuell && !extra && (
            <button className="fix-btn" onClick={() => onChange({ ...t, datumManuell: false }, true)}>automatisch planen</button>
          )}
        </p>
      ))}

      {offen && (
        <div className="ts-grid">
          <div className="ts-steps-area">
            {t.art === 'upt' && (
              <div className="module">
                <span className="feld-label">Module</span>
                {MODULE.map((m) => (
                  <button key={m} className={`modul${t.module.includes(m) ? ' an' : ''}`} disabled={t.erbracht}
                    onClick={() => onChange({ ...t, module: t.module.includes(m) ? t.module.filter((x) => x !== m) : [...t.module, m].sort() as UptModul[] })}>
                    {m}
                  </button>
                ))}
              </div>
            )}
            {zeigtZaehne && (
              <div className="termin-zaehne">
                <span className="feld-label">Zähne {t.zaehne ? '(von Hand)' : '(aus Befund)'}</span>
                <span className="zahnliste">{r.ctx.behandelt.join(' ') || '–'}</span>
                <button className="klein" onClick={() => setZaehneOffen(!zaehneOffen)}>{zaehneOffen ? 'fertig' : 'ändern'}</button>
                {t.zaehne && <button className="klein" onClick={() => onChange({ ...t, zaehne: null })}>aus Befund</button>}
                {zaehneOffen && (
                  <div className="zahn-chips">
                    {ALLE_ZAEHNE.map((z) => (
                      <button key={z} className={`zahn-chip${r.ctx.behandelt.includes(z) ? ' an' : ''}`} onClick={() => zahnUmschalten(z)}>{z}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="ts-steps-grid">
              {nachKategorie.map(([kat, liste]) => (
                <div key={kat} className="ts-gruppe">
                  <div className="ts-steps-subheading">{kat}</div>
                  {liste.map((s) => (
                    <Kachelknopf key={s.kachel.id} s={s} t={t} r={r} onKlick={() => klick(s.kachel, s.aktiv, s.auto)}
                      onRoentgen={(nr) => onChange({ ...t, roentgen: nr })} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="ts-billing">
            <div className="ts-regler-titel">Regler Termin</div>
            <Regler min={r.basis} max={r.potential} wert={r.summe} aus={t.erbracht}
              onChange={(v) => onChange(reglerTermin(fall, t, preise, v))} />
            <ul className="ts-list">
              {r.positionen.length === 0 && <li className="ts-empty">Links auf Leistungen klicken, um Positionen hinzuzufügen.</li>}
              {r.positionen.map((p) => {
                const s = kachelVon(p.kachelId)
                const naechster = FAKTOREN[(FAKTOREN.indexOf(p.faktor ?? 0) + 1) % FAKTOREN.length]
                return (
                  <li key={p.schluessel} className="ts-item" data-sys={p.sys} title={p.titel}>
                    <div className="ts-left">
                      <span className="ts-tag">{p.sys === 'ANALOG' ? 'GOZ analog' : p.sys}</span>
                      <span className="ts-code">{kurzNr(p.sys, p.nr)}</span>
                      <span className="ts-titel">{p.titel}</span>
                    </div>
                    <div className="ts-menge">
                      <input className="ts-num" type="number" min={0} max={99} value={p.menge} disabled={t.erbracht}
                        onChange={(e) => onChange({ ...t, mengen: { ...t.mengen, [p.schluessel]: Number(e.target.value) } })} />
                      {t.mengen[p.schluessel] != null && (
                        <button className="ts-reset" title="Menge wieder automatisch" onClick={() => {
                          const m = { ...t.mengen }; delete m[p.schluessel]; onChange({ ...t, mengen: m })
                        }}>↺</button>
                      )}
                    </div>
                    {p.faktor != null
                      ? <button className="ts-factor-toggle" title="Steigerungsfaktor" disabled={t.erbracht}
                        onClick={() => onChange({ ...t, faktoren: { ...t.faktoren, [p.schluessel]: naechster } })}>{zahlDe(p.faktor)}×</button>
                      : <span className="ts-punkte">{p.punkte * p.menge} P.</span>}
                    <div className="ts-sum">{euro(p.euro)}</div>
                    <button className="ts-del" title="Leistung abwählen" disabled={t.erbracht || !s}
                      onClick={() => s && klick(s.kachel, true, s.auto)}>×</button>
                  </li>
                )
              })}
            </ul>
            <div className="ts-sumbar">
              <span>Kasse {euro(r.kasse)}{r.privat > 0 && <> · privat {euro(r.privat)}</>}</span>
              <span className="ts-sum-val">{euro(r.summe)}</span>
            </div>
            <input className="bemerkung" type="text" placeholder="Bemerkung zum Termin" value={t.bemerkung}
              onChange={(e) => onChange({ ...t, bemerkung: e.target.value })} />
          </div>
        </div>
      )}
    </section>
  )
}

function Kachelknopf({ s, t, r, onKlick, onRoentgen }: {
  s: KachelStand; t: Termin; r: TerminRechnung; onKlick: () => void; onRoentgen: (nr: string) => void
}) {
  const k = s.kachel
  const gesperrt = !s.aktiv && !!s.konflikt
  const istRoentgen = k.id === 'roentgen'
  const autoNr = roentgenWahl(r.ctx.roentgen)
  const titel = [
    k.hinweis,
    gesperrt ? `nicht neben „${s.konflikt}"` : '',
    ...s.positionen.map((p) => `${p.sys} ${p.nr}: ${p.menge} × ${p.titel}`),
  ].filter(Boolean).join('\n')
  return (
    <div role="button" tabIndex={0}
      className={`ts-tile ${k.stufe}${s.aktiv ? ' active' : ''}${s.auto ? ' auto' : ''}${s.wert === 0 ? ' null' : ''}${gesperrt ? ' gesperrt' : ''}`}
      title={titel} onClick={onKlick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKlick() } }}>
      <span className="ts-tile-label">{s.auto && '★ '}{k.label}</span>
      <span className="ts-tile-wert">
        {euro(s.wert)}
        <small>{s.positionen.map((p) => `${p.menge}× ${p.nr}`).join(' · ')}</small>
      </span>
      {istRoentgen && (
        <select className="ts-tile-wahl" value={t.roentgen} disabled={t.erbracht}
          onClick={(e) => e.stopPropagation()} onChange={(e) => onRoentgen(e.target.value)}>
          <option value="">nach Befund{autoNr ? ` (${ROENTGEN_WAHL.find((w) => w.nr === autoNr)?.label.split(' ')[0]})` : ''}</option>
          {ROENTGEN_WAHL.map((w) => <option key={w.nr} value={w.nr}>{w.label}</option>)}
        </select>
      )}
    </div>
  )
}

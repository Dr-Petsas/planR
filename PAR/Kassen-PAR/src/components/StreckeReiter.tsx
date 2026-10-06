import { useMemo, useState } from 'react'
import type { Kachel } from '../data/kacheln'
import {
  reglerGesamt, reglerTermin, streckeRechnen, terminKontext, type Preise, type TerminRechnung,
} from '../engine/leistungen'
import { euro } from '../engine/strecke'
import {
  ART_LABEL, datumDe, fristenPruefen, terminePlanen, wochentag, type Fristmeldung,
} from '../engine/termine'
import { ALLE_ZAEHNE } from '../engine/zahnschema'
import type { DiagnoseErgebnis, ParFall, Planung, Termin, TerminArt, UptModul } from '../types'
import { Feld, Karte, Schalter, ZahlFeld } from './ui'

interface Props {
  fall: ParFall
  setFall: (f: ParFall) => void
  diag: DiagnoseErgebnis
  preise: Preise
}

const FAKTOREN = [1.0, 1.8, 2.3, 3.5]
const MODULE: UptModul[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g']

export default function StreckeReiter({ fall, setFall, diag, preise }: Props) {
  const neuPlanen = (f: ParFall) => setFall({ ...f, termine: terminePlanen(f, diag) })
  const setPlanung = (patch: Partial<Planung>) => neuPlanen({ ...fall, planung: { ...fall.planung, ...patch } })
  const p = fall.planung

  const summen = useMemo(() => streckeRechnen(fall, preise), [fall, preise])
  const fristen = useMemo(() => fristenPruefen(fall, diag), [fall, diag])

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
      auswahl: [], abgewaehlt: [], auto: [], mengen: {}, faktoren: {}, bemerkung: '',
    }
    setFall({ ...fall, termine: [...fall.termine, t].sort((a, b) => a.datum.localeCompare(b.datum)) })
  }

  const reglerZuruecksetzen = () => setFall({
    ...fall, zielGesamt: 0, termine: fall.termine.map((t) => (t.erbracht ? t : { ...t, auto: [] })),
  })

  return (
    <div className="reiter-inhalt">
      <Karte titel="Planung der Strecke" rechts={
        <button onClick={() => neuPlanen(fall)}>Termine neu berechnen</button>
      }>
        <div className="feld-raster">
          <Feld label="Befundaufnahme am">
            <input type="date" value={p.start} onChange={(e) => setPlanung({ start: e.target.value })} />
          </Feld>
          <ZahlFeld label="Tage bis ATG (Genehmigung)" value={p.genehmigungTage} min={0} max={120} onChange={(v) => setPlanung({ genehmigungTage: v })} />
          <Feld label="AIT-Sitzungen">
            <select value={p.aitSitzungen} onChange={(e) => setPlanung({ aitSitzungen: Number(e.target.value) as 1 | 2 | 4 })}>
              <option value={1}>1 Sitzung</option>
              <option value={2}>2 Sitzungen (OK / UK)</option>
              <option value={4}>4 Sitzungen (je Quadrant)</option>
            </select>
          </Feld>
          <ZahlFeld label="Abstand AIT-Sitzungen (Tage)" value={p.aitAbstandTage} min={1} max={60} onChange={(v) => setPlanung({ aitAbstandTage: v })} />
          <Feld label="Praxistage">
            <select value={p.werktage} onChange={(e) => setPlanung({ werktage: Number(e.target.value) as 5 | 6 })}>
              <option value={5}>Mo–Fr</option>
              <option value={6}>Mo–Sa</option>
            </select>
          </Feld>
          <ZahlFeld label="UPT-Verlängerung (Monate)" value={p.verlaengerungMonate} min={0} max={24} onChange={(v) => setPlanung({ verlaengerungMonate: v })} />
        </div>
        <div className="schalter-reihe">
          <Schalter label="private Vorbehandlung (PZR)" checked={p.mitPzr} onChange={(v) => setPlanung({ mitPzr: v })} />
          <Schalter label="CPT (offenes Vorgehen)" checked={fall.mitCPT} onChange={(v) => neuPlanen({ ...fall, mitCPT: v })} />
          {fall.mitCPT && (
            <select value={p.cptSitzungen} onChange={(e) => setPlanung({ cptSitzungen: Number(e.target.value) as 1 | 2 | 4 })}>
              <option value={1}>CPT in 1 Sitzung</option>
              <option value={2}>CPT OK / UK</option>
              <option value={4}>CPT je Quadrant</option>
            </select>
          )}
          <Schalter label="§ 22a SGB V (Anzeige 5e)" checked={p.par22a} onChange={(v) => setPlanung({ par22a: v })} />
          <Schalter label="Übernahmefall" checked={fall.uebernahmefall} onChange={(v) => neuPlanen({ ...fall, uebernahmefall: v })} />
          {fall.uebernahmefall && (
            <>
              <select value={p.einstieg} onChange={(e) => setPlanung({ einstieg: e.target.value as Planung['einstieg'] })}>
                <option value="komplett">Einstieg: komplett</option>
                <option value="ait">Einstieg: ab AIT</option>
                <option value="bev">Einstieg: ab BEV</option>
                <option value="upt">Einstieg: ab UPT</option>
              </select>
              {p.einstieg === 'upt' && (
                <label className="inline-feld">ab UPT Nr.
                  <input type="number" min={1} max={8} value={p.uptAb} onChange={(e) => setPlanung({ uptAb: Number(e.target.value) || 1 })} />
                </label>
              )}
            </>
          )}
        </div>
        {p.par22a && (
          <p className="hinweis-klein">§ 22a: angezeigt werden auf 5e nur 4, AIT a/b und CPT a/b (kein ATG, MHU, BEV).
            Die UPT-Folge (1. UPT nach 3 Monaten, dann alle 5 Monate) stammt aus dem Prototyp – vor der
            Abrechnung gegen die Behandlungsrichtlinie B V prüfen.</p>
        )}
        <p className="hinweis-klein">
          Grad {diag.grad}: UPT a/b/c/e/f {uptText(diag.grad)}. Verschobene oder erbrachte Termine behalten ihr Datum,
          alle folgenden werden ab dort neu gerechnet.
        </p>
      </Karte>

      <Karte titel="Umsatz der Strecke" rechts={
        <div className="knopf-reihe">
          <label className="schalter">
            <input type="checkbox" checked={fall.modus === 'bemaplus'}
              onChange={(e) => setFall({ ...fall, modus: e.target.checked ? 'bemaplus' : 'bema' })} />
            <span>BEMA + private Zusatzleistungen</span>
          </label>
          <button onClick={reglerZuruecksetzen}>Zurücksetzen</button>
        </div>
      }>
        <div className="summen">
          <div><span>Kasse</span><b>{euro(summen.kasse)}</b></div>
          <div><span>Privat</span><b>{euro(summen.privat)}</b></div>
          <div className="gross"><span>Gesamt geplant</span><b>{euro(summen.summe)}</b></div>
          <div><span>davon erbracht</span><b>{euro(summen.erbracht)}</b></div>
          <div><span>Möglich</span><b>{euro(summen.potential)}</b></div>
        </div>
        <ReglerZeile
          min={summen.basis} max={summen.potential} wert={summen.summe}
          onChange={(v) => setFall({ ...fall, zielGesamt: v, termine: reglerGesamt(fall, preise, v) })}
          label="Zielumsatz gesamt"
        />
        <p className="hinweis-klein">Der Gesamtregler verteilt den Zielumsatz reihum auf alle offenen Termine:
          erst Kassen-Begleitleistungen (Anästhesie, Röntgen, 108), dann private Zusatzleistungen, je Termin die
          wertvollste zuerst. Von Hand gewählte Leistungen bleiben, ★ = vom Regler gewählt.</p>
      </Karte>

      {fall.termine.length === 0 && (
        <Karte titel="Noch keine Termine"><button onClick={() => neuPlanen(fall)}>Strecke anlegen</button></Karte>
      )}

      {summen.je.map(({ termin, r }) => (
        <TerminKarte
          key={termin.id} fall={fall} termin={termin} r={r} preise={preise}
          fristen={fristen.filter((f) => f.terminId === termin.id)}
          onChange={setTermin}
          onLoeschen={() => setFall({ ...fall, termine: fall.termine.filter((x) => x.id !== termin.id) })}
        />
      ))}

      <div className="knopf-reihe">
        <span className="feld-label">Zusätzlichen Termin anlegen:</span>
        {(['kontrolle', 'nachbehandlung', 'upt', 'pzr'] as TerminArt[]).map((a) => (
          <button key={a} onClick={() => zusatzTermin(a)}>+ {ART_LABEL[a]}</button>
        ))}
      </div>
    </div>
  )
}

function uptText(g: 'A' | 'B' | 'C') {
  if (g === 'A') return '2× mit mind. 10 Monaten Abstand, UPT g einmal ab dem 10. Monat'
  if (g === 'B') return '4× mit mind. 5 Monaten, UPT d 2×, UPT g einmal'
  return '6× mit mind. 3 Monaten, UPT d 4×, UPT g einmal'
}

function ReglerZeile({ min, max, wert, onChange, label }: {
  min: number; max: number; wert: number; onChange: (v: number) => void; label: string
}) {
  const aus = max - min < 0.01
  return (
    <div className="regler">
      <span className="regler-label">{label}</span>
      <input type="range" min={Math.floor(min)} max={Math.ceil(max)} step={1} value={Math.round(wert)}
        disabled={aus} onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" className="regler-zahl" min={Math.floor(min)} max={Math.ceil(max)} step={1}
        value={Math.round(wert)} disabled={aus} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="regler-spanne">{euro(min)} – {euro(max)}</span>
    </div>
  )
}

function TerminKarte({ fall, termin: t, r, preise, fristen, onChange, onLoeschen }: {
  fall: ParFall; termin: Termin; r: TerminRechnung; preise: Preise; fristen: Fristmeldung[]
  onChange: (t: Termin, neuberechnen?: boolean) => void; onLoeschen: () => void
}) {
  const [zaehneOffen, setZaehneOffen] = useState(false)
  const [offen, setOffen] = useState(false)
  const extra = t.schluessel.startsWith('extra-')

  const klick = (k: Kachel, aktiv: boolean, auto: boolean) => {
    if (t.erbracht) return
    const ohne = (a: string[]) => a.filter((x) => x !== k.id)
    if (aktiv) {
      if (auto) onChange({ ...t, auto: ohne(t.auto), abgewaehlt: [...t.abgewaehlt, k.id] })
      else if (t.auswahl.includes(k.id)) onChange({ ...t, auswahl: ohne(t.auswahl) })
      else onChange({ ...t, abgewaehlt: [...t.abgewaehlt, k.id] })
    } else if (t.abgewaehlt.includes(k.id)) {
      onChange({ ...t, abgewaehlt: ohne(t.abgewaehlt), auswahl: k.standard ? t.auswahl : [...t.auswahl, k.id] })
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

  return (
    <section className={`karte termin${t.erbracht ? ' erbracht' : ''}${fristen.some((f) => f.art === 'fehler') ? ' fristfehler' : ''}`}>
      <div className="termin-kopf">
        <div className="termin-datum">
          <input type="date" value={t.datum} onChange={(e) => onChange({ ...t, datum: e.target.value, datumManuell: true }, true)} />
          <span className="wochentag">{wochentag(t.datum)}</span>
          {t.datumManuell && !extra && (
            <button className="klein" title="Datum wieder automatisch planen" onClick={() => onChange({ ...t, datumManuell: false }, true)}>auto</button>
          )}
        </div>
        <h3>{t.titel}</h3>
        <label className="schalter">
          <input type="checkbox" checked={t.erbracht} onChange={(e) => onChange({ ...t, erbracht: e.target.checked })} />
          <span>erbracht</span>
        </label>
        <span className="termin-summe">{euro(r.summe)}{r.privat > 0 && <small> (privat {euro(r.privat)})</small>}</span>
        <button className="klein" onClick={() => setOffen(!offen)}>{offen ? 'Positionen ▲' : 'Positionen ▼'}</button>
        {extra && <button className="klein gefahr" onClick={onLoeschen}>×</button>}
      </div>

      {fristen.map((f, i) => (
        <div key={i} className={`frist ${f.art}`}>
          {f.text}
          {f.fruehestens && (
            <button className="klein" onClick={() => onChange({ ...t, datum: f.fruehestens!, datumManuell: true }, true)}>
              auf {datumDe(f.fruehestens)} schieben
            </button>
          )}
        </div>
      ))}

      {t.art === 'upt' && (
        <div className="module">
          <span className="feld-label">UPT-Module:</span>
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
          <span className="feld-label">Zähne{t.zaehne ? ' (von Hand)' : ' (aus Befund)'}:</span>
          <span>{r.ctx.behandelt.join(' ') || '–'}</span>
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

      {r.kacheln.length > 0 && (
        <>
          <ReglerZeile
            label="Regler Termin" min={r.basis} max={r.potential} wert={r.summe}
            onChange={(v) => { if (!t.erbracht) onChange(reglerTermin(fall, t, preise, v)) }}
          />
          <div className="kacheln">
            {r.kacheln.map((s) => (
              <button key={s.kachel.id}
                className={`kachel ${s.kachel.stufe}${s.aktiv ? ' an' : ''}${s.auto ? ' auto' : ''}${s.wert === 0 ? ' null' : ''}`}
                title={[s.kachel.hinweis, ...s.positionen.map((p) => `${p.sys} ${p.nr}: ${p.menge} × ${p.titel}`)].filter(Boolean).join('\n')}
                onClick={() => klick(s.kachel, s.aktiv, s.auto)}>
                <span className="kachel-label">{s.auto && '★ '}{s.kachel.label}</span>
                <span className="kachel-wert">{euro(s.wert)}</span>
                <span className="kachel-nr">{s.positionen.map((p) => `${p.menge}× ${p.nr}`).join(' · ') || '–'}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {offen && (
        <table className="tabelle positionen">
          <thead><tr><th>System</th><th>Nr.</th><th>Leistung</th><th>Menge</th><th>Faktor</th><th>Punkte</th><th>Euro</th></tr></thead>
          <tbody>
            {r.positionen.map((p) => (
              <tr key={p.schluessel} className={p.privat ? 'privat' : ''}>
                <td>{p.sys}</td>
                <td>{p.nr}</td>
                <td className="titel">{p.titel}</td>
                <td>
                  <input type="number" min={0} max={99} value={p.menge}
                    onChange={(e) => onChange({ ...t, mengen: { ...t.mengen, [p.schluessel]: Number(e.target.value) } })} />
                  {t.mengen[p.schluessel] != null && (
                    <button className="klein" title="Menge wieder automatisch" onClick={() => {
                      const m = { ...t.mengen }; delete m[p.schluessel]; onChange({ ...t, mengen: m })
                    }}>↺</button>
                  )}
                </td>
                <td>
                  {p.faktor != null ? (
                    <select value={p.faktor} onChange={(e) => onChange({ ...t, faktoren: { ...t.faktoren, [p.schluessel]: Number(e.target.value) } })}>
                      {[...new Set([...FAKTOREN, p.faktor])].sort().map((f) => <option key={f} value={f}>{f.toFixed(1).replace('.', ',')}</option>)}
                    </select>
                  ) : '–'}
                </td>
                <td>{p.punkte * p.menge}</td>
                <td className="zahl">{euro(p.euro)}</td>
              </tr>
            ))}
            <tr className="summe"><td colSpan={5}>Summe ({r.punkteKasse} BEMA-Punkte)</td><td></td><td className="zahl">{euro(r.summe)}</td></tr>
          </tbody>
        </table>
      )}

      {offen && (
        <input className="bemerkung" type="text" placeholder="Bemerkung" value={t.bemerkung}
          onChange={(e) => onChange({ ...t, bemerkung: e.target.value })} />
      )}
    </section>
  )
}

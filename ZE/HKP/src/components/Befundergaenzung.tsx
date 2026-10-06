import { useState, type ReactNode } from 'react'
import type { Abformung, AbformungWahl, HkpPlan, KlinischeAngaben, Position } from '../types'
import { NACHTRAEGLICHE_LEISTUNGEN, nachtraeglichePositionen, nachtraeglicheVariante } from '../engine/nachtraeglich'
import { REPARATUR_ARTEN, reparaturArt } from '../engine/reparaturen'
import { ALLE_ZAEHNE } from '../engine/zahnschema'
import { neueId } from '../format'
import { ABUTMENTS, implantatZaehne } from '../engine/implantat'
import { ABFORMUNG_ARTEN, LOEFFEL, PROTHESE_ARTEN, implantatAbformung } from '../engine/abformung'
import { implantatsystem } from '../data/implantatsysteme'
import { ImplantatFelder } from './ImplantatAngaben'
import { relevanzErmitteln } from '../engine/relevanz'
import { WERKSTOFFE, kronenEinheiten, werkstoffVon } from '../engine/material'
import { laborVon } from '../engine/berechnung'
import { KronenmaterialFelder } from './Kronenmaterial'

interface Props {
  plan: HkpPlan
  setPlan: (f: (p: HkpPlan) => HkpPlan) => void
}

const ABFORMUNG_TEXT: Record<Abformung, string> = { scan: 'Intraoralscan', abdruck: 'Abdruck', '': 'noch offen' }

const zahnListe = (t: string) => [...new Set(t.split(/[^0-9]+/).filter((z) => ALLE_ZAEHNE.includes(z)))]

function ZahnFeld({ titel, befund, info, wert, onChange }: { titel: string; befund: string; info: string; wert: string[]; onChange: (z: string[]) => void }) {
  return (
    <label className="be-feld" title={`Befund ${befund}: ${info}`}>
      <b className="be-nr">{befund}</b><span>{titel}</span>
      <input
        key={wert.join(',')} defaultValue={wert.join(', ')} placeholder="Zähne"
        onBlur={(e) => onChange(zahnListe(e.target.value))}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}

function NachtraeglicheLeistungen({ plan, setPlan, spaeter }: Props & { spaeter: Position[] }) {
  const [art, setArt] = useState(NACHTRAEGLICHE_LEISTUNGEN[0].id)
  const [zahn, setZahn] = useState('')
  const leistung = NACHTRAEGLICHE_LEISTUNGEN.find((l) => l.id === art)!
  const variante = nachtraeglicheVariante(leistung, plan, zahn)
  const titelVon = (p: Position) =>
    NACHTRAEGLICHE_LEISTUNGEN.find((l) => [...(l.bema ?? []), ...l.goz].some((t) => t.ebene === p.ebene && t.nr === p.nr))?.titel ?? ''
  const hinzufuegen = () => {
    if (!zahn.trim()) return
    setPlan((p) => ({ ...p, positionen: [...p.positionen, ...nachtraeglichePositionen(art, zahn.trim(), p)] }))
    setZahn('')
  }
  const entfernen = (id: string) => setPlan((p) => ({ ...p, positionen: p.positionen.filter((x) => x.id !== id) }))

  return (
    <div className="be-karte">
      <h4 title="Während der Behandlung angefallen – je Zahn, BEMA bei Kassenversorgung, sonst GOZ. Wirkt sofort.">Nachträgliche Leistungen</h4>
      {spaeter.length > 0 && (
        <table className="tabelle be-reps">
          <thead><tr><th style={{ width: '10ch' }}>Zahn</th><th style={{ width: '12ch' }}>Nr.</th><th>Leistung</th><th /></tr></thead>
          <tbody>
            {spaeter.map((p) => (
              <tr key={p.id}>
                <td>{p.zahn}</td>
                <td><b>{p.ebene} {p.nr}</b></td>
                <td>{titelVon(p)}</td>
                <td><button className="x-btn" title="Entfernen" onClick={() => entfernen(p.id)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="be-nachtrag">
        <select value={art} onChange={(e) => setArt(e.target.value)}>
          {NACHTRAEGLICHE_LEISTUNGEN.map((l) => <option key={l.id} value={l.id}>{l.titel}</option>)}
        </select>
        <input
          value={zahn} placeholder="Zahn, z. B. 14" title="Zahn bzw. Gebiet"
          onChange={(e) => setZahn(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') hinzufuegen() }}
        />
        <button className="klein-btn" disabled={!zahn.trim()} onClick={hinzufuegen}>
          + {variante.map((t) => `${t.ebene} ${t.nr}`).join(' + ')}
        </button>
      </div>
      {leistung.hinweis && <p className="be-hinweis">{leistung.hinweis}</p>}
    </div>
  )
}

export function Befundergaenzung({ plan, setPlan, onAbformung }: Props & { onAbformung: (a: AbformungWahl) => void }) {
  const k = plan.klinisch
  const setK = <F extends keyof KlinischeAngaben>(f: F, v: KlinischeAngaben[F]) =>
    setPlan((p) => ({ ...p, klinisch: { ...p.klinisch, [f]: v } }))
  const schalter = (f: keyof KlinischeAngaben, text: string) => (
    <button className={`be-schalter${k[f] ? ' aktiv' : ''}`} aria-pressed={Boolean(k[f])} onClick={() => setK(f, !k[f] as never)}>{text}</button>
  )
  const kieferZeile = (befund: string, titel: string, info: string, schalterListe: ReactNode) => (
    <div className="be-feld" title={`Befund ${befund}: ${info}`}>
      <b className="be-nr">{befund}</b><span>{titel}</span><span className="be-schalter-gruppe">{schalterListe}</span>
    </div>
  )
  const reps = plan.reparaturen
  const setReps = (f: (r: HkpPlan['reparaturen']) => HkpPlan['reparaturen']) => setPlan((p) => ({ ...p, reparaturen: f(p.reparaturen) }))
  const spaeter = plan.positionen.filter((p) => p.nachtraeglich && !p.auto)
  const anzahl = k.stiftKonfektioniert.length + k.stiftGegossen.length + k.stiftAdhaesiv.length + k.disparallel.length
    + [k.metallbasisOK, k.metallbasisUK, k.stuetzstift, k.atrophieOK, k.atrophieUK].filter(Boolean).length + reps.length + spaeter.length
  const imp = implantatZaehne(plan.zaehne)
  const rel = relevanzErmitteln(plan.zaehne)
  /** Kiefer, für die eine Kieferangabe abgefragt wird – passende Kiefer plus bereits gesetzte */
  const kieferFuer = (passend: ('OK' | 'UK')[], ok: keyof KlinischeAngaben, uk: keyof KlinischeAngaben) =>
    (['OK', 'UK'] as const).filter((x) => passend.includes(x) || k[x === 'OK' ? ok : uk])
  const kieferSchalter = (kiefer: ('OK' | 'UK')[], ok: keyof KlinischeAngaben, uk: keyof KlinischeAngaben) =>
    <>{kiefer.map((x) => <span key={x}>{schalter(x === 'OK' ? ok : uk, x)}</span>)}</>
  const zeigeStifte = rel.kronen.length > 0 || [k.stiftKonfektioniert, k.stiftGegossen, k.stiftAdhaesiv, k.stiftNachtraeglich].some((l) => l.length)
  const zeigeDisparallel = rel.pfeiler.length > 0 || k.disparallel.length > 0
  const zeigeProtheseAbformung = rel.prothese.length > 0 || !!plan.abformungProthese
  const metallKiefer = kieferFuer(rel.deckprothese, 'metallbasisOK', 'metallbasisUK')
  const atrophieKiefer = kieferFuer(rel.zahnlos, 'atrophieOK', 'atrophieUK')
  const zeigeStuetzstift = rel.prothese.length > 0 || k.stuetzstift
  const zeigeKiefer = metallKiefer.length > 0 || atrophieKiefer.length > 0 || zeigeStuetzstift
  const passtNicht = (passend: boolean) => (passend ? '' : ' be-unpassend')
  const einheiten = kronenEinheiten(plan.positionen.map((p) => ({ zahn: p.zahn, ebene: p.ebene, nr: p.nr, labor: laborVon(p, plan) })))
  const materialOffen = einheiten.filter((e) => !werkstoffVon(e, plan.werkstoffe).gewaehlt).length
  const materialKurz = [...new Set(einheiten.map((e) => WERKSTOFFE[werkstoffVon(e, plan.werkstoffe).werkstoff].kurz))].join('/')
  const ausPlanung = [
    rel.kronen.length && `Kronen ${rel.kronen.join(', ')}`,
    rel.pfeiler.length && `Pfeiler ${rel.pfeiler.join(', ')}`,
    rel.prothese.length && `herausnehmbar ${rel.prothese.join(', ')}`,
    rel.zahnlos.length && `zahnlos ${rel.zahnlos.join(', ')}`,
    imp.length && `Implantat ${imp.join(', ')}`,
  ].filter(Boolean).join(' · ')
  const kurz = [
    `Abformung: ${ABFORMUNG_TEXT[plan.abformung]}${plan.abformungProthese ? `, Prothese ${ABFORMUNG_TEXT[plan.abformungProthese]}` : ''}`,
    einheiten.length && `Material: ${materialOffen ? `${materialOffen} offen` : materialKurz}`,
    k.stiftKonfektioniert.length && `1.4: ${k.stiftKonfektioniert.join(', ')}`,
    k.stiftAdhaesiv.length && `1.4 Glasfaser: ${k.stiftAdhaesiv.join(', ')}`,
    k.stiftGegossen.length && `1.5: ${k.stiftGegossen.join(', ')}`,
    k.stiftNachtraeglich.length && `Stift nachträglich: ${k.stiftNachtraeglich.join(', ')}`,
    k.disparallel.length && `2.6: ${k.disparallel.join(', ')}`,
    (k.metallbasisOK || k.metallbasisUK) && `4.5: ${[k.metallbasisOK && 'OK', k.metallbasisUK && 'UK'].filter(Boolean).join(', ')}`,
    k.stuetzstift && '4.9',
    (k.atrophieOK || k.atrophieUK) && `7.6: ${[k.atrophieOK && 'OK', k.atrophieUK && 'UK'].filter(Boolean).join(', ')}`,
    ...reps.map((r) => `${r.art.replace(/-.*/, '')}${r.gebiet ? `: ${r.gebiet}` : ''}`),
    ...spaeter.map((p) => `${p.ebene} ${p.nr} (${p.zahn})`),
    imp.length && `Implantat ${imp.join(', ')}: ${[
      plan.abformung === 'abdruck' && LOEFFEL.find((l) => l.id === implantatAbformung(plan))?.titel,
      ABUTMENTS.find((a) => a.id === plan.implantat.abutment)?.titel,
      implantatsystem(plan.implantat.system).system,
    ].filter(Boolean).join(' · ')}`,
  ].filter(Boolean).join(' · ')

  return (
    <details className="befundergaenzung bildschirm">
      <summary>
        Klinische Angaben &amp; Wiederherstellungen {anzahl > 0 && <span className="be-zahl">{anzahl}</span>}
        <small>{kurz || 'Stift, Metallbasis, Stützstift, Reparaturen, nachträgliche Leistungen – nur bei Bedarf'}</small>
      </summary>

      <p className="be-planung">
        <b>{rel.geplant ? 'Aus der Planung:' : 'Noch keine Planung – abgeschätzt aus Zeile B:'}</b>{' '}
        {ausPlanung || 'nichts, was weitere Angaben braucht'}
        <small> – eingeblendet wird nur, was dazu passt.</small>
      </p>

      <div className="be-raster">
        {(zeigeStifte || zeigeDisparallel) && (
        <div className="be-karte">
          <h4>Stift &amp; Pfeiler <small>{[rel.kronen.length && `Kronen ${rel.kronen.join(', ')}`, rel.pfeiler.length && `Pfeiler ${rel.pfeiler.join(', ')}`].filter(Boolean).join(' · ')}</small></h4>
          {zeigeStifte && (
            <div className={`be-gruppe${passtNicht(rel.kronen.length > 0)}`}>
              <ZahnFeld befund="1.4" titel="Stift konfektioniert" info="Stiftaufbau konfektioniert (endodontisch behandelt)" wert={k.stiftKonfektioniert} onChange={(z) => setK('stiftKonfektioniert', z)} />
              <ZahnFeld befund="1.5" titel="Stift gegossen" info="Stiftaufbau gegossen (endodontisch behandelt)" wert={k.stiftGegossen} onChange={(z) => setK('stiftGegossen', z)} />
              <ZahnFeld befund="1.4" titel="Glasfaserstift adhäsiv" info="Glasfaser-/Keramikstift adhäsiv (gleichartig: GOZ 2180, 2195, 2197)" wert={k.stiftAdhaesiv} onChange={(z) => setK('stiftAdhaesiv', z)} />
              <ZahnFeld befund="1.4/5" titel="Stift nachträglich" info="davon nachträglich angefallen (nach Bewilligung, ohne neue Genehmigung)" wert={k.stiftNachtraeglich} onChange={(z) => setK('stiftNachtraeglich', z)} />
            </div>
          )}
          {zeigeDisparallel && (
            <div className={`be-gruppe${passtNicht(rel.pfeiler.length > 0)}`}>
              <ZahnFeld befund="2.6" titel="Disparallele Pfeiler" info="Disparallele Pfeilerzähne (Brückenanker, Teleskope)" wert={k.disparallel} onChange={(z) => setK('disparallel', z)} />
            </div>
          )}
        </div>
        )}
        {(einheiten.length > 0 || rel.kronen.length > 0) && (
        <div className="be-karte be-material">
          <h4 title="Legierung bzw. Keramik je Einheit – wird mit mittleren Marktpreisen berechnet. Wirkt sofort.">
            Kronenmaterial {materialOffen > 0 && <i className="be-offen">{materialOffen} offen</i>}
          </h4>
          {einheiten.length
            ? <KronenmaterialFelder einheiten={einheiten} wahl={plan.werkstoffe} onChange={(w) => setPlan((p) => ({ ...p, werkstoffe: w }))} />
            : <p className="be-hinweis">Die Einheiten erscheinen nach „HKP berechnen“.</p>}
        </div>
        )}
        <div className="be-spalte">
        <div className="be-karte">
          <h4 title="Gilt für den ganzen Plan – ändert GOZ 0065, die Modelle und ggf. den Überabdruck">
            Abformung {!plan.abformung && <i className="be-offen">noch offen</i>}
          </h4>
          {([
            ['abformung', '1.', 'Zähne / Primärkronen', ABFORMUNG_ARTEN],
            ['abformungProthese', '2.', 'Herausnehmbarer Teil', PROTHESE_ARTEN],
          ] as const).filter(([feld]) => feld === 'abformung' || zeigeProtheseAbformung).map(([feld, nr, titel, arten]) => (
            <div key={feld} className={`be-feld be-feld-breit${feld === 'abformungProthese' ? passtNicht(rel.prothese.length > 0) : ''}`}>
              <b className="be-nr">{nr}</b>
              <span>{titel}{feld === 'abformungProthese' && rel.prothese.length > 0 && <small className="be-klein"> – {rel.prothese.join(', ')}</small>}</span>
              <span className="be-schalter-gruppe">
                {arten.map((a) => (
                  <button
                    key={a.id} title={a.text} aria-pressed={plan[feld] === a.id}
                    className={`be-schalter${plan[feld] === a.id ? ' aktiv' : ''}`}
                    onClick={() => onAbformung({ [feld]: plan[feld] === a.id && feld === 'abformungProthese' ? '' : a.id })}
                  >{a.id === 'scan' ? 'Intraoralscan' : 'Abdruck'}</button>
                ))}
              </span>
            </div>
          ))}
        </div>
        {zeigeKiefer && (
        <div className="be-karte">
          <h4>Prothese / Kiefer</h4>
          {metallKiefer.length > 0 && <div className={passtNicht(rel.deckprothese.length > 0).trim()}>{kieferZeile('4.5', 'Metallbasis', 'Metallbasis notwendig (Total-/Deckprothese)', kieferSchalter(metallKiefer, 'metallbasisOK', 'metallbasisUK'))}</div>}
          {atrophieKiefer.length > 0 && <div className={passtNicht(rel.zahnlos.length > 0).trim()}>{kieferZeile('7.6', 'Atrophie zahnlos', 'Atrophierter zahnloser Kiefer (Nr. 36)', kieferSchalter(atrophieKiefer, 'atrophieOK', 'atrophieUK'))}</div>}
          {zeigeStuetzstift && <div className={passtNicht(rel.prothese.length > 0).trim()}>{kieferZeile('4.9', 'Stützstiftregistrierung', 'Stützstiftregistrierung bei schwieriger Kieferrelation', schalter('stuetzstift', 'ja'))}</div>}
        </div>
        )}
        </div>
        {imp.length > 0 && (
        <div className="be-karte be-implantat">
          <h4>Implantat <small>Zahn {imp.join(', ')}</small></h4>
          <ImplantatFelder wert={plan.implantat} abformung={plan.abformung} onChange={(a) => setPlan((p) => ({ ...p, implantat: a }))} />
        </div>
        )}
      </div>

      <div className="be-raster be-raster-unten">
      <div className="be-karte">
        <h4 title="Befundklasse 6, 7.3, 7.4, 7.7 – Zeile B bleibt dafür leer. Wirkt nach „HKP berechnen“.">Wiederherstellung / Erweiterung</h4>
        {reps.length > 0 && (
          <table className="tabelle be-reps">
            <thead><tr><th>Befund</th><th>Maßnahme</th><th style={{ width: '16ch' }}>Gebiet</th><th /></tr></thead>
            <tbody>
              {reps.map((r) => {
                const art = reparaturArt(r.art)
                return (
                  <tr key={r.id}>
                    <td><b>{r.art.replace(/-.*/, '')}</b></td>
                    <td>
                      <select value={r.art} onChange={(e) => setReps((rs) => rs.map((x) => (x.id === r.id ? { ...x, art: e.target.value } : x)))}>
                        {(['Prothese', 'Festsitzend', 'Implantat'] as const).map((g) => (
                          <optgroup key={g} label={g}>
                            {REPARATUR_ARTEN.filter((a) => a.gruppe === g).map((a) => <option key={a.id} value={a.id}>{a.id.replace(/-.*/, '')} · {a.titel}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={r.gebiet} placeholder={art?.je === 'kiefer' ? 'OK / UK' : 'Zähne, z. B. 14, 15'}
                        onChange={(e) => setReps((rs) => rs.map((x) => (x.id === r.id ? { ...x, gebiet: e.target.value } : x)))}
                      />
                    </td>
                    <td><button className="x-btn" title="Entfernen" onClick={() => setReps((rs) => rs.filter((x) => x.id !== r.id))}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <button className="klein-btn" onClick={() => setReps((rs) => [...rs, { id: neueId(), art: '6.2', gebiet: '' }])}>+ Wiederherstellung</button>
      </div>

      <NachtraeglicheLeistungen plan={plan} setPlan={setPlan} spaeter={spaeter} />
      </div>
    </details>
  )
}

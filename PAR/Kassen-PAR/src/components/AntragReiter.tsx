import { useState } from 'react'
import { diagnoseText, kaIndexKlasse } from '../engine/diagnose'
import { leistungsblock } from '../engine/strecke'
import { datumDe } from '../engine/termine'
import { heute, id, leererBefund } from '../store'
import type {
  Anamnese, Befund, BefundPhase, Diagnose, DiagnoseErgebnis, Einstellungen, Gutachten, KkEntscheidung, Kassenart, ParFall,
} from '../types'
import { Blatt2Chart } from './Blatt2Chart'
import { Antragsbox, Fi, Seite, Unterschrift, Versichertenfeld, X } from './Formteile'

const PHASE_LABEL: Record<BefundPhase, string> = {
  initial: 'Initialbefund', beva: 'BEV a', bevb: 'BEV b', upt: 'UPT g / Kontrolle',
}

interface Props {
  fall: ParFall; setFall: (f: ParFall) => void; einst: Einstellungen; setEinst: (e: Einstellungen) => void; diag: DiagnoseErgebnis
}

export default function AntragReiter({ fall, setFall, einst, setEinst, diag }: Props) {
  const [befundId, setBefundId] = useState(fall.befunde[0]?.id ?? '')
  const befund = fall.befunde.find((b) => b.id === befundId) ?? fall.befunde[0]
  const setBefund = (b: Befund) => setFall({ ...fall, befunde: fall.befunde.map((x) => (x.id === b.id ? b : x)) })

  /** BEV a/b gibt es je einmal, UPT g einmal je Tag: vorhandene werden nur ausgewaehlt. */
  const vorhanden = (phase: BefundPhase) =>
    fall.befunde.find((b) => b.phase === phase && (phase !== 'upt' || b.datum === heute()))
  const neuerBefund = (phase: BefundPhase) => {
    const da = vorhanden(phase)
    if (da) { setBefundId(da.id); return }
    const b: Befund = { ...structuredClone(befund), id: id(), phase, datum: heute(), bezeichnung: PHASE_LABEL[phase] }
    for (const z of Object.values(b.zaehne)) { z.st = z.st.map(() => null); z.bop = z.bop.map(() => false); z.aitOverride = null }
    setFall({ ...fall, befunde: [...fall.befunde, b] })
    setBefundId(b.id)
  }
  const befundLoeschen = () => {
    if (fall.befunde.length <= 1 || !confirm(`Befund „${befund.bezeichnung}" löschen?`)) return
    const rest = fall.befunde.filter((x) => x.id !== befund.id)
    setFall({ ...fall, befunde: rest.length ? rest : [leererBefund()] })
    setBefundId(rest[0]?.id ?? '')
  }

  const p = fall.patient
  return (
    <div className="antrag">
      <div className="antrag-leiste keindruck">
        <div className="leiste-gruppe">
          <span className="leiste-titel">Kassenart</span>
          <select value={p.kassenart} onChange={(e) => setFall({ ...fall, patient: { ...p, kassenart: e.target.value as Kassenart } })}>
            <option value="primaer">Primärkasse (AOK, BKK, IKK, LKK, KBS)</option>
            <option value="ersatz">Ersatzkasse (vdek)</option>
          </select>
        </div>
        <label className="schalter"><input type="checkbox" checked={fall.mitCPT} onChange={(e) => setFall({ ...fall, mitCPT: e.target.checked })} /><span>CPT vorgesehen</span></label>
        <label className="schalter"><input type="checkbox" checked={fall.uebernahmefall} onChange={(e) => setFall({ ...fall, uebernahmefall: e.target.checked })} /><span>Übernahmefall</span></label>
        <span className="leiste-diag">{diagnoseText(diag)}</span>
      </div>

      <Blatt1 fall={fall} setFall={setFall} einst={einst} setEinst={setEinst} diag={diag} />

      <div className="befund-leiste keindruck">
        <span className="leiste-titel">Blatt 2 zeigt:</span>
        {fall.befunde.map((b) => (
          <button key={b.id} className={`befund-chip${b.id === befund.id ? ' aktiv' : ''}`} onClick={() => setBefundId(b.id)}>
            <b>{b.bezeichnung}</b><span>{datumDe(b.datum)}</span>
          </button>
        ))}
        {!vorhanden('beva') && <button onClick={() => neuerBefund('beva')}>+ BEV a</button>}
        {!vorhanden('bevb') && <button onClick={() => neuerBefund('bevb')}>+ BEV b</button>}
        {!vorhanden('upt') && <button onClick={() => neuerBefund('upt')}>+ UPT g</button>}
        {fall.befunde.length > 1 && <button className="gefahr" onClick={befundLoeschen}>Befund löschen</button>}
        <span className="leiste-hilfe">Neue Befunde übernehmen ZS, FB und Lockerung, die Messwerte bleiben leer.</span>
      </div>

      <Blatt2 fall={fall} setFall={setFall} einst={einst} setEinst={setEinst} befund={befund} setBefund={setBefund} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Blatt 1
// ---------------------------------------------------------------------------

function Blatt1({ fall, setFall, einst, setEinst, diag }: Props) {
  const d = fall.diagnose
  const an = fall.anamnese
  const setD = (patch: Partial<Diagnose>) => setFall({ ...fall, diagnose: { ...d, ...patch } })
  const setAn = (patch: Partial<Anamnese>) => setFall({ ...fall, anamnese: { ...an, ...patch } })
  const zahl = (v: string) => (v === '' ? 0 : Number(v))
  const s = diag.stadium
  const ka = d.knochenabbauProzent
  const cal = d.calMax
  const komplex = d.st6plus || d.vertikalerKA3 || d.furkationII_III
  const st5 = d.st5horizontal ?? (diag.stadium === 2 && !komplex)
  const kaKlasse = kaIndexKlasse(d)
  /** Kreuz in einem Wertebereich: setzt einen typischen Wert bzw. leert ihn wieder. */
  const kaKreuz = (von: number, bis: number, wert: number) => () =>
    setD({ knochenabbauProzent: ka >= von && ka <= bis ? 0 : wert })
  const calKreuz = (von: number, bis: number, wert: number) => () =>
    setD({ calMax: cal >= von && cal <= bis ? 0 : wert })
  const ausmassKreuz = (a: 'lokalisiert' | 'generalisiert') => () =>
    setD({ ausmassManuell: d.ausmassManuell === a ? null : a, mipMuster: false })
  const indexKreuz = (k: 'A' | 'B' | 'C') => () => setD({ kaIndexManuell: d.kaIndexManuell === k ? null : k })
  const kk = (e: KkEntscheidung) => setFall({ ...fall, kkEntscheidung: fall.kkEntscheidung === e ? 'offen' : e })
  const initial = fall.befunde.find((b) => b.phase === 'initial') ?? fall.befunde[0]
  const setInitialDatum = (v: string) =>
    setFall({ ...fall, befunde: fall.befunde.map((b) => (b.id === initial.id ? { ...b, datum: v } : b)) })

  return (
    <Seite titel={<h1>PARODONTALSTATUS <small>Blatt 1</small></h1>}>
      <div className="a4-kopf">
        <Versichertenfeld fall={fall} einst={einst} setFall={setFall} setEinst={setEinst} />
        <div className="a4-kopf-rechts">
          <div className="vom">vom <Fi type="date" value={initial.datum} onChange={setInitialDatum} /></div>
          <Antragsbox a={fall.antrag} set={(patch) => setFall({ ...fall, antrag: { ...fall.antrag, ...patch } })} />
        </div>
      </div>

      <div className="b1-block zwei">
        <div>
          <h4>Allgemeine und parodontitisspezifische Anamnese</h4>
          <div className="b1-raster">
            <span className="b1-option"><X an={an.diabetesMellitus} onClick={() => setAn({ diabetesMellitus: !an.diabetesMellitus })} /> Diabetes mellitus</span>
            <span className="b1-option">
              <X an={an.sonstigesAn} onClick={() => setAn({ sonstigesAn: !an.sonstigesAn })} /> Sonstiges
              <Fi value={an.sonstiges} breite="34mm" placeholder="welche?"
                onChange={(v) => setAn({ sonstiges: v, sonstigesAn: an.sonstigesAn || !!v.trim() })} />
            </span>
            <span className="b1-option"><X an={an.tabakkonsum} onClick={() => setAn({ tabakkonsum: !an.tabakkonsum })} /> Tabakkonsum</span>
          </div>
        </div>
        <div>
          <h4>Spezielle Vorgeschichte</h4>
          <div><span className="b1-option"><X an={an.fruehereParTherapie} onClick={() => setAn({ fruehereParTherapie: !an.fruehereParTherapie })} /> Frühere PAR-Therapie</span>
            Angabe des Jahres: ca.{' '}
            <Fi value={an.fruehereParJahr} breite="18mm"
              onChange={(v) => setAn({ fruehereParJahr: v, fruehereParTherapie: an.fruehereParTherapie || !!v.trim() })} />
          </div>
        </div>
      </div>

      <div className="b1-block diagnose">
        <h4>Diagnose</h4>
        <div className="b1-option"><X an={d.diagnoseTyp === 'parodontitis'} onClick={() => setD({ diagnoseTyp: 'parodontitis' })} /> Parodontitis</div>
        <div className="b1-option"><X an={d.diagnoseTyp === 'sonstige_vergroesserung'} onClick={() => setD({ diagnoseTyp: 'sonstige_vergroesserung' })} />
          Andere das Parodont betreffende Zustände: generalisierte gingivale Vergrößerungen</div>
        <div className="b1-option"><X an={d.diagnoseTyp === 'systemisch'} onClick={() => setD({ diagnoseTyp: 'systemisch' })} />
          Parodontitis als Manifestation systemischer Erkrankungen</div>
      </div>

      <div className="b1-block">
        <h4>Stadium <small>(Schweregrad, der Patient wird durch das höchste Stadium charakterisiert)</small></h4>
        <table className="b1-tab">
          <tbody>
            <tr><td>{d.stadiumManuell && <button className="klein keindruck" onClick={() => setD({ stadiumManuell: null })}>Stadium automatisch</button>}</td>
              {([1, 2, 3, 4] as const).map((i) => <td key={i}><X an={s === i} title="Stadium von Hand setzen (nochmal klicken = automatisch)"
                onClick={() => setD({ stadiumManuell: d.stadiumManuell === i ? null : i })} /> <b>Stadium {['I', 'II', 'III', 'IV'][i - 1]}</b></td>)}</tr>
            <tr>
              <td>Röntg. Knochenabbau (KA)<br />(oder interdentaler CAL)
                <span className="ein keindruck">
                  KA <input type="number" min={0} max={100} value={ka || ''} onChange={(e) => setD({ knochenabbauProzent: zahl(e.target.value) })} /> %
                  am <input type="text" value={d.knochenabbauZahn} onChange={(e) => setD({ knochenabbauZahn: e.target.value })} />
                  CAL <input type="number" min={0} max={20} value={cal || ''} onChange={(e) => setD({ calMax: zahl(e.target.value) })} /> mm
                </span>
              </td>
              <td><X an={ka > 0 && ka < 15} onClick={kaKreuz(1, 14, 10)} /> &lt; 15 %<br /><X an={cal >= 1 && cal <= 2} onClick={calKreuz(1, 2, 2)} /> (1 – 2 mm)</td>
              <td><X an={ka >= 15 && ka <= 33} onClick={kaKreuz(15, 33, 25)} /> 15 - 33 %<br /><X an={cal >= 3 && cal <= 4} onClick={calKreuz(3, 4, 4)} /> (3 – 4 mm)</td>
              <td colSpan={2} className="rechts"><X an={ka > 33} onClick={kaKreuz(34, 100, 40)} /> &gt; 33 %<br /><X an={cal >= 5} onClick={calKreuz(5, 20, 5)} /> (≥5 mm)</td>
            </tr>
            <tr>
              <td>Zahnverlust aufgrund von Parodontitis
                <span className="ein keindruck">
                  <input type="number" min={0} max={32} value={d.zahnverlustPar} onChange={(e) => setD({ zahnverlustPar: zahl(e.target.value) })} /> Zähne
                </span>
              </td>
              <td></td>
              <td><X an={d.zahnverlustPar === 0} onClick={() => setD({ zahnverlustPar: 0 })} /> Nein</td>
              <td><X an={d.zahnverlustPar >= 1 && d.zahnverlustPar <= 4}
                onClick={() => setD({ zahnverlustPar: d.zahnverlustPar >= 1 && d.zahnverlustPar <= 4 ? 0 : 1 })} /> ≤ 4 Zähne</td>
              <td><X an={d.zahnverlustPar >= 5} onClick={() => setD({ zahnverlustPar: d.zahnverlustPar >= 5 ? 0 : 5 })} /> ≥ 5 Zähne</td>
            </tr>
            <tr>
              <td>Komplexitätsfaktoren (anzukreuzen, auch wenn nur ein Faktor aus der jeweiligen Gruppe vorliegt)</td>
              <td></td>
              <td><X an={st5} onClick={() => setD(st5
                ? { st5horizontal: false }
                : { st5horizontal: true, st6plus: false, vertikalerKA3: false, furkationII_III: false })} /> ST = 5 mm, vorwiegend horizontaler KA</td>
              <td><X an={komplex} onClick={() => setD({ st6plus: !komplex, vertikalerKA3: false, furkationII_III: false, ...(komplex ? {} : { st5horizontal: false }) })}
                title="ST ≥ 6 mm, vertikaler KA ≥ 3 mm oder FB Grad II/III" /> ST ≥ 6 mm, vertikaler KA ≥ 3 mm, FB Grad II oder III</td>
              <td><X an={d.komplexeReha} onClick={() => setD({ komplexeReha: !d.komplexeReha })} /> Komplexe Rehabilitation wegen mastikatorischer Dysfunktion erforderlich</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="b1-block">
        <h4>Ausmaß/Verteilung <small>(für das höchste Stadium)</small></h4>
        <div className="b1-reihe">
          <X an={diag.ausmass === 'lokalisiert'} onClick={ausmassKreuz('lokalisiert')} /> Lokalisiert (&lt; 30 % der Zähne)
          <X an={diag.ausmass === 'generalisiert'} onClick={ausmassKreuz('generalisiert')} /> Generalisiert (≥30 % der Zähne)
          <X an={diag.ausmass === 'molaren-inzisiven'} onClick={() => setD({ mipMuster: !d.mipMuster })} /> Molaren-Inzisiven-Muster
          <span className="ein keindruck">aus Blatt 2: {diag.befalleneZaehne} von {diag.gesamtZaehne} Zähnen ({diag.anteilProzent} %)
            {d.ausmassManuell && <button className="klein" onClick={() => setD({ ausmassManuell: null })}>automatisch</button>}</span>
        </div>
      </div>

      <div className="b1-block">
        <table className="b1-tab">
          <tbody>
            <tr><td><h4>Grad <small>(Progression)</small></h4>
              {d.gradManuell && <button className="klein keindruck" onClick={() => setD({ gradManuell: null })}>Grad automatisch</button>}</td>
              {(['A', 'B', 'C'] as const).map((g) => <td key={g}><X an={diag.grad === g} title="Grad von Hand setzen (nochmal klicken = automatisch)"
                onClick={() => setD({ gradManuell: d.gradManuell === g ? null : g })} /> <b>Grad {g}</b></td>)}</tr>
            <tr><td>Knochenabbauindex (KA (%)/Alter)
              <span className="ein keindruck">
                Alter <input type="number" min={0} max={120} value={d.alter || ''} onChange={(e) => setD({ alter: zahl(e.target.value) })} />
                {d.alter > 0 && ka > 0 && <> = {diag.kaIndex.toFixed(2).replace('.', ',')}</>}
              </span></td>
              <td><X an={kaKlasse === 'A'} onClick={indexKreuz('A')} /> &lt; 0,25</td>
              <td><X an={kaKlasse === 'B'} onClick={indexKreuz('B')} /> 0,25 - 1,0</td>
              <td><X an={kaKlasse === 'C'} onClick={indexKreuz('C')} /> &gt; 1,0</td></tr>
            <tr><td>Diabetes</td>
              <td><X an={d.diabetes === 'nein'} onClick={() => setD({ diabetes: 'nein' })} /> Kein Diabetes</td>
              <td><X an={d.diabetes === 'hba1c_unter7'} onClick={() => setD({ diabetes: 'hba1c_unter7' })} /> HbA 1c &lt; 7,0 %</td>
              <td><X an={d.diabetes === 'hba1c_ab7'} onClick={() => setD({ diabetes: 'hba1c_ab7' })} /> HbA 1c≥7,0 %</td></tr>
            <tr><td>Rauchen</td>
              <td><X an={d.raucher === 'nein'} onClick={() => setD({ raucher: 'nein' })} /> Kein Rauchen</td>
              <td><X an={d.raucher === 'unter10'} onClick={() => setD({ raucher: 'unter10' })} /> &lt; 10 Zig./Tag</td>
              <td><X an={d.raucher === 'ab10'} onClick={() => setD({ raucher: 'ab10' })} /> ≥ 10 Zig./Tag</td></tr>
          </tbody>
        </table>
      </div>

      <div className="b1-fuss">
        <div>
          <h4>Fortsetzung Anamnese Sonstiges</h4>
          <textarea className="textbox fi-text" value={an.sonstigesFortsetzung} onChange={(e) => setAn({ sonstigesFortsetzung: e.target.value })} />
        </div>
        <div>
          <h4>Entscheidung der Krankenkasse</h4>
          <div>Die Kosten der vorgesehenen systematischen PAR-Behandlung</div>
          <div className="b1-reihe">
            <span className="kreuz-paar">werden übernommen <X an={fall.kkEntscheidung === 'uebernommen'} onClick={() => kk('uebernommen')} /></span>
            <span className="kreuz-paar">werden nicht übernommen <X an={fall.kkEntscheidung === 'nicht_uebernommen'} onClick={() => kk('nicht_uebernommen')} /></span></div>
          <Unterschrift text={<>Datum, Unterschrift und Stempel der <b>Krankenkasse</b></>} />
        </div>
      </div>
    </Seite>
  )
}

// ---------------------------------------------------------------------------
// Blatt 2
// ---------------------------------------------------------------------------

function Blatt2({ fall, setFall, einst, setEinst, befund, setBefund }: {
  fall: ParFall; setFall: (f: ParFall) => void; einst: Einstellungen; setEinst: (e: Einstellungen) => void
  befund: Befund; setBefund: (b: Befund) => void
}) {
  const lb = leistungsblock(fall)
  const gut = (g: Gutachten) => setFall({ ...fall, gutachten: fall.gutachten === g ? 'offen' : g })
  const zelle = (nr: string, n: number) => <tr><td>{nr}</td><td>{n || ''}</td></tr>
  return (
    <Seite titel={<h1>PARODONTALSTATUS <small>Blatt 2</small></h1>}>
      <div className="a4-kopf">
        <Versichertenfeld fall={fall} einst={einst} setFall={setFall} setEinst={setEinst} />
        <div className="a4-kopf-rechts">
          <div className="vom">vom <Fi type="date" value={befund.datum} onChange={(v) => setBefund({ ...befund, datum: v })} />
            {befund.phase !== 'initial' && <span className="ein keindruck"> {befund.bezeichnung}</span>}</div>
          <div className="zs-liste"><b>Zahnstatus (ZS)</b><br />1 = Fehlender Zahn<br />2 = nicht erhaltungswürdiger Zahn<br />3 = Krone<br />4 = Brückenpfeiler<br />5 = Ersatz<br />6 = Implantat</div>
        </div>
      </div>
      <div className="b2-chart"><Blatt2Chart befund={befund} onChange={setBefund} /></div>
      <div className="b2-bemerkung"><h4>Bemerkungen:</h4>
        <textarea className="fi-text" value={fall.bemerkung} onChange={(e) => setFall({ ...fall, bemerkung: e.target.value })} />
      </div>
      <div className="b2-fuss">
        <div>
          <div className="b1-reihe"><h4>Leistungen</h4>
            <span className="kreuz-paar"><X an={!fall.uebernahmefall} onClick={() => setFall({ ...fall, uebernahmefall: false })} /> geplant</span>
            <span className="kreuz-paar"><X an={fall.uebernahmefall} onClick={() => setFall({ ...fall, uebernahmefall: true })} /> ab Behandlungseinstieg</span></div>
          <div className="lb-tabellen">
            <table className="lb"><thead><tr><th>Geb.-Nr.</th><th>Anzahl</th></tr></thead>
              <tbody>{zelle('4', lb['4'])}{zelle('ATG', lb.ATG)}{zelle('MHU', lb.MHU)}</tbody></table>
            <table className="lb"><thead><tr><th>Geb.-Nr.</th><th>Anzahl</th></tr></thead>
              <tbody>{zelle('AIT a', lb.AITa)}{zelle('AIT b', lb.AITb)}{zelle('BEV a', lb.BEVa)}</tbody></table>
          </div>
          <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Zahnarztes</b></>} />
        </div>
        <div>
          <h4>Gutachten</h4>
          <div className="b1-reihe"><X an={fall.gutachten === 'befuerwortet'} onClick={() => gut('befuerwortet')} /> Gutachtlich befürwortet</div>
          <div className="b1-reihe"><X an={fall.gutachten === 'nicht_befuerwortet'} onClick={() => gut('nicht_befuerwortet')} /> Gutachtlich nicht befürwortet<br />(Begründung auf gesondertem Blatt)</div>
          <Unterschrift text={<>Datum, Unterschrift und Stempel des <b>Gutachters</b></>} />
        </div>
      </div>
    </Seite>
  )
}

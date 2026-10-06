import { diagnoseText } from '../engine/diagnose'
import type { Anamnese, Diagnose, DiagnoseErgebnis, ParFall } from '../types'
import { Feld, Karte, Schalter, TextFeld, ZahlFeld } from './ui'

interface Props {
  fall: ParFall
  setFall: (f: ParFall) => void
  diag: DiagnoseErgebnis
}

export default function Blatt1Reiter({ fall, setFall, diag }: Props) {
  const setD = (patch: Partial<Diagnose>) => setFall({ ...fall, diagnose: { ...fall.diagnose, ...patch } })
  const setAn = (patch: Partial<Anamnese>) => setFall({ ...fall, anamnese: { ...fall.anamnese, ...patch } })
  const d = fall.diagnose
  const an = fall.anamnese

  const stadiumAktiv = (s: number) => diag.stadium === s ? ' aktiv' : ''
  const gradAktiv = (g: 'A' | 'B' | 'C') => diag.grad === g ? ' aktiv' : ''

  return (
    <div className="reiter-inhalt">
      <Karte titel="Allgemeine und parodontitisspezifische Anamnese">
        <div className="schalter-reihe">
          <Schalter label="Diabetes mellitus" checked={an.diabetesMellitus} onChange={(v) => setAn({ diabetesMellitus: v })} />
          <Schalter label="Tabakkonsum" checked={an.tabakkonsum} onChange={(v) => setAn({ tabakkonsum: v })} />
          <Schalter label="Fruehere PAR-Therapie" checked={an.fruehereParTherapie} onChange={(v) => setAn({ fruehereParTherapie: v })} />
          {an.fruehereParTherapie && (
            <TextFeld label="Jahr ca." value={an.fruehereParJahr} onChange={(v) => setAn({ fruehereParJahr: v })} />
          )}
        </div>
        <TextFeld label="Sonstiges / Fortsetzung" value={an.sonstiges} onChange={(v) => setAn({ sonstiges: v })} weit />
      </Karte>

      <Karte titel="Diagnose">
        <Feld label="Diagnose-Typ" weit>
          <select value={d.diagnoseTyp} onChange={(e) => setD({ diagnoseTyp: e.target.value as Diagnose['diagnoseTyp'] })}>
            <option value="parodontitis">Parodontitis</option>
            <option value="systemisch">Parodontitis als Manifestation systemischer Erkrankungen</option>
            <option value="sonstige_vergroesserung">Andere das Parodont betreffende Zustaende: generalisierte gingivale Vergroesserungen</option>
          </select>
        </Feld>
      </Karte>

      <Karte titel="Stadium (Schweregrad)" rechts={<span className="ergebnis-badge">{diag.stadiumText}</span>}>
        <div className="feld-raster">
          <ZahlFeld label="Roentg. Knochenabbau (KA) in %" value={d.knochenabbauProzent} onChange={(v) => setD({ knochenabbauProzent: v })} min={0} max={100} />
          <TextFeld label="am Zahn" value={d.knochenabbauZahn} onChange={(v) => setD({ knochenabbauZahn: v })} />
          <ZahlFeld label="interdentaler CAL (mm), max." value={d.calMax} onChange={(v) => setD({ calMax: v })} min={0} max={20} />
          <ZahlFeld label="Zahnverlust durch Parodontitis" value={d.zahnverlustPar} onChange={(v) => setD({ zahnverlustPar: v })} min={0} max={32} />
        </div>
        <div className="matrix stadium">
          {([1, 2, 3, 4] as const).map((s) => (
            <div key={s} className={`matrix-spalte${stadiumAktiv(s)}`}>
              <div className="matrix-kopf">Stadium {['I', 'II', 'III', 'IV'][s - 1]}</div>
              <div className="matrix-zelle">{s === 1 ? '< 15 % / 1-2 mm' : s === 2 ? '15-33 % / 3-4 mm' : '> 33 % / >= 5 mm'}</div>
            </div>
          ))}
        </div>
        <div className="schalter-reihe">
          <span className="feld-label">Komplexitaetsfaktoren:</span>
          <Schalter label="ST >= 6 mm" checked={d.st6plus} onChange={(v) => setD({ st6plus: v })} />
          <Schalter label="vertikaler KA >= 3 mm" checked={d.vertikalerKA3} onChange={(v) => setD({ vertikalerKA3: v })} />
          <Schalter label="Furkationsbefall Grad II/III" checked={d.furkationII_III} onChange={(v) => setD({ furkationII_III: v })} />
          <Schalter label="Komplexe Rehabilitation (mastikator. Dysfunktion)" checked={d.komplexeReha} onChange={(v) => setD({ komplexeReha: v })} />
        </div>
      </Karte>

      <Karte titel="Ausmass / Verteilung" rechts={<span className="ergebnis-badge">{ausmassText(diag.ausmass)} ({diag.anteilProzent} %)</span>}>
        <div className="matrix">
          <div className={`matrix-spalte${diag.ausmass === 'lokalisiert' ? ' aktiv' : ''}`}><div className="matrix-kopf">Lokalisiert</div><div className="matrix-zelle">&lt; 30 % der Zaehne</div></div>
          <div className={`matrix-spalte${diag.ausmass === 'generalisiert' ? ' aktiv' : ''}`}><div className="matrix-kopf">Generalisiert</div><div className="matrix-zelle">&ge; 30 % der Zaehne</div></div>
          <div className={`matrix-spalte${diag.ausmass === 'molaren-inzisiven' ? ' aktiv' : ''}`}><div className="matrix-kopf">Molaren-Inzisiven-Muster</div><div className="matrix-zelle">manuell</div></div>
        </div>
        <Schalter label="Molaren-Inzisiven-Muster" checked={d.mipMuster} onChange={(v) => setD({ mipMuster: v })} />
      </Karte>

      <Karte titel="Grad (Progression)" rechts={<span className="ergebnis-badge">Grad {diag.grad}</span>}>
        <div className="feld-raster">
          <ZahlFeld label="Patientenalter" value={d.alter} onChange={(v) => setD({ alter: v })} min={0} max={120} />
          <Feld label="Diabetes (Grading)">
            <select value={d.diabetes} onChange={(e) => setD({ diabetes: e.target.value as Diagnose['diabetes'] })}>
              <option value="nein">Kein Diabetes</option>
              <option value="hba1c_unter7">HbA1c &lt; 7,0 %</option>
              <option value="hba1c_ab7">HbA1c &ge; 7,0 %</option>
            </select>
          </Feld>
          <Feld label="Rauchen (Grading)">
            <select value={d.raucher} onChange={(e) => setD({ raucher: e.target.value as Diagnose['raucher'] })}>
              <option value="nein">Kein Rauchen</option>
              <option value="unter10">&lt; 10 Zig./Tag</option>
              <option value="ab10">&ge; 10 Zig./Tag</option>
            </select>
          </Feld>
        </div>
        <div className="matrix grad">
          <div className={`matrix-spalte${gradAktiv('A')}`}><div className="matrix-kopf">Grad A</div><div className="matrix-zelle">KA%/Alter &lt; 0,25</div></div>
          <div className={`matrix-spalte${gradAktiv('B')}`}><div className="matrix-kopf">Grad B</div><div className="matrix-zelle">0,25 - 1,0</div></div>
          <div className={`matrix-spalte${gradAktiv('C')}`}><div className="matrix-kopf">Grad C</div><div className="matrix-zelle">&gt; 1,0</div></div>
        </div>
        <p className="hinweis-klein">{diag.gradBasis}</p>
      </Karte>

      <Karte titel="Diagnose-Zusammenfassung">
        <p className="diag-text">{diagnoseText(diag)}</p>
        {diag.hinweise.map((h, i) => <p key={i} className="hinweis-klein">{h}</p>)}
      </Karte>

      <Karte titel="Gutachten">
        <div className="schalter-reihe">
          {(['befuerwortet', 'nicht_befuerwortet', 'offen'] as const).map((e) => (
            <label key={e} className="schalter">
              <input type="radio" name="gutachten" checked={fall.gutachten === e} onChange={() => setFall({ ...fall, gutachten: e })} />
              <span>{e === 'befuerwortet' ? 'Gutachtlich befürwortet' : e === 'nicht_befuerwortet' ? 'Gutachtlich nicht befürwortet' : 'kein Gutachten'}</span>
            </label>
          ))}
        </div>
      </Karte>

      <Karte titel="Entscheidung der Krankenkasse">
        <div className="schalter-reihe">
          {(['uebernommen', 'nicht_uebernommen', 'offen'] as const).map((e) => (
            <label key={e} className="schalter">
              <input type="radio" name="kk" checked={fall.kkEntscheidung === e} onChange={() => setFall({ ...fall, kkEntscheidung: e })} />
              <span>{e === 'uebernommen' ? 'Kosten werden uebernommen' : e === 'nicht_uebernommen' ? 'werden nicht uebernommen' : 'offen'}</span>
            </label>
          ))}
        </div>
      </Karte>
    </div>
  )
}

function ausmassText(a: DiagnoseErgebnis['ausmass']): string {
  return a === 'generalisiert' ? 'Generalisiert' : a === 'molaren-inzisiven' ? 'Molaren-Inzisiven-Muster' : 'Lokalisiert'
}

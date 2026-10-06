import type { Antragskopf, Kassenart, ParFall, Patient } from '../types'
import { Feld, Karte, Schalter, TextFeld } from './ui'

interface Props {
  fall: ParFall
  setFall: (f: ParFall) => void
}

export default function PatientReiter({ fall, setFall }: Props) {
  const setP = (patch: Partial<Patient>) => setFall({ ...fall, patient: { ...fall.patient, ...patch } })
  const setA = (patch: Partial<Antragskopf>) => setFall({ ...fall, antrag: { ...fall.antrag, ...patch } })
  const p = fall.patient
  const a = fall.antrag

  return (
    <div className="reiter-inhalt">
      <Karte titel="Versicherter">
        <div className="feld-raster">
          <TextFeld label="Name" value={p.name} onChange={(v) => setP({ name: v })} />
          <TextFeld label="Vorname" value={p.vorname} onChange={(v) => setP({ vorname: v })} />
          <Feld label="geboren am">
            <input type="date" value={p.geburtsdatum} onChange={(e) => setP({ geburtsdatum: e.target.value })} />
          </Feld>
          <TextFeld label="Krankenkasse" value={p.kasse} onChange={(v) => setP({ kasse: v })} />
          <Feld label="Kassenart">
            <select value={p.kassenart} onChange={(e) => setP({ kassenart: e.target.value as Kassenart })}>
              <option value="primaer">Primaerkasse (AOK, BKK, IKK, LKK, KBS)</option>
              <option value="ersatz">Ersatzkasse (vdek: TK, Barmer, DAK, ...)</option>
            </select>
          </Feld>
          <TextFeld label="Kostentraegerkennung (IK)" value={p.kostentraegerkennung} onChange={(v) => setP({ kostentraegerkennung: v })} />
          <TextFeld label="Versicherten-Nr." value={p.versichertennr} onChange={(v) => setP({ versichertennr: v })} />
          <TextFeld label="Kassennummer (7-stellig)" value={p.kassennummer} onChange={(v) => setP({ kassennummer: v })}
            placeholder="Regionalkennzeichen = erste 2 Ziffern" />
        </div>
        {p.kassenart === 'ersatz' && (
          <p className="hinweis-klein">Bei Ersatzkassen bestimmt das Regionalkennzeichen (erste zwei Ziffern der
            Kassennummer) den vdek-Punktwert.</p>
        )}
      </Karte>

      <Karte titel="Antrag / Behandlungsplan">
        <div className="feld-raster">
          <TextFeld label="Antragsnummer" value={a.antragsnummer} onChange={(v) => setA({ antragsnummer: v })} />
          <TextFeld label="Antragsnr. urspruenglicher BHP" value={a.antragsnummerUrspruenglich} onChange={(v) => setA({ antragsnummerUrspruenglich: v })} />
          <Feld label="Art des Behandlungsplans">
            <select value={a.artBehandlungsplan} onChange={(e) => setA({ artBehandlungsplan: e.target.value as Antragskopf['artBehandlungsplan'] })}>
              <option value="initial">Initialer PAR-Behandlungsplan</option>
              <option value="bev">Befundevaluation (BEV)</option>
              <option value="cpt">Chirurgische Therapie (CPT)</option>
              <option value="upt_verlaengerung">UPT-Verlaengerung</option>
            </select>
          </Feld>
          <Feld label="Wechselkennzeichen">
            <select value={a.wechselkennzeichen} onChange={(e) => setA({ wechselkennzeichen: e.target.value as Antragskopf['wechselkennzeichen'] })}>
              <option value="">kein Wechsel</option>
              <option value="kasse">Kassenwechsel</option>
              <option value="zahnarzt">Zahnarztwechsel</option>
            </select>
          </Feld>
          <TextFeld label="Verarbeitungskennzeichen" value={a.verarbeitungskennzeichen} onChange={(v) => setA({ verarbeitungskennzeichen: v })} />
          <TextFeld label="Akt.-Z. der PVS" value={a.aktenzeichenPVS} onChange={(v) => setA({ aktenzeichenPVS: v })} />
          <Feld label="log. Version"><input type="text" value={a.logVersion} readOnly /></Feld>
        </div>
        <div className="schalter-reihe">
          <Schalter label="Chirurgisches Vorgehen (CPT) vorgesehen" checked={fall.mitCPT} onChange={(v) => setFall({ ...fall, mitCPT: v })} />
          <Schalter label="PAR-Fall von anderer Praxis uebernommen" checked={fall.uebernahmefall} onChange={(v) => setFall({ ...fall, uebernahmefall: v })} />
        </div>
      </Karte>
    </div>
  )
}

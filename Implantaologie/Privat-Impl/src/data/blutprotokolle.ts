// Eigenblut-Aufbereitungsprotokolle (hämatologisches Praxis-Minilabor).
// Grundlage: BZÄK/PEI-Richtlinie zu Blutprodukten. PRF = Vollblut ohne Zusätze;
// PRP/PRGF = Citratblut, aktiviert mit Calciumchlorid. Abgerechnet werden GOÄ 250
// (Blutentnahme) und die Analogleistung; das Zentrifugieren ist Teil der
// Herstellung und wird nicht gesondert berechnet (nur als Schritt ausgewiesen).

export interface Blutprotokoll {
  id: 'prf' | 'aprf' | 'iprf' | 'lprf' | 'prgf' | 'prp'
  titel: string
  /** gehört zu welcher Eigenblut-Auswahl (global.blut) */
  gruppe: 'prf' | 'prgf' | 'prp'
  roehrchen: string
  zusatz: 'keine' | 'Citrat + Calciumchlorid'
  /** Zentrifugations-Schritte (Drehzahl × Zeit) */
  schritte: string[]
  produkt: string
  /** typische Röhrchenzahl je Sitzung */
  roehrchenProSitzung: number
  /** Material-ID des Röhrchens/Kits (siehe material.ts) */
  materialId: string
  /** PEI/§67-AMG-Anzeige und Aufklärung erforderlich */
  anzeigepflichtig: boolean
  hinweis: string
}

export const BLUTPROTOKOLLE: Blutprotokoll[] = [
  {
    id: 'prf', titel: 'PRF (Platelet Rich Fibrin)', gruppe: 'prf',
    roehrchen: 'Glasröhrchen ohne Antikoagulans', zusatz: 'keine',
    schritte: ['Blutentnahme (GOÄ 250)', 'Zentrifugation ca. 2.700 U/min, 12 min', 'Fibrinkoagulum entnehmen', 'PRF-Membran pressen'],
    produkt: 'PRF-Membran / PRF-Plug', roehrchenProSitzung: 2, materialId: 'roehrchen-prf',
    anzeigepflichtig: true,
    hinweis: 'Vollblut ohne Zusätze. Verarbeitung unmittelbar nach Entnahme (keine Lagerung).',
  },
  {
    id: 'aprf', titel: 'A-PRF+ (Advanced PRF)', gruppe: 'prf',
    roehrchen: 'A-PRF-Röhrchen (Glas, ohne Antikoagulans)', zusatz: 'keine',
    schritte: ['Blutentnahme (GOÄ 250)', 'Zentrifugation ca. 1.300 U/min, 8 min (Low-Speed)', 'A-PRF+-Koagulum entnehmen', 'Membran pressen'],
    produkt: 'A-PRF+-Membran (zellreich)', roehrchenProSitzung: 2, materialId: 'roehrchen-aprf',
    anzeigepflichtig: true,
    hinweis: 'Low-Speed-Konzept nach Choukroun: höherer Leukozyten- und Wachstumsfaktorgehalt.',
  },
  {
    id: 'iprf', titel: 'i-PRF (injectable PRF)', gruppe: 'prf',
    roehrchen: 'i-PRF-Röhrchen (Kunststoff, ohne Antikoagulans)', zusatz: 'keine',
    schritte: ['Blutentnahme (GOÄ 250)', 'Zentrifugation ca. 700 U/min, 3 min', 'flüssige i-PRF-Fraktion abziehen'],
    produkt: 'flüssiges i-PRF (für Sticky Bone)', roehrchenProSitzung: 1, materialId: 'roehrchen-iprf',
    anzeigepflichtig: true,
    hinweis: 'Flüssige Phase zum Binden von Knochenersatzmaterial („Sticky Bone").',
  },
  {
    id: 'lprf', titel: 'L-PRF (Leukocyte PRF)', gruppe: 'prf',
    roehrchen: 'L-PRF-Röhrchen (Glas)', zusatz: 'keine',
    schritte: ['Blutentnahme (GOÄ 250)', 'Zentrifugation ca. 2.700 U/min, 12 min', 'Koagulum entnehmen', 'Membran/Plug pressen'],
    produkt: 'L-PRF-Membran / Plug', roehrchenProSitzung: 2, materialId: 'roehrchen-lprf',
    anzeigepflichtig: true,
    hinweis: 'Leukozytenreiches PRF nach Dohan/IntraSpin-Protokoll.',
  },
  {
    id: 'prgf', titel: 'PRGF (Plasma Rich in Growth Factors, Endoret)', gruppe: 'prgf',
    roehrchen: 'Citrat-Röhrchen (Endoret-Kit)', zusatz: 'Citrat + Calciumchlorid',
    schritte: ['Blutentnahme in Citrat (GOÄ 250)', 'Zentrifugation ca. 580 g, 8 min', 'Fraktion F2 (wachstumsfaktorenreich) abpipettieren', 'Aktivierung mit Calciumchlorid', 'Fibrin-Scaffold / flüssig / Membran'],
    produkt: 'PRGF-Fraktion F2 (flüssig, Scaffold, Membran)', roehrchenProSitzung: 4, materialId: 'kit-prgf',
    anzeigepflichtig: true,
    hinweis: 'Citratblut, Aktivierung mit CaCl2. Fraktioniertes Protokoll (BTI Endoret).',
  },
  {
    id: 'prp', titel: 'PRP (Platelet Rich Plasma)', gruppe: 'prp',
    roehrchen: 'Citrat-Röhrchen (PRP-Kit)', zusatz: 'Citrat + Calciumchlorid',
    schritte: ['Blutentnahme in Citrat (GOÄ 250)', 'Erste Zentrifugation (Soft Spin) zur Plasmatrennung', 'Zweite Zentrifugation (Hard Spin) zur Thrombozytenkonzentration', 'Aktivierung mit Calciumchlorid'],
    produkt: 'aktiviertes PRP (flüssig / Gel)', roehrchenProSitzung: 2, materialId: 'kit-prp',
    anzeigepflichtig: true,
    hinweis: 'Citratblut, Doppelzentrifugation, Aktivierung mit CaCl2.',
  },
]

/** Protokolle einer Eigenblut-Gruppe (prf/prgf/prp). */
export const protokolleDerGruppe = (gruppe: 'prf' | 'prgf' | 'prp') => BLUTPROTOKOLLE.filter((p) => p.gruppe === gruppe)
/** Standardprotokoll je Gruppe (das erste). */
export const standardProtokoll = (gruppe: 'prf' | 'prgf' | 'prp') => protokolleDerGruppe(gruppe)[0]
export const protokollFinden = (id: string) => BLUTPROTOKOLLE.find((p) => p.id === id)

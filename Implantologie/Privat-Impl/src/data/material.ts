// Material- und Verbrauchskatalog für die Implantatchirurgie.
// Preise sind Netto-Einkaufspreise (BZÄK: Material zum tatsächlichen EK ohne
// Aufschlag, Ausweis nach Art/Menge/Preis, § 10 Abs. 2 Nr. 6 GOZ). Jeder Posten
// trägt Quelle, Stand, Genauigkeit und eine Materialklasse (0 Standard … 3 High-End).
// Die Preise sind im Reiter „Praxis & Preise" überschreibbar.

export type MaterialRolle =
  | 'kem-autolog' | 'kem-allogen' | 'kem-xenogen' | 'kem-synthetisch'
  | 'membran-resorbierbar' | 'membran-nichtresorbierbar' | 'membran-titan' | 'membran-vlies'
  | 'weichgewebematrix'
  | 'fixierung-pin' | 'fixierung-schraube'
  | 'kollektor' | 'naht' | 'fraese' | 'anaesthetikum'
  | 'roehrchen' | 'kit'

export interface MaterialPosten {
  id: string
  titel: string
  rolle: MaterialRolle
  produkt: string
  hersteller: string
  einheit: string
  /** Netto-Einkaufspreis in Euro */
  preis: number
  quelle: string
  stand: string
  genau: 'ja' | 'teilweise' | 'geschaetzt'
  /** 0 Standard … 3 High-End */
  klasse: number
}

const m = (
  id: string, titel: string, rolle: MaterialRolle, produkt: string, hersteller: string,
  einheit: string, preis: number, klasse: number, genau: MaterialPosten['genau'], quelle = 'Marktbeobachtung', stand = '2026-10',
): MaterialPosten => ({ id, titel, rolle, produkt, hersteller, einheit, preis, klasse, genau, quelle, stand })

export const MATERIAL: MaterialPosten[] = [
  // ── Knochenersatz autolog (eigener Knochen – Materialwert 0, nur Verbrauch) ──
  m('kem-autolog-dentin', 'Dentin als Knochenersatz (aufbereitet)', 'kem-autolog', 'Smart Dentin Grinder (Einmalkammer)', 'KometaBio', 'Aufbereitung', 42, 1, 'teilweise'),
  // ── Knochenersatz allogen ──────────────────────────────────────────────
  m('kem-maxgraft', 'Allogenes Knochenersatzmaterial (Granulat)', 'kem-allogen', 'maxgraft', 'botiss', '0,5 cc', 150, 2, 'geschaetzt'),
  m('kem-puros', 'Allogenes Knochenersatzmaterial (Granulat)', 'kem-allogen', 'Puros', 'Zimmer Biomet', '0,5 cc', 165, 2, 'geschaetzt'),
  // ── Knochenersatz xenogen ──────────────────────────────────────────────
  m('kem-osteobiol', 'Xenogenes Knochenersatzmaterial (porcin)', 'kem-xenogen', 'OsteoBiol Gen-Os', 'OsteoBiol / Tecnoss', '0,5 g', 95, 0, 'geschaetzt'),
  m('kem-cerabone', 'Xenogenes Knochenersatzmaterial (bovin)', 'kem-xenogen', 'cerabone', 'botiss', '0,5 cc', 120, 1, 'geschaetzt'),
  m('kem-bio-oss', 'Xenogenes Knochenersatzmaterial (bovin)', 'kem-xenogen', 'Bio-Oss spongiös', 'Geistlich', '0,5 g', 180, 2, 'teilweise'),
  m('kem-bio-oss-collagen', 'Xenogenes KEM mit Kollagen (Blockform)', 'kem-xenogen', 'Bio-Oss Collagen', 'Geistlich', '100 mg', 92, 3, 'teilweise'),
  m('kem-creos', 'Xenogenes Knochenersatzmaterial (bovin)', 'kem-xenogen', 'creos xenogain', 'Nobel Biocare', '0,5 g', 120, 2, 'geschaetzt'),
  // ── Knochenersatz synthetisch ──────────────────────────────────────────
  m('kem-maxresorb', 'Synthetisches Knochenersatzmaterial (β-TCP/HA)', 'kem-synthetisch', 'maxresorb', 'botiss', '0,5 cc', 105, 1, 'geschaetzt'),
  m('kem-ethoss', 'Synthetisches KEM (β-TCP + Calciumsulfat)', 'kem-synthetisch', 'Ethoss', 'Ethoss Regeneration', '0,5 cc', 130, 2, 'geschaetzt'),
  // ── Membranen resorbierbar ─────────────────────────────────────────────
  m('mem-jason', 'Resorbierbare Membran (Perikard)', 'membran-resorbierbar', 'Jason membrane', 'botiss', '20 × 30 mm', 78, 0, 'geschaetzt'),
  m('mem-creos', 'Resorbierbare Kollagenmembran', 'membran-resorbierbar', 'creos xenoprotect', 'Nobel Biocare', '15 × 20 mm', 85, 1, 'geschaetzt'),
  m('mem-bio-gide', 'Resorbierbare Kollagenmembran', 'membran-resorbierbar', 'Bio-Gide', 'Geistlich', '25 × 25 mm', 95, 2, 'teilweise'),
  m('mem-ossix', 'Resorbierbare Membran (quervernetzt, langsam)', 'membran-resorbierbar', 'Ossix Plus', 'Datum Dental', '25 × 30 mm', 112, 3, 'geschaetzt'),
  // ── Membranen nicht-resorbierbar ───────────────────────────────────────
  m('mem-cytoplast', 'Nicht-resorbierbare Membran (dPTFE)', 'membran-nichtresorbierbar', 'Cytoplast Ti-250', 'Osteogenics', '25 × 30 mm', 125, 2, 'geschaetzt'),
  // ── Membran titanverstärkt / individuell ───────────────────────────────
  m('mem-yxoss', 'Individuelles Titangitter (CAD/CAM)', 'membran-titan', 'Yxoss CBR', 'ReOss', 'Stück (individuell)', 480, 3, 'geschaetzt'),
  // ── Weichgewebematrix ──────────────────────────────────────────────────
  m('wg-mucograft', 'Kollagenmatrix (Weichgewebe)', 'weichgewebematrix', 'Mucograft', 'Geistlich', '15 × 20 mm', 150, 1, 'geschaetzt'),
  m('wg-mucoderm', 'Azelluläre dermale Matrix', 'weichgewebematrix', 'mucoderm', 'botiss', '15 × 20 mm', 160, 2, 'geschaetzt'),
  m('wg-fibrogide', 'Volumenstabile Kollagenmatrix', 'weichgewebematrix', 'Fibro-Gide', 'Geistlich', '15 × 20 × 6 mm', 195, 3, 'geschaetzt'),
  // ── Fixierung ──────────────────────────────────────────────────────────
  m('fix-pin', 'Membran-Fixierungspin (Titan)', 'fixierung-pin', 'Membran-Pin', 'diverse', 'Stück', 15, 1, 'geschaetzt'),
  m('fix-schraube', 'Osteosyntheseschraube (Mikroschraube)', 'fixierung-schraube', 'Osteosyntheseschraube', 'diverse', 'Stück', 25, 2, 'geschaetzt'),
  // ── Kollektoren / Knochengewinnung ─────────────────────────────────────
  m('koll-safescraper', 'Knochenschaber (Einmal)', 'kollektor', 'SafeScraper TWIST', 'META / OsteoBiol', 'Stück', 32, 1, 'geschaetzt'),
  m('koll-micross', 'Knochenschaber (Einmal)', 'kollektor', 'Micross', 'META', 'Stück', 36, 1, 'geschaetzt'),
  m('koll-bonetrap', 'Knochenfilter / Bone Trap', 'kollektor', 'Bone Trap', 'diverse', 'Stück', 20, 0, 'geschaetzt'),
  // ── Naht ───────────────────────────────────────────────────────────────
  m('naht-resorbierbar', 'Resorbierbarer Faden', 'naht', 'Vicryl 5-0', 'Ethicon', 'Faden', 4.5, 0, 'geschaetzt'),
  m('naht-ptfe', 'Nicht-resorbierbarer PTFE-Faden', 'naht', 'Cytoplast PTFE 4-0', 'Osteogenics', 'Faden', 6.5, 1, 'geschaetzt'),
  // ── Fräsen ─────────────────────────────────────────────────────────────
  m('fraese-set', 'Einmal-Bohrerset (steril)', 'fraese', 'Einmal-Bohrset', 'systemabhängig', 'Set', 48, 1, 'geschaetzt'),
  // ── Anästhetika ────────────────────────────────────────────────────────
  m('anae-articain-200', 'Articain 4 % 1:200.000', 'anaesthetikum', 'Ultracain D-S', 'Sanofi', 'Zylinderampulle', 0.55, 0, 'geschaetzt'),
  m('anae-articain-100', 'Articain 4 % 1:100.000', 'anaesthetikum', 'Ultracain D-S forte', 'Sanofi', 'Zylinderampulle', 0.55, 1, 'geschaetzt'),
  // ── Blutröhrchen / Kits ────────────────────────────────────────────────
  m('roehrchen-prf', 'PRF-Röhrchen (Glas, ohne Antikoagulans)', 'roehrchen', 'PRF-Röhrchen', 'diverse', 'Stück', 1.5, 1, 'geschaetzt'),
  m('roehrchen-aprf', 'A-PRF+-Röhrchen', 'roehrchen', 'A-PRF+ Tube', 'Process for PRF', 'Stück', 2.5, 2, 'geschaetzt'),
  m('roehrchen-iprf', 'i-PRF-Röhrchen', 'roehrchen', 'i-PRF Tube', 'Process for PRF', 'Stück', 2.5, 2, 'geschaetzt'),
  m('roehrchen-lprf', 'L-PRF-Röhrchen', 'roehrchen', 'L-PRF Tube', 'Intra-Lock', 'Stück', 2.5, 2, 'geschaetzt'),
  m('kit-prgf', 'PRGF-Entnahme-/Fraktionier-Kit', 'kit', 'Endoret (PRGF) Kit', 'BTI', 'Set', 38, 2, 'geschaetzt'),
  m('kit-prp', 'PRP-Entnahme-/Aufbereitungs-Kit', 'kit', 'PRP-Kit', 'diverse', 'Set', 30, 1, 'geschaetzt'),
]

export const materialFinden = (id: string) => MATERIAL.find((x) => x.id === id)
export const materialDerRolle = (rolle: MaterialRolle) => MATERIAL.filter((x) => x.rolle === rolle)

/**
 * Standardprodukt einer Rolle für eine Materialklasse: der Posten mit der
 * höchsten Klasse ≤ gewünschter Klasse (sonst der günstigste).
 */
export function materialFuerKlasse(rolle: MaterialRolle, klasse: number): MaterialPosten | undefined {
  const liste = materialDerRolle(rolle)
  if (!liste.length) return undefined
  const passend = liste.filter((x) => x.klasse <= klasse).sort((a, b) => b.klasse - a.klasse)
  return passend[0] ?? [...liste].sort((a, b) => a.klasse - b.klasse)[0]
}

/** Preis mit optionaler Praxis-Überschreibung. */
export const materialPreis = (posten: MaterialPosten, overrides: Record<string, number>) =>
  overrides[posten.id] ?? posten.preis

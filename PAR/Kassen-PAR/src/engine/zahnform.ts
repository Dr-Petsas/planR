// Zahngeometrie fuer das grafische Blatt 2 (KZBV eFormular 5, V2.1.0).
// Die Proportionen stammen aus tools/zahnform-extrahieren.py (Spalte ~33pt,
// Krone ~28pt, zentrales Lockerungsfeld ~10pt). Gemessen wird nur mesial und
// distal: die Krone ist in zwei Haelften links/rechts des Lockerungsfelds geteilt.

// --- Kronen-Konstanten (lokales Koordinatensystem, Ursprung Kronen-Ecke oben links)
export const KW = 28; // Kronenbreite
export const KH = 30; // Kronenhoehe
export const WURZEL_H = 32; // Wurzelhoehe (ueber bzw. unter der Krone)
export const SPALTE = 34; // Spaltenbreite je Zahn
/**
 * Abstand zweier Zahnmitten in SVG-Einheiten fuer die Knochenlinie. Setzt
 * voraus, dass Spalte : SVG-Breite in der CSS ueberall 1,15 betraegt
 * (46px : 40px am Bildschirm, 11,5mm : 10mm auf Blatt 2).
 */
export const NACHBAR_ABSTAND = (KW + 2) * 1.15;
/** SVG-Einheiten je mm Sondierungstiefe (15 mm = 30 Einheiten, Wurzel 32). */
export const EINHEITEN_JE_MM = 2;

// Zentrales Lockerungsfeld
const BW = 10;
const BH = 10;
const BX0 = (KW - BW) / 2; // 9
const BX1 = BX0 + BW; // 19
const BY0 = (KH - BH) / 2; // 10
const BY1 = BY0 + BH; // 20
const MY = KH / 2; // Mittellinie y = 15

export const lockerungsFeld = { x: BX0, y: BY0, w: BW, h: BH };

type Punkt = [number, number];
const p = (pts: Punkt[]) => pts.map(([x, y]) => `${x},${y}`).join(' ');

// Zwei Mess-Haelften der Krone (links/rechts am Bildschirm), getrennt durch
// die senkrechte Mittellinie und das zentrale Lockerungsfeld.
type Region = 'L' | 'R';
const MX = KW / 2; // 14

const REGION_POLY: Record<Region, string> = {
  L: p([[0, 0], [MX, 0], [MX, BY0], [BX0, BY0], [BX0, BY1], [MX, BY1], [MX, KH], [0, KH]]),
  R: p([[MX, 0], [KW, 0], [KW, KH], [MX, KH], [MX, BY1], [BX1, BY1], [BX1, BY0], [MX, BY0]]),
};

const REGION_MITTE: Record<Region, Punkt> = { L: [4.5, MY], R: [23.5, MY] };

// Linien im Kronenbild: senkrechte Mittellinie ober- und unterhalb des Lockerungsfelds.
export const KRONEN_LINIEN: Array<[number, number, number, number]> = [
  [MX, 0, MX, BY0], [MX, BY1, MX, KH],
];

// --- Mess-Segment-Zuordnung je Quadrant -------------------------------------
// st-Index: 0 = mesial, 1 = distal
export interface Segment {
  stIndex: number;
  region: Region;
  poly: string;
  mitte: Punkt;
  label: string;
}

const LABELS = ['mesial', 'distal'];

/** FDI-Quadrant (erste Ziffer) bestimmt, ob mesial auf der Bildschirm-Rechtsseite liegt. */
export function mesialRechts(fdi: number): boolean {
  const q = Math.floor(fdi / 10);
  return q === 1 || q === 4; // Quadrant 1 und 4 liegen bild-links, mesial zeigt nach rechts
}

/** st-Index der am Bildschirm linken Kronenhaelfte. */
export function linkerIndex(fdi: number): number {
  return mesialRechts(fdi) ? 1 : 0;
}

/** Oberkiefer (Quadrant 1/2): Wurzel oben. */
export function istOberkiefer(fdi: number): boolean {
  const q = Math.floor(fdi / 10);
  return q === 1 || q === 2;
}

export function segmente(fdi: number): Segment[] {
  const order: Region[] = mesialRechts(fdi) ? ['R', 'L'] : ['L', 'R'];
  return order.map((region, stIndex) => ({
    stIndex,
    region,
    poly: REGION_POLY[region],
    mitte: REGION_MITTE[region],
    label: LABELS[stIndex],
  }));
}

// --- Wurzelformen -----------------------------------------------------------
// Anzahl Wurzel-Lappen je Zahntyp und Kiefer.
function wurzelLappen(fdi: number): number {
  const zahn = fdi % 10; // 1..8
  const ok = istOberkiefer(fdi);
  if (ok && zahn === 4) return 2; // erster OK-Praemolar: zweiwurzlig
  if (zahn <= 5) return 1; // Front + Praemolaren: ein Lappen
  return ok ? 3 : 2; // Molaren: OK dreiwurzlig, UK zweiwurzlig
}

/** Wurzelpfade (gestrichelt) in Kronen-lokalen Koordinaten. */
export function wurzelPfade(fdi: number): string[] {
  const ok = istOberkiefer(fdi);
  const n = wurzelLappen(fdi);
  const h = WURZEL_H;
  const baseY = ok ? 0 : KH; // Ansatz an der kiefer-nahen Kronenkante
  const dir = ok ? -1 : 1; // Wurzel zeigt vom Kiefer weg
  const paths: string[] = [];
  // Lappenbreite ueber die Kronenbreite verteilen
  const rand = 1.5;
  const nutz = KW - 2 * rand;
  const lw = nutz / n;
  for (let i = 0; i < n; i++) {
    const cx = rand + lw * (i + 0.5);
    const halb = (lw / 2) * (n === 1 ? 0.95 : 0.85);
    const lh = h * (n === 1 ? 1 : 0.9);
    const tip = baseY + dir * lh;
    const mid = baseY + dir * lh * 0.4;
    paths.push(
      `M ${(cx - halb).toFixed(1)},${baseY} ` +
      `C ${(cx - halb - 0.5).toFixed(1)},${mid.toFixed(1)} ${(cx - halb * 0.5).toFixed(1)},${tip.toFixed(1)} ${cx.toFixed(1)},${tip.toFixed(1)} ` +
      `C ${(cx + halb * 0.5).toFixed(1)},${tip.toFixed(1)} ${(cx + halb + 0.5).toFixed(1)},${mid.toFixed(1)} ${(cx + halb).toFixed(1)},${baseY}`,
    );
  }
  return paths;
}

/** Hoehe der gesamten Zahnzeichnung (Krone + Wurzel) und y-Offset der Krone. */
export function zahnBox(): { breite: number; hoehe: number; kroneY: number } {
  // Krone + Wurzel; Krone sitzt nach der Wurzel (OK) bzw. zuerst (UK) – wird im
  // Chart je Kiefer gesetzt. Hier die reine Groesse.
  return { breite: KW, hoehe: KH + WURZEL_H, kroneY: WURZEL_H };
}

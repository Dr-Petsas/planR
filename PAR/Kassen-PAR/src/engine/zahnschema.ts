// Zahnschema für den PAR-Status (Reihenfolge wie im KZBV-Formular Blatt 2).

export const OBERKIEFER = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const UNTERKIEFER = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
export const ALLE_ZAEHNE = [...OBERKIEFER, ...UNTERKIEFER]

export const kieferVon = (zahn: string): 'OK' | 'UK' => (zahn[0] === '1' || zahn[0] === '2' ? 'OK' : 'UK')
export const istMolar = (zahn: string) => ['6', '7', '8'].includes(zahn[1])

/**
 * Zähne mit FB-Kästchen auf Blatt 2 (eFormular 5 v2.1.0): OK 18-16, 14, 24,
 * 26-28 und UK 48-46, 36-38.
 */
export const FB_ZAEHNE = new Set(['18', '17', '16', '14', '24', '26', '27', '28', '48', '47', '46', '36', '37', '38'])
export const hatFbFeld = (zahn: string) => FB_ZAEHNE.has(zahn)

/**
 * Ein-/Mehrwurzeligkeit für die AIT-/CPT-/UPT-Abrechnung (a = einwurzelig,
 * b = mehrwurzelig): Molaren und die ersten OK-Prämolaren (14, 24) sind
 * mehrwurzelig — dieselben Zähne, die auf Blatt 2 ein FB-Kästchen haben.
 */
export const istMehrwurzelig = (zahn: string) => hatFbFeld(zahn)

/** Zahnstatus, die als natürlicher Zahn behandelt und gemessen werden (0, 3, 4). */
export const istBehandelbar = (zs: number) => zs === 0 || zs === 3 || zs === 4

/** Quadrant 1-4 eines FDI-Zahns. */
export const quadrant = (zahn: string) => Number(zahn[0])

/** Die zwei Messstellen je Zahn (mesial, distal) – Index wie in ZahnBefund.st. */
export const MESSSTELLEN = ['m', 'd'] as const
export type Messstelle = (typeof MESSSTELLEN)[number]
export const MESSSTELLE_LABEL: Record<Messstelle, string> = {
  m: 'mesial',
  d: 'distal',
}

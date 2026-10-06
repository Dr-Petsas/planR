// Zahnschema für den PAR-Status (Reihenfolge wie im KZBV-Formular Blatt 2).

export const OBERKIEFER = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28']
export const UNTERKIEFER = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38']
export const ALLE_ZAEHNE = [...OBERKIEFER, ...UNTERKIEFER]

export const kieferVon = (zahn: string): 'OK' | 'UK' => (zahn[0] === '1' || zahn[0] === '2' ? 'OK' : 'UK')
export const istMolar = (zahn: string) => ['6', '7', '8'].includes(zahn[1])

/**
 * Ein-/Mehrwurzeligkeit für die AIT-/CPT-/UPT-Abrechnung (a = einwurzelig,
 * b = mehrwurzelig). Nach üblicher BEMA-Auslegung gelten die Molaren (6er–8er)
 * als mehrwurzelig, Front- und Prämolaren als einwurzelig. Der Oberkiefer-
 * Sechser/Siebener/Achter ist mehrwurzelig; der Prämolar bleibt einwurzelig.
 */
export const istMehrwurzelig = (zahn: string) => istMolar(zahn)

/** Die sechs Messstellen je Zahn (3 vestibulär, 3 oral) in Formular-Reihenfolge. */
export const MESSSTELLEN = ['mb', 'b', 'db', 'mo', 'o', 'do'] as const
export type Messstelle = (typeof MESSSTELLEN)[number]
export const MESSSTELLE_LABEL: Record<Messstelle, string> = {
  mb: 'mesio-vestibulär',
  b: 'vestibulär',
  db: 'disto-vestibulär',
  mo: 'mesio-oral',
  o: 'oral',
  do: 'disto-oral',
}
/** Die beiden Pflicht-Approximalstellen (mind. zwei ST je Zahn). */
export const APPROXIMAL: Messstelle[] = ['mb', 'db']

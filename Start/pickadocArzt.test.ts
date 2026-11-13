import { describe, expect, it } from 'vitest'
import { arztWaehlen, arztZumNamen, selberArzt, signaturVonVerknuepft } from './pickadocArzt.ts'

const SIG = `data:image/png;base64,${'A'.repeat(200)}`
const dok = (id: string, f: Record<string, string | boolean>) => ({
  name: `projects/docgenda/databases/(default)/documents/clients/c/users/${id}`,
  fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'boolean' ? { booleanValue: v } : { stringValue: v }])),
})

describe('Arzt für die Unterschrift', () => {
  const petsas = dok('p', { title: 'Dr.', firstName: 'Michael', lastName: 'Petsas', role: 'doctor', signature: SIG })
  const kollegin = dok('k', { title: 'Dr.', firstName: 'Anna', lastName: 'Berg', role: 'doctor', signature: SIG })

  it('angemeldeter Arzt unterschreibt selbst – auch ohne hinterlegte Unterschrift nie mit der eines Kollegen', () => {
    expect(arztWaehlen(petsas, [kollegin, petsas])).toEqual({ uid: 'p', name: 'Dr. Michael Petsas', signatur: SIG })
    const ohne = dok('o', { firstName: 'Otto', lastName: 'Ohne', role: 'doctor' })
    expect(arztWaehlen(ohne, [kollegin])).toEqual({ uid: 'o', name: 'Otto Ohne', signatur: '' })
  })

  it('Helferin plant: der Arzt aus dem Praxiskopf, sonst der erste mit Unterschrift; versteckte zählen nicht', () => {
    const helferin = dok('h', { firstName: 'Eva', lastName: 'Hilf', role: 'assistant' })
    expect(arztWaehlen(helferin, [kollegin, petsas], 'Dr. med. dent. Michael Petsas')?.uid).toBe('p')
    expect(arztWaehlen(helferin, [dok('x', { firstName: 'X', lastName: 'Y', role: 'doctor' }), kollegin])?.uid).toBe('k')
    expect(arztWaehlen(null, [dok('v', { ...{ firstName: 'V', lastName: 'W', role: 'doctor', signature: SIG }, hidden: true })])).toBeNull()
  })

  it('nur echte Bild-Data-URLs gelten als Unterschrift', () => {
    expect(arztWaehlen(dok('z', { firstName: 'Z', lastName: 'Z', role: 'doctor', signature: 'javascript:alert(1)' }), [])?.signatur).toBe('')
  })

  it('verknüpfte Praxis: derselbe Arzt, auch wenn der Titel anders geschrieben ist', () => {
    expect(selberArzt('Dr.med.dent. Michael Petsas', 'Dr. Michael Petsas')).toBe(true)
    expect(selberArzt('Dr. Michael Petsas', 'Dr. Anna Berg')).toBe(false)
    const eigen = { uid: 'solo', name: 'Dr.med.dent. Michael Petsas', signatur: '' }
    const verknuepft = { uid: 'praxis', name: 'Dr. Michael Petsas', signatur: SIG }
    const kollegin = { uid: 'k', name: 'Dr. Anna Berg', signatur: SIG }
    expect(signaturVonVerknuepft(eigen, verknuepft)).toEqual({ ...eigen, signatur: SIG })
    expect(signaturVonVerknuepft(eigen, kollegin)).toEqual(eigen)
    expect(signaturVonVerknuepft({ ...eigen, signatur: 'data:image/png;base64,eigen' }, verknuepft)?.signatur).toBe('data:image/png;base64,eigen')
    expect(arztZumNamen([kolleginDok(kollegin), petsas], 'Dr.med.dent. Michael Petsas')?.uid).toBe('p')
    expect(arztZumNamen([kolleginDok(kollegin)], 'Dr.med.dent. Michael Petsas')).toBeNull()
  })
})

function kolleginDok(a: { uid: string; name: string; signatur: string }) {
  const [title, firstName, lastName] = a.name.split(' ')
  return dok(a.uid, { title, firstName, lastName, role: 'doctor', signature: a.signatur })
}

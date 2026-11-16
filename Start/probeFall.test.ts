import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FALL_TAGE, ZUORDNEN_STUNDEN, eingangAnlegen, eingangZuordnen, fallAnlegen, fallFinden, fallTeile } from './probeEingang'

const ordner: string[] = []
afterEach(async () => {
  await Promise.all(ordner.splice(0).map((o) => rm(o, { recursive: true, force: true })))
})

async function wurzelMitPlan() {
  const wurzel = await mkdtemp(join(tmpdir(), 'probe-fall-'))
  ordner.push(wurzel)
  const a = await eingangAnlegen(wurzel, { name: 'a.pdf', art: 'application/pdf', bytes: Buffer.from('a') })
  const b = await eingangAnlegen(wurzel, { name: 'b.pdf', art: 'application/pdf', bytes: Buffer.from('b') })
  return { wurzel, a, b }
}

describe('Fall unter einem Link', () => {
  it('gibt denselben Uploads denselben Link', async () => {
    const { wurzel, a, b } = await wurzelMitPlan()
    const eins = await fallAnlegen(wurzel, [b.id, a.id], 'Praxis Berg')
    const zwei = await fallAnlegen(wurzel, [a.id, b.id], 'Praxis Berg')
    expect(eins?.token).toHaveLength(32)
    expect(zwei?.token).toBe(eins?.token)
    expect((await fallAnlegen(wurzel, [a.id], 'Praxis Berg'))?.token).not.toBe(eins?.token)
  })

  it('legt für unbekannte Uploads keinen Link an', async () => {
    const { wurzel } = await wurzelMitPlan()
    expect(await fallAnlegen(wurzel, ['0123456789abcdef', '../x'], 'x')).toBeNull()
  })

  it('findet den Fall nur mit dem ganzen Link und nur in der Frist', async () => {
    const { wurzel, a } = await wurzelMitPlan()
    const fall = (await fallAnlegen(wurzel, [a.id], 'Praxis Berg'))!
    expect((await fallFinden(wurzel, fall.token))?.ids).toEqual([a.id])
    expect(await fallFinden(wurzel, fall.token.slice(0, 31) + (fall.token.endsWith('0') ? '1' : '0'))).toBeNull()
    expect(await fallFinden(wurzel, '')).toBeNull()
    expect(await fallFinden(wurzel, fall.token, Date.now() + (FALL_TAGE + 1) * 86_400_000)).toBeNull()
  })

  it('nimmt das erste gelesene Ergebnis von jedem, danach nur noch vom Betreiber', async () => {
    const { wurzel, a } = await wurzelMitPlan()
    const fall = (await fallAnlegen(wurzel, [a.id], 'Praxis Berg'))!
    expect(await fallTeile(wurzel, fall.token, '{"teile":[1]}', true)).toBe(true)
    expect(await fallTeile(wurzel, fall.token, '{"teile":[2]}', true)).toBe(false)
    expect((await fallFinden(wurzel, fall.token))?.teile).toBe('{"teile":[1]}')
    expect(await fallTeile(wurzel, fall.token, '{"teile":[3]}', false)).toBe(true)
    expect((await fallFinden(wurzel, fall.token))?.teile).toBe('{"teile":[3]}')
    // Derselbe Link bleibt samt Ergebnis, wenn der Betreiber ihn erneut holt.
    expect((await fallAnlegen(wurzel, [a.id], 'Praxis Berg'))?.teile).toBe('{"teile":[3]}')
  })

  it('ordnet über den Link auch ältere Uploads einer Praxis zu', async () => {
    const { wurzel, a } = await wurzelMitPlan()
    const spaeter = Date.now() + (ZUORDNEN_STUNDEN + 1) * 3_600_000
    expect(await eingangZuordnen(wurzel, [a.id], 'praxis1', 'anna@praxis-berg.de', spaeter)).toBe(0)
    expect(await eingangZuordnen(wurzel, [a.id], 'praxis1', 'anna@praxis-berg.de', spaeter, true)).toBe(1)
  })
})

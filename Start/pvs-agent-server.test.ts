import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  AgentHub, Bremse, accessPruefen, auftragErlaubt, codeHash, codePasst, cookieWert, emailErlaubt, geraetPasst, neuerPraxisCode,
  FRUEHER_TAGE, neuerSchluessel, paketSchluesselSetzen, schluesselHash, schluesselPasst, type AgentListe,
} from './pvs-agent-server.ts'

const schluessel = neuerSchluessel()
const code = neuerPraxisCode()
const geraet = neuerSchluessel()
const liste: AgentListe = {
  praxis: {
    hash: schluesselHash(schluessel), emails: ['chefin@praxis.de', '@team-praxis.de'],
    codeHash: codeHash(code), geraete: [{ hash: schluesselHash(geraet), name: 'Empfang', am: '2026-10-12' }],
  },
}

describe('Praxis-Code und Gerätefreigabe', () => {
  it('Code ist gut abtippbar und unempfindlich gegen Schreibweise', () => {
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/)
    expect(codePasst(liste, 'praxis', code)).toBe(true)
    expect(codePasst(liste, 'praxis', ` ${code.toLowerCase().replace(/-/g, ' ')} `)).toBe(true)
    expect(codePasst(liste, 'praxis', neuerPraxisCode())).toBe(false)
    expect(codePasst(liste, 'andere', code)).toBe(false)
    expect(codePasst(liste, 'praxis', '')).toBe(false)
  })

  it('erkennt freigegebene Geräte am Cookie', () => {
    const kopf = `x=1; planr_pvs_praxis=${geraet}; y=2`
    expect(cookieWert(kopf, 'planr_pvs_praxis')).toBe(geraet)
    expect(cookieWert(undefined, 'planr_pvs_praxis')).toBe('')
    expect(geraetPasst(liste, 'praxis', geraet)).toBe(true)
    expect(geraetPasst(liste, 'praxis', neuerSchluessel())).toBe(false)
    expect(geraetPasst(liste, 'andere', geraet)).toBe(false)
    expect(geraetPasst(liste, 'praxis', '')).toBe(false)
  })

  it('sperrt nach zu vielen Fehlversuchen', () => {
    const b = new Bremse(3, 60_000)
    for (let i = 0; i < 3; i++) {
      expect(b.gesperrt('ip|praxis')).toBe(false)
      b.fehler('ip|praxis')
    }
    expect(b.gesperrt('ip|praxis')).toBe(true)
    expect(b.gesperrt('andere-ip|praxis')).toBe(false)
  })
})

describe('Agenten-Schlüssel', () => {
  it('passt nur zum eigenen Mandanten', () => {
    expect(schluesselPasst(liste, 'praxis', schluessel)).toBe(true)
    expect(schluesselPasst(liste, 'praxis', neuerSchluessel())).toBe(false)
    expect(schluesselPasst(liste, 'andere', schluessel)).toBe(false)
    expect(schluesselPasst(liste, 'praxis', '')).toBe(false)
  })

  it('ein neues Paket hängt die installierte Bridge nicht ab, aber nur für FRUEHER_TAGE', () => {
    const jetzt = Date.parse('2026-10-13T12:00:00Z')
    const [erster, zweiter, dritter] = [neuerSchluessel(), neuerSchluessel(), neuerSchluessel()]
    let e = paketSchluesselSetzen(undefined, schluesselHash(erster), jetzt)
    e = paketSchluesselSetzen(e, schluesselHash(zweiter), jetzt + 60_000)
    e = paketSchluesselSetzen(e, schluesselHash(dritter), jetzt + 120_000)
    const l: AgentListe = { praxis: e }
    for (const s of [erster, zweiter, dritter]) expect(schluesselPasst(l, 'praxis', s, jetzt + 180_000)).toBe(true)
    expect(schluesselPasst(l, 'praxis', erster, jetzt + (FRUEHER_TAGE + 1) * 86_400_000)).toBe(false)
    expect(schluesselPasst(l, 'praxis', dritter, jetzt + (FRUEHER_TAGE + 1) * 86_400_000)).toBe(true)
    expect(schluesselPasst(l, 'andere', erster, jetzt)).toBe(false)
    expect(schluesselPasst({ praxis: { ...e, hash: schluesselHash(dritter), frueher: [] } }, 'praxis', erster, jetzt)).toBe(false)
  })

  it('gibt Adressen und Domains frei', () => {
    expect(emailErlaubt(liste, 'praxis', 'Chefin@Praxis.de')).toBe(true)
    expect(emailErlaubt(liste, 'praxis', 'zfa@team-praxis.de')).toBe(true)
    expect(emailErlaubt(liste, 'praxis', 'zfa@praxis.de')).toBe(false)
    expect(emailErlaubt(liste, 'andere', 'chefin@praxis.de')).toBe(false)
  })
})

describe('Cloudflare Access', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1' }
  const cfg = { team: 'pickadoc', aud: 'a'.repeat(64) }
  const jetzt = Date.UTC(2026, 9, 12, 12)
  const token = (inhalt: Record<string, unknown>, kid = 'k1') => {
    const teil = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const kopf = `${teil({ alg: 'RS256', kid })}.${teil(inhalt)}`
    return `${kopf}.${sign('RSA-SHA256', Buffer.from(kopf), privateKey).toString('base64url')}`
  }
  const gueltig = { aud: [cfg.aud], iss: 'https://pickadoc.cloudflareaccess.com', exp: jetzt / 1000 + 600, email: 'chefin@praxis.de' }
  const pruefen = (t: string) => accessPruefen(t, cfg, async () => [jwk], jetzt)

  it('liest die Anmeldung aus einem echten Token', async () => {
    expect(await pruefen(token(gueltig))).toEqual({ email: 'chefin@praxis.de', dienst: undefined })
    expect(await pruefen(token({ ...gueltig, email: undefined, common_name: 'abc.access' }))).toEqual({ email: undefined, dienst: 'abc.access' })
  })

  it('lehnt falsche Anwendung, falsches Team, Ablauf und Fälschung ab', async () => {
    expect(await pruefen(token({ ...gueltig, aud: ['b'.repeat(64)] }))).toBeNull()
    expect(await pruefen(token({ ...gueltig, iss: 'https://fremd.cloudflareaccess.com' }))).toBeNull()
    expect(await pruefen(token({ ...gueltig, exp: jetzt / 1000 - 120 }))).toBeNull()
    expect(await pruefen(token(gueltig, 'k2'))).toBeNull()
    const [k, , s] = token(gueltig).split('.')
    const anders = Buffer.from(JSON.stringify({ ...gueltig, email: 'fremd@x.de' })).toString('base64url')
    expect(await pruefen(`${k}.${anders}.${s}`)).toBeNull()
    expect(await pruefen('kein.token')).toBeNull()
  })
})

describe('Auftragswarteschlange', () => {
  it('reicht Aufträge an den wartenden Agenten und die Antwort zurück', async () => {
    const hub = new AgentHub()
    const abgeholt = hub.abholen('praxis', 1000, { pvs: 'dampsoft' })
    expect(hub.verbunden('praxis')?.pvs).toBe('dampsoft')
    const ergebnis = hub.rufen('praxis', { method: 'GET', pfad: '/patients?q=muster', ms: 1000 })
    const a = await abgeholt
    expect(a?.pfad).toBe('/patients?q=muster')
    expect(hub.antworten('andere', a!.id, { ok: true, status: 200, daten: {} })).toBe(false)
    expect(hub.antworten('praxis', a!.id, { ok: true, status: 200, daten: { items: [] } })).toBe(true)
    expect(await ergebnis).toEqual({ ok: true, status: 200, daten: { items: [] } })
  })

  it('hält Aufträge vor, bis der Agent abholt, und gibt leer zurück, wenn nichts kommt', async () => {
    const hub = new AgentHub()
    const ergebnis = hub.rufen('praxis', { method: 'GET', pfad: '/patients/1/hkps', ms: 1000 })
    const a = await hub.abholen('praxis', 1000)
    hub.antworten('praxis', a!.id, { ok: false, status: 404, daten: { error: 'x' } })
    expect((await ergebnis).status).toBe(404)
    expect(await hub.abholen('praxis', 10)).toBeNull()
    expect(hub.verbunden('andere')).toBeNull()
  })

  it('stellt einen Auftrag zurück, wenn der Abholer weg ist', async () => {
    const hub = new AgentHub()
    const ergebnis = hub.rufen('praxis', { method: 'GET', pfad: '/patients/2/clinical', ms: 1000 })
    const verloren = await hub.abholen('praxis', 1000)
    hub.zurueckstellen('praxis', verloren!)
    const neu = await hub.abholen('praxis', 1000)
    expect(neu?.id).toBe(verloren!.id)
    hub.antworten('praxis', neu!.id, { ok: true, status: 200, daten: {} })
    expect((await ergebnis).ok).toBe(true)
  })

  it('bricht einen langen Auftrag früh ab, wenn die Bridge ihn nicht abholt', async () => {
    const hub = new AgentHub(30)
    const start = Date.now()
    await expect(hub.rufen('praxis', { method: 'GET', pfad: '/praxis/katalog', ms: 540_000 })).rejects.toThrow('nicht_abgeholt')
    expect(Date.now() - start).toBeLessThan(1000)
    expect(await hub.abholen('praxis', 10)).toBeNull()
  })

  it('lässt einen abgeholten Auftrag laufen, auch wenn er länger als die Abholfrist braucht', async () => {
    const hub = new AgentHub(20)
    const ergebnis = hub.rufen('praxis', { method: 'GET', pfad: '/praxis/katalog', ms: 540_000 })
    const a = await hub.abholen('praxis', 1000)
    await new Promise((r) => setTimeout(r, 60))
    expect(hub.antworten('praxis', a!.id, { ok: true, status: 200, daten: {} })).toBe(true)
    expect((await ergebnis).ok).toBe(true)
  })

  it('startet die Abholfrist neu, wenn ein Auftrag zurückgestellt wird', async () => {
    const hub = new AgentHub(30)
    const ergebnis = hub.rufen('praxis', { method: 'GET', pfad: '/praxis/katalog', ms: 540_000 })
    const verloren = await hub.abholen('praxis', 1000)
    await new Promise((r) => setTimeout(r, 50))
    hub.zurueckstellen('praxis', verloren!)
    await expect(ergebnis).rejects.toThrow('nicht_abgeholt')
  })
})

describe('erlaubte Connector-Aufrufe', () => {
  it('lässt nur Patientensuche, HKP-Liste, HKP lesen und HKP anlegen durch', () => {
    expect(auftragErlaubt('GET', '/patients?q=m%C3%BCller&limit=100')).toBe(true)
    expect(auftragErlaubt('GET', '/patients/12/hkps')).toBe(true)
    expect(auftragErlaubt('GET', '/patients/2/clinical')).toBe(true)
    expect(auftragErlaubt('GET', '/patients/0/hkps/13/planr')).toBe(true)
    expect(auftragErlaubt('GET', '/praxis/katalog')).toBe(true)
    expect(auftragErlaubt('POST', '/praxis/katalog')).toBe(false)
    expect(auftragErlaubt('POST', '/patients/0/hkps/import')).toBe(true)
    expect(auftragErlaubt('POST', '/patients/2/hkps')).toBe(true)
    expect(auftragErlaubt('GET', '/patients/2/../../admin')).toBe(false)
    expect(auftragErlaubt('POST', '/patients')).toBe(false)
    expect(auftragErlaubt('GET', '/dashboard')).toBe(false)
    expect(auftragErlaubt('DELETE', '/appointments/1')).toBe(false)
  })
})

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crc32, zipMitDatei } from './zipAnhang.ts'

const LEER = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)])

describe('zipMitDatei', () => {
  it('CRC-32 wie zlib', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })

  it('hängt Dateien an und das ZIP bleibt lesbar', () => {
    let zip = zipMitDatei(LEER, 'PlanR-Bridge/LIESMICH.txt', Buffer.from('Hallo'))
    zip = zipMitDatei(zip, 'PlanR-Bridge/programm/agent/einrichtung.json', Buffer.from('{"mandant":"p-test","praxis":"Zahnarztpraxis Müller"}'))
    const e = zip.length - 22
    expect(zip.readUInt32LE(e)).toBe(0x06054b50)
    expect(zip.readUInt16LE(e + 10)).toBe(2)
    expect(zip.readUInt32LE(e + 16) + zip.readUInt32LE(e + 12)).toBe(e)
    if (process.platform !== 'win32') return
    // Windows bringt bsdtar mit, das ZIPs liest: echte Gegenprobe
    const ordner = mkdtempSync(join(tmpdir(), 'zip-'))
    try {
      writeFileSync(join(ordner, 'p.zip'), zip)
      execFileSync('tar', ['-xf', 'p.zip'], { cwd: ordner })
      expect(readFileSync(join(ordner, 'PlanR-Bridge', 'programm', 'agent', 'einrichtung.json'), 'utf8')).toContain('Müller')
      expect(readFileSync(join(ordner, 'PlanR-Bridge', 'LIESMICH.txt'), 'utf8')).toBe('Hallo')
    } finally {
      rmSync(ordner, { recursive: true, force: true })
    }
  })

  it('lehnt Nicht-ZIPs ab', () => {
    expect(() => zipMitDatei(Buffer.from('kein zip'), 'a', Buffer.from('b'))).toThrow()
  })
})

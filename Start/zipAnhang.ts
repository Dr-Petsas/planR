/**
 * Eine Datei an ein fertiges ZIP anhängen (unkomprimiert), ohne es auszupacken – für das persönliche
 * Bridge-Paket (einrichtung.json). Erwartet ein ZIP ohne ZIP64 und ohne Kommentar, wie Compress-Archive es baut.
 */

const TABELLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(daten: Uint8Array): number {
  let c = 0xffffffff
  for (const b of daten) c = TABELLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosZeit(d: Date): { zeit: number; datum: number } {
  return {
    zeit: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    datum: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export function zipMitDatei(zip: Buffer, name: string, inhalt: Buffer, jetzt = new Date()): Buffer {
  let e = zip.length - 22
  while (e >= 0 && zip.readUInt32LE(e) !== 0x06054b50) e--
  if (e < 0) throw new Error('Kein ZIP (Verzeichnisende fehlt).')
  const anzahl = zip.readUInt16LE(e + 10)
  const cdGroesse = zip.readUInt32LE(e + 12)
  const cdStart = zip.readUInt32LE(e + 16)
  if (anzahl === 0xffff || cdStart === 0xffffffff || cdStart + cdGroesse !== e) throw new Error('ZIP-Aufbau wird nicht unterstützt.')
  const n = Buffer.from(name, 'utf8')
  const crc = crc32(inhalt)
  const { zeit, datum } = dosZeit(jetzt)

  const lokal = Buffer.alloc(30)
  lokal.writeUInt32LE(0x04034b50, 0)
  lokal.writeUInt16LE(20, 4)
  lokal.writeUInt16LE(0x0800, 6)
  lokal.writeUInt16LE(0, 8)
  lokal.writeUInt16LE(zeit, 10)
  lokal.writeUInt16LE(datum, 12)
  lokal.writeUInt32LE(crc, 14)
  lokal.writeUInt32LE(inhalt.length, 18)
  lokal.writeUInt32LE(inhalt.length, 22)
  lokal.writeUInt16LE(n.length, 26)
  lokal.writeUInt16LE(0, 28)

  const zentral = Buffer.alloc(46)
  zentral.writeUInt32LE(0x02014b50, 0)
  zentral.writeUInt16LE(20, 4)
  zentral.writeUInt16LE(20, 6)
  zentral.writeUInt16LE(0x0800, 8)
  zentral.writeUInt16LE(0, 10)
  zentral.writeUInt16LE(zeit, 12)
  zentral.writeUInt16LE(datum, 14)
  zentral.writeUInt32LE(crc, 16)
  zentral.writeUInt32LE(inhalt.length, 20)
  zentral.writeUInt32LE(inhalt.length, 24)
  zentral.writeUInt16LE(n.length, 28)
  zentral.writeUInt32LE(cdStart, 42)

  const ende = Buffer.from(zip.subarray(e, e + 22))
  ende.writeUInt16LE(anzahl + 1, 8)
  ende.writeUInt16LE(anzahl + 1, 10)
  ende.writeUInt32LE(cdGroesse + 46 + n.length, 12)
  ende.writeUInt32LE(cdStart + 30 + n.length + inhalt.length, 16)
  return Buffer.concat([zip.subarray(0, cdStart), lokal, n, inhalt, zip.subarray(cdStart, e), zentral, n, ende])
}

import { textZeilen, type TextStueck } from './eigenlabor'

/** Text einer PDF-Datei zeilenweise; läuft vollständig im Browser */
export async function pdfZeilen(daten: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const aufgabe = pdfjs.getDocument({ data: new Uint8Array(daten) })
  const doc = await aufgabe.promise
  const zeilen: string[] = []
  for (let s = 1; s <= doc.numPages; s++) {
    const inhalt = await (await doc.getPage(s)).getTextContent()
    const stuecke: TextStueck[] = []
    for (const i of inhalt.items) {
      if (!('str' in i)) continue
      stuecke.push({ str: i.str, x: i.transform[4], y: i.transform[5], breite: i.width, hoehe: i.height || Math.abs(i.transform[3]) })
    }
    zeilen.push(...textZeilen(stuecke))
  }
  await aufgabe.destroy()
  return zeilen
}

/** PDF, CSV oder Text in Zeilen */
export async function dateiZeilen(datei: File): Promise<string[]> {
  const buf = await datei.arrayBuffer()
  if (datei.name.toLowerCase().endsWith('.pdf') || datei.type === 'application/pdf') return pdfZeilen(buf)
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buf)
  return text.replace(/^\uFEFF/, '').split(/\r?\n/)
}

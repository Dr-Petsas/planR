/**
 * Die Vorschau (.kv-blatt) als A4-PDF: jedes Blatt in einer Kopie auf 210 mm Breite, längere Blätter werden
 * an einer weißen Zeile auf Folgeseiten umbrochen. Bibliotheken erst beim Versenden laden.
 */
const A4_B = 210
const A4_H = 297

/** Zeile ohne Druck (fast weiß) knapp oberhalb von `bis`, damit keine Textzeile zerschnitten wird */
function weisseZeile(ctx: CanvasRenderingContext2D, breite: number, von: number, bis: number): number {
  const suchen = Math.min(bis - von, Math.round((bis - von) * 0.18))
  const streifen = ctx.getImageData(0, bis - suchen, breite, suchen).data
  for (let y = suchen - 1; y >= 0; y--) {
    let leer = true
    for (let x = 0; x < breite && leer; x += 3) {
      const i = (y * breite + x) * 4
      if (streifen[i] < 235 || streifen[i + 1] < 235 || streifen[i + 2] < 235) leer = false
    }
    if (leer) return bis - suchen + y
  }
  return bis
}

export async function pdfAusVorschau(seiten: HTMLElement[]): Promise<{ blob: Blob; base64: string }> {
  if (!seiten.length) throw new Error('Keine Seite in der Vorschau.')
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  let neueSeite = false
  for (const blatt of seiten) {
    const canvas = await html2canvas(blatt, {
      scale: 2, backgroundColor: '#ffffff', logging: false, windowWidth: 1400,
      onclone: (_doc, kopie) => Object.assign(kopie.style, { width: `${A4_B}mm`, minHeight: `${A4_H}mm`, margin: '0', boxShadow: 'none', transform: 'none' }),
    })
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Das PDF ließ sich nicht zeichnen.')
    const pxJeMm = canvas.width / A4_B
    const seitePx = Math.floor(A4_H * pxJeMm)
    for (let y = 0; y < canvas.height - 2 * pxJeMm;) {
      const ende = canvas.height - y <= seitePx ? canvas.height : weisseZeile(ctx, canvas.width, y, y + seitePx)
      const teil = document.createElement('canvas')
      teil.width = canvas.width
      teil.height = ende - y
      teil.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, ende - y, 0, 0, canvas.width, ende - y)
      if (neueSeite) pdf.addPage()
      neueSeite = true
      pdf.addImage(teil.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, A4_B, (ende - y) / pxJeMm, undefined, 'FAST')
      y = ende
    }
  }
  const blob = pdf.output('blob')
  return { blob, base64: await blobBase64(blob) }
}

const blobBase64 = (b: Blob) => new Promise<string>((ok, fehler) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).split(',')[1] ?? '')
  r.onerror = () => fehler(r.error)
  r.readAsDataURL(b)
})

/** Datei im Browser herunterladen */
export function herunterladen(inhalt: Blob, name: string) {
  const url = URL.createObjectURL(inhalt)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

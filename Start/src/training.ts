/**
 * KI-Training auf der Übersicht: HKPs hochladen und die praxiseigenen Positionen mit Preis zeigen.
 * Daraus werden feste Regeln. Clara sucht in diesen Listen, sie erfindet keine Nummer und keinen Preis.
 */
import './einrichtung.css'
import type { FallAnsicht } from './fallkatalog'
import { planAusPdf } from './hkpPdf'
import type { BelZeile, EigenZeile, GozZeile, PraxisKatalog } from '../praxiskatalog.ts'
import { MATERIAL, materialAbschnitte, materialSuchtext, type MaterialPosten } from '../../Implantologie/Privat-Impl/src/data/material'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
const faktorText = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** GOZ-Punktwert 2012, wenn das Praxisprogramm nur Punkte und keinen Eurobetrag liefert. */
const PUNKTWERT = 0.0562421

export const istAnalog = (g: Pick<GozZeile, 'eigen' | 'analogZu' | 'nr' | 'text' | 'druckNr'>) =>
  g.eigen || !!g.analogZu || !!analogZiel(g)

/** 9100a, Drucknummer 9100 oder Textanfang „2330 analog“. */
export function analogZiel(g: Pick<GozZeile, 'analogZu' | 'nr' | 'text' | 'druckNr'>): string {
  if (g.analogZu) return g.analogZu
  if (g.druckNr && /^\d{4}$/.test(g.druckNr)) return g.druckNr
  const nr = /^(\d{4})a$/i.exec(g.nr)
  if (nr) return nr[1]
  const text = /^(\d{4})\s+analog\b/i.exec(g.text)
  return text ? text[1] : ''
}

export function gozPreis(g: Pick<GozZeile, 'betrag' | 'punkte' | 'faktor'>): number | null {
  if (g.betrag && g.betrag > 0) return g.betrag
  if (g.punkte > 0) return Math.round(g.punkte * PUNKTWERT * (g.faktor || 2.3) * 100) / 100
  return null
}

export const laborZeilen = (liste: EigenZeile[]) => liste.filter((e) => !e.material)
export const materialZeilen = (liste: EigenZeile[]) => liste.filter((e) => !!e.material)

export const LABOR_GRUPPEN = [
  'CAD und Scan', 'Modelle', 'Stümpfe und Vorbereitung', 'Aufbauten', 'Artikulation',
  'Implantatplanung', 'Löffel, Basen, Biss', 'Schablonen', 'Provisorien', 'Kronen', 'Brücken',
  'Inlays und Onlays', 'Verblendung', 'Teleskope und Stege', 'Modellguss', 'Verbindung',
  'Prothese', 'Schienen', 'Zuschläge und Versand', 'Sonstiges',
] as const

/** BEB-Kapitel. CAD und Scan zuerst, damit 0901 nicht in der Implantatplanung landet. */
export function laborGruppe(e: { nr: string; text: string }): (typeof LABOR_GRUPPEN)[number] {
  const t = e.text.toLowerCase()
  if (/^cad\b/.test(t) || /oralscan|\bscan\b|sintern|digitaldruck|cam element|präp freilegen|zirkon\/lithium/.test(t) || /^(09|90)/.test(e.nr) || e.nr === '0032' || e.nr === '9300') return 'CAD und Scan'
  const n = Number(e.nr)
  const band = (von: number, bis: number) => Number.isFinite(n) && n >= von && n <= bis
  if (band(0, 99)) return 'Modelle'
  if (band(100, 399)) return 'Stümpfe und Vorbereitung'
  if (band(400, 599)) return 'Artikulation'
  if (band(700, 799)) return 'Zuschläge und Versand'
  if (band(800, 899)) return 'Implantatplanung'
  if (band(1000, 1199)) return 'Löffel, Basen, Biss'
  if (band(1200, 1399)) return 'Schablonen'
  if (band(1400, 1999)) return 'Provisorien'
  if (band(2000, 2099)) return 'Aufbauten'
  if (band(2100, 2299)) return 'Kronen'
  if (band(2300, 2499)) return 'Brücken'
  if (band(2500, 2599)) return 'Inlays und Onlays'
  if (band(2600, 2999)) return 'Verblendung'
  if (band(3000, 3699)) return 'Teleskope und Stege'
  if (band(4000, 4999)) return 'Modellguss'
  if (band(5000, 5999)) return 'Verbindung'
  if (band(6000, 6999) || band(8000, 8999)) return 'Prothese'
  if (band(7000, 7999)) return 'Schienen'
  return 'Sonstiges'
}

export const MATERIAL_GRUPPEN = [
  'Knochen und Membran', 'Legierungen', 'Abformung', 'Konfektionszähne', 'Implantatteile', 'Stifte und Pfosten', 'Verbrauch',
] as const

/** Lesbare Sorte statt der DS-Win-Kürzels ab/f/z/m. */
export function materialGruppe(e: Pick<EigenZeile, 'nr' | 'text' | 'material' | 'werkstoff'>): (typeof MATERIAL_GRUPPEN)[number] {
  const t = `${e.text} ${e.werkstoff ?? ''}`.toLowerCase()
  if (/membran|knochen|augment|bio-?oss|mesh|gitter|kollagen/.test(t)) return 'Knochen und Membran'
  if (/zeramex|straumann|locator|abutment|gingivaformer|laboranalog|implantat/.test(t)) return 'Implantatteile'
  if (/alginat|impregum|xantropren|abform|futar|registrier/.test(t) || e.material === 'ab') return 'Abformung'
  if (/frontzahn|seitenzahn|bioplus|vita/.test(t)) return 'Konfektionszähne'
  if (/stift|pfosten|\bpost\b/.test(t)) return 'Stifte und Pfosten'
  if (e.material === 'm' || /begopal|realor|palliag|stabilor|\bdeva\b|\bnem\b/.test(t)) return 'Legierungen'
  return 'Verbrauch'
}

export const GOZ_GRUPPEN = ['Aufbau und Augmentation', 'Funktionsanalyse', 'Zahnersatz', 'Chirurgie', 'Konservierend', 'Prophylaxe und Parodont', 'Allgemein'] as const

export function gozGruppe(nr: string): (typeof GOZ_GRUPPEN)[number] {
  const n = parseInt(nr, 10)
  if (!Number.isFinite(n)) return 'Allgemein'
  if (n >= 9000) return 'Aufbau und Augmentation'
  if (n >= 8000) return 'Funktionsanalyse'
  if (n >= 5000) return 'Zahnersatz'
  if (n >= 3000) return 'Chirurgie'
  if (n >= 2000) return 'Konservierend'
  if (n >= 1000) return 'Prophylaxe und Parodont'
  return 'Allgemein'
}

/** Jedes Wort für sich: „CAD CAM Scan“ trifft CAD, CAM und Scan. */
const trifft = (filter: string, teile: string[]) => {
  const woerter = filter.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!woerter.length) return true
  const text = teile.join(' ').toLowerCase()
  return woerter.some((w) => text.includes(w))
}

export type TrainAnsicht = 'wahl' | 'hkp' | 'listen'

type Gruppe = { titel: string; zeilen: string[][]; vorschau: string[] }
type Block = { id: string; mark: string; titel: string; text: string; kopf: string[]; gruppen: Gruppe[]; leer: string }

export function trainingHtml(a: {
  admin: boolean
  filter: string
  katalog: PraxisKatalog | null
  faelle: (FallAnsicht & { clara?: boolean }) | null
  hinweis: string
  laeuft: boolean
  ansicht?: TrainAnsicht
  bereich?: string
  gruppe?: string
  hkpGruppe?: string
}): string {
  const ansicht = a.ansicht ?? 'wahl'
  const nachNr = (x: { nr: string }, y: { nr: string }) => x.nr.localeCompare(y.nr, 'de', { numeric: true })
  const goz = (a.katalog?.goz ?? []).filter(istAnalog).filter((g) => trifft(a.filter, [g.nr, g.text, g.analogZu ?? '', g.kuerzel ?? '', g.druckNr ?? ''])).sort(nachNr)
  const labor = laborZeilen(a.katalog?.eigenlabor ?? []).filter((e) => trifft(a.filter, [e.nr, e.text, e.ersetzt ?? ''])).sort(nachNr)
  const material = materialZeilen(a.katalog?.eigenlabor ?? []).filter((e) => trifft(a.filter, [e.nr, e.text, e.material ?? '', e.werkstoff ?? ''])).sort(nachNr)
  const bel = (a.katalog?.bel ?? []).filter((e) => trifft(a.filter, [e.nr, e.text])).sort(nachNr)
  const knochen = MATERIAL.filter((m) => trifft(a.filter, [materialSuchtext(m)]))
  const suche = a.filter.trim().length > 0
  if (ansicht === 'wahl') return wahlHtml(a, goz.length, labor.length)
  if (ansicht === 'hkp') return hkpHtml(a)
  return listenHtml(a, a.katalog, goz, labor, material, bel, knochen, suche)
}

function wahlHtml(a: { faelle: (FallAnsicht & { clara?: boolean }) | null; katalog: PraxisKatalog | null }, analog: number, labor: number): string {
  const plaene = a.faelle ? `${a.faelle.ist} von ${a.faelle.soll} Plänen` : 'Pläne werden geladen'
  const regeln = a.faelle?.regeln ? ` · ${a.faelle.regeln} Regeln` : ''
  const preise = a.katalog ? `${analog} Analog · ${labor} Labor` : 'Preise noch nicht übernommen'
  return `
    <p class="train-einleitung">Clara erfindet hier keine Nummer und keinen Preis. Ein hochgeladener HKP wird zur Regel, sobald dieselbe Position in mindestens zwei Plänen derselben Art steht. Die Analog- und Laborpositionen kommen aus dem Praxisprogramm.</p>
    <div class="train-kacheln">
      <button type="button" class="train-kachel" data-ansicht="hkp">
        <span class="train-kachel-mark" aria-hidden="true">HKP</span>
        <b>HKPs hochladen</b>
        <small>Je Behandlungsart ein Plan als PDF. Namen, Kasse und Beträge werden nicht gespeichert.</small>
        <em>${esc(plaene + regeln)}</em>
      </button>
      <button type="button" class="train-kachel" data-ansicht="listen">
        <span class="train-kachel-mark" aria-hidden="true">GOZ</span>
        <b>Analog- und Laborpositionen</b>
        <small>Die praxiseigenen Nummern mit Preis: Analogziffern, Eigenlabor, Material und BEL.</small>
        <em>${esc(preise)}</em>
      </button>
    </div>`
}

const zurueckKnopf = (tief: boolean) =>
  `<button type="button" class="train-zurueck" data-zurueck>${tief ? 'Zurück' : 'Zur Übersicht'}</button>`

function kacheln(liste: { attr: string; mark: string; titel: string; text: string; em: string }[]): string {
  return `<div class="train-kacheln train-kacheln-dicht">${liste.map((k) => `
    <button type="button" class="train-kachel" ${k.attr}>
      <span class="train-kachel-mark" aria-hidden="true">${esc(k.mark)}</span>
      <b>${esc(k.titel)}</b>
      <small>${esc(k.text)}</small>
      <em>${esc(k.em)}</em>
    </button>`).join('')}</div>`
}

function hkpHtml(a: { admin: boolean; faelle: (FallAnsicht & { clara?: boolean }) | null; hinweis: string; laeuft: boolean; hkpGruppe?: string }): string {
  if (!a.faelle) return `${zurueckKnopf(false)}<section class="train-block" id="train-hkp"><h3>HKPs</h3><p class="ein-warte"><span class="ein-punkt"></span> Wird geladen …</p></section>`
  const clara = a.faelle.regeln
    ? a.faelle.clara
      ? `Clara kennt die ${a.faelle.regeln} Praxisregeln.`
      : `${a.faelle.regeln} Praxisregeln liegen bereit. Clara holt sie nach, sobald die Verbindung steht.`
    : 'Eine Regel entsteht, sobald dieselbe Position in mindestens zwei Plänen derselben Art steht.'
  const gruppen = new Map<string, typeof a.faelle.zeilen>()
  for (const z of a.faelle.zeilen) gruppen.set(z.gruppe, [...(gruppen.get(z.gruppe) ?? []), z])
  const gewaehlt = a.hkpGruppe ? gruppen.get(a.hkpGruppe) : undefined
  const kopf = `${zurueckKnopf(!!gewaehlt)}
    <h3>HKPs <small>${a.faelle.ist} von ${a.faelle.soll}</small></h3>
    <p class="ein-text">${gewaehlt ? esc(a.hkpGruppe || '') + '. ' : ''}Je Art ein HKP als PDF. Namen, Kasse und Beträge werden nicht gespeichert. ${esc(clara)}</p>
    ${a.hinweis ? `<p class="ein-ok">${esc(a.hinweis)}</p>` : ''}`
  if (!gewaehlt) {
    const karten = [...gruppen].map(([name, zeilen]) => ({
      attr: `data-hkp-gruppe="${esc(name)}"`,
      mark: String(zeilen.filter((z) => z.fertig).length),
      titel: name,
      text: zeilen.slice(0, 2).map((z) => z.titel).join(', '),
      em: `${zeilen.reduce((n, z) => n + z.ist, 0)} von ${zeilen.reduce((n, z) => n + z.soll, 0)}`,
    }))
    return `${kopf}${kacheln(karten)}`
  }
  const liste = gewaehlt.map((z) => `<div class="ein-fall" title="${esc(z.hinweis)}">
      <span class="${z.fertig ? 'haken' : 'offen'}" aria-label="${z.fertig ? 'vollständig' : 'offen'}">${z.fertig ? '✓' : ''}</span>
      <span><b>${esc(z.titel)}</b><small>${z.ist} von ${z.soll}</small></span>
      ${a.admin
        ? `<button type="button" class="import-knopf" data-fall="${esc(z.id)}"${a.laeuft ? ' disabled' : ''}>Hochladen</button>
           ${z.ist ? `<button type="button" class="link-knopf" data-fall-weg="${esc(z.id)}"${a.laeuft ? ' disabled' : ''}>letzten entfernen</button>` : '<span></span>'}`
        : '<span></span><span></span>'}
    </div>`).join('')
  return `${kopf}<div class="train-zebra">${liste}</div>
    <p class="ein-klein">${a.admin ? 'Ein Haken heißt: die Sollzahl dieser Art ist erreicht.' : 'Ansehen kann jede angemeldete Person, hochladen der Praxis-Admin.'}</p>`
}

function listenHtml(
  a: { filter: string; katalog: PraxisKatalog | null; bereich?: string; gruppe?: string },
  katalog: PraxisKatalog | null, goz: GozZeile[], labor: EigenZeile[], material: EigenZeile[], bel: BelZeile[], knochen: MaterialPosten[], suche: boolean,
): string {
  const bloecke = listenBloecke(katalog, goz, labor, material, bel, knochen)
  const sucheFeld = `<label class="feld train-suche">Suche
      <input type="search" data-train-suche value="${esc(a.filter)}" placeholder="z. B. 9100a, CAD Scan, Bio-Oss" autocomplete="off">
    </label>`
  if (suche) {
    const treffer = bloecke.filter((b) => b.gruppen.length).map((b) => `
      <section class="train-block"><h3>${esc(b.titel)} <small>${b.gruppen.reduce((n, g) => n + g.zeilen.length, 0)}</small></h3>
      ${b.gruppen.map((g) => `<h4 class="train-unter">${esc(g.titel)}</h4>${tabelle(b.kopf, g.zeilen)}`).join('')}</section>`).join('')
    return `${zurueckKnopf(true)}${sucheFeld}${treffer || '<p class="ein-klein">Nichts passt zur Suche.</p>'}`
  }
  const bereich = bloecke.find((b) => b.id === a.bereich)
  if (!bereich) {
    return `${zurueckKnopf(false)}${sucheFeld}${kacheln(bloecke.map((b) => ({
      attr: `data-bereich="${esc(b.id)}"`,
      mark: b.mark,
      titel: b.titel,
      text: b.gruppen.slice(0, 3).map((g) => g.titel).join(', ') || b.leer,
      em: `${b.gruppen.reduce((n, g) => n + g.zeilen.length, 0)} Positionen`,
    })))}${katalog ? `<p class="ein-klein">Stand ${esc(new Date(katalog.stand).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))} aus ${esc(katalog.pvs)}.</p>` : ''}`
  }
  const gruppe = bereich.gruppen.find((g) => g.titel === a.gruppe)
  if (!gruppe) {
    if (!bereich.gruppen.length) return `${zurueckKnopf(true)}<h3>${esc(bereich.titel)}</h3><p class="ein-text">${esc(bereich.leer)}</p>`
    return `${zurueckKnopf(true)}<h3>${esc(bereich.titel)}</h3>${sucheFeld}${kacheln(bereich.gruppen.map((g) => ({
      attr: `data-bereich="${esc(bereich.id)}" data-gruppe="${esc(g.titel)}"`,
      mark: String(g.zeilen.length),
      titel: g.titel,
      text: g.vorschau.slice(0, 2).join(', '),
      em: `${g.zeilen.length} Positionen`,
    })))}`
  }
  return `${zurueckKnopf(true)}<h3>${esc(bereich.titel)} · ${esc(gruppe.titel)} <small>${gruppe.zeilen.length}</small></h3>${sucheFeld}${tabelle(bereich.kopf, gruppe.zeilen)}`
}

function listenBloecke(katalog: PraxisKatalog | null, goz: GozZeile[], labor: EigenZeile[], material: EigenZeile[], bel: BelZeile[], knochen: MaterialPosten[]): Block[] {
  const ohne = 'Noch keine Preise aus dem Praxisprogramm. Unter Einrichtung werden sie übernommen.'
  const gozGruppen = katalog ? nachGruppe(goz, (g) => gozGruppe(g.nr), GOZ_GRUPPEN).map((g) => ({
    titel: g.titel,
    vorschau: g.zeilen.map((z) => z.nr),
    zeilen: g.zeilen.map((z) => {
      const preis = gozPreis(z)
      return [z.nr, analogZiel(z) || '—', z.text, faktorText(z.faktor || 2.3), preis == null ? '—' : euro(preis)]
    }),
  })) : []
  const laborGruppen = katalog ? nachGruppe(labor, laborGruppe, LABOR_GRUPPEN).map((g) => ({
    titel: g.titel, vorschau: g.zeilen.map((z) => z.text), zeilen: g.zeilen.map((z) => [z.nr, z.ersetzt || '—', z.text, euro(z.preis)]),
  })) : []
  const materialGruppen = katalog ? nachGruppe(material, materialGruppe, MATERIAL_GRUPPEN).map((g) => ({
    titel: g.titel, vorschau: g.zeilen.map((z) => z.text), zeilen: g.zeilen.map((z) => [z.nr, [z.text, z.werkstoff].filter(Boolean).join(' · '), euro(z.preis)]),
  })) : []
  const belGruppen = katalog ? nachGruppe(bel, laborGruppe, LABOR_GRUPPEN).map((g) => ({
    titel: g.titel, vorschau: g.zeilen.map((z) => z.text), zeilen: g.zeilen.map((z) => [z.nr, z.text, euro(z.preis)]),
  })) : []
  const knochenGruppen = materialAbschnitte(knochen).map((g) => ({
    titel: g.titel, vorschau: g.zeilen.map((m) => m.produkt), zeilen: g.zeilen.map((m) => [m.produkt, m.titel, m.einheit, euro(m.preis)]),
  }))
  return [
    { id: 'goz', mark: 'GOZ', titel: 'GOZ, analog', text: '', kopf: ['Nummer', 'analog zu', 'Leistung', 'Faktor', 'Preis'], gruppen: gozGruppen, leer: katalog ? 'Keine eigene GOZ- oder Analogposition.' : ohne },
    { id: 'labor', mark: 'Labor', titel: katalog?.listeName ? `Eigenlabor · ${katalog.listeName}` : 'Eigenlabor', text: '', kopf: ['Nummer', 'ersetzt', 'Leistung', 'Preis'], gruppen: laborGruppen, leer: katalog ? 'Keine Eigenlaborposition mit Preis.' : ohne },
    { id: 'material', mark: 'Mat', titel: 'Material', text: '', kopf: ['Nummer', 'Leistung', 'Preis'], gruppen: materialGruppen, leer: katalog ? 'Keine Materialposition mit Preis.' : ohne },
    { id: 'knochen', mark: 'Knochen', titel: 'Knochen und Titan', text: '', kopf: ['Produkt', 'Art', 'Einheit', 'Preis'], gruppen: knochenGruppen, leer: 'Keine Augmentationspreise.' },
    { id: 'bel', mark: 'BEL', titel: katalog?.belListeName ? `BEL · ${katalog.belListeName}` : 'BEL, Kasse', text: '', kopf: ['Nummer', 'Leistung', 'Preis'], gruppen: belGruppen, leer: katalog ? 'Keine BEL-Position der Praxis mit Preis.' : ohne },
  ]
}

function nachGruppe<T>(zeilen: T[], gruppe: (z: T) => string, reihenfolge: readonly string[]) {
  return reihenfolge.map((titel) => ({ titel, zeilen: zeilen.filter((z) => gruppe(z) === titel) })).filter((g) => g.zeilen.length)
}

function tabelle(kopf: string[], zeilen: string[][]): string {
  if (!zeilen.length) return ''
  const letzte = kopf.length - 1
  return `<div class="train-scroll"><table class="train-tab">
    <thead><tr>${kopf.map((k, i) => `<th${i === letzte ? ' class="preis"' : ''}>${esc(k)}</th>`).join('')}</tr></thead>
    <tbody>${zeilen.map((z) => `<tr>${z.map((w, i) => `<td${i === letzte ? ' class="preis"' : ''}>${esc(w)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`
}

/** Fenster über der Planliste. */
export function trainingOeffnen(o: { admin: boolean }) {
  document.querySelector('.train-schleier')?.remove()
  let ansicht: TrainAnsicht = 'wahl'
  let bereich = ''
  let gruppe = ''
  let hkpGruppe = ''
  let filter = ''
  let katalog: PraxisKatalog | null = null
  let faelle: (FallAnsicht & { clara?: boolean }) | null = null
  let hinweis = ''
  let meldung = ''
  let laeuft = false
  let zielSlot = ''
  const dateiFeld = Object.assign(document.createElement('input'), { type: 'file', accept: '.pdf,application/pdf', hidden: true })
  document.body.append(dateiFeld)

  const schleier = document.createElement('div')
  schleier.className = 'ein-schleier train-schleier'
  document.body.append(schleier)
  const zu = () => {
    dateiFeld.remove()
    schleier.remove()
    removeEventListener('keydown', taste)
  }
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu() }
  addEventListener('keydown', taste)
  schleier.addEventListener('click', (e) => { if (e.target === schleier) zu() })

  const zeichnen = () => {
    const suche = schleier.querySelector<HTMLInputElement>('[data-train-suche]')
    const cursor = suche && document.activeElement === suche ? suche.selectionStart : null
    schleier.innerHTML = `
      <div class="ein-karte weit" role="dialog" aria-modal="true" aria-labelledby="train-titel">
        <div class="ein-kopf">
          <div>
            <h2 id="train-titel">KI-Training</h2>
            <p>Regeln und Preise der Praxis, an einem Ort.</p>
          </div>
          <button type="button" class="ein-zu" data-train-zu aria-label="Schließen">✕</button>
        </div>
        ${meldung ? `<p class="ein-meldung">${esc(meldung)}</p>` : ''}
        <div class="ein-inhalt">
          ${trainingHtml({ admin: o.admin, filter, katalog, faelle, hinweis, laeuft, ansicht, bereich, gruppe, hkpGruppe })}
        </div>
      </div>`
    schleier.querySelector<HTMLButtonElement>('[data-train-zu]')?.addEventListener('click', zu)
    schleier.querySelectorAll<HTMLButtonElement>('[data-ansicht]').forEach((b) => b.addEventListener('click', () => {
      const ziel = b.dataset.ansicht
      if (ziel === 'wahl' || ziel === 'hkp' || ziel === 'listen') {
        ansicht = ziel
        bereich = ''
        gruppe = ''
        hkpGruppe = ''
        if (ziel === 'wahl') filter = ''
        zeichnen()
      }
    }))
    schleier.querySelectorAll<HTMLButtonElement>('[data-zurueck]').forEach((b) => b.addEventListener('click', () => {
      if (ansicht === 'listen' && filter) filter = ''
      else if (ansicht === 'hkp' && hkpGruppe) hkpGruppe = ''
      else if (ansicht === 'listen' && gruppe) gruppe = ''
      else if (ansicht === 'listen' && bereich) bereich = ''
      else { ansicht = 'wahl'; filter = ''; bereich = ''; gruppe = ''; hkpGruppe = '' }
      zeichnen()
    }))
    schleier.querySelectorAll<HTMLButtonElement>('[data-bereich]').forEach((b) => b.addEventListener('click', () => {
      bereich = b.dataset.bereich || ''
      gruppe = b.dataset.gruppe || ''
      zeichnen()
    }))
    schleier.querySelectorAll<HTMLButtonElement>('[data-hkp-gruppe]').forEach((b) => b.addEventListener('click', () => {
      hkpGruppe = b.dataset.hkpGruppe || ''
      zeichnen()
    }))
    const feld = schleier.querySelector<HTMLInputElement>('[data-train-suche]')
    feld?.addEventListener('input', () => { filter = feld.value; zeichnen() })
    if (cursor != null && feld) {
      feld.focus()
      feld.setSelectionRange(cursor, cursor)
    }
    schleier.querySelectorAll<HTMLButtonElement>('[data-fall]').forEach((b) => b.addEventListener('click', () => {
      zielSlot = b.dataset.fall || ''
      dateiFeld.value = ''
      dateiFeld.click()
    }))
    schleier.querySelectorAll<HTMLButtonElement>('[data-fall-weg]').forEach((b) => b.addEventListener('click', () => {
      const slot = b.dataset.fallWeg || ''
      if (!slot || !confirm('Den zuletzt hochgeladenen Plan dieser Art entfernen?')) return
      void senden({ slot, entfernen: true })
    }))
  }

  async function senden(body: Record<string, unknown>) {
    laeuft = true
    meldung = ''
    zeichnen()
    try {
      const r = await fetch('/api/fallkatalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json() as FallAnsicht & { ok?: boolean; clara?: boolean; meldung?: string }
      laeuft = false
      if (d.ok) {
        faelle = d
        hinweis = d.meldung || 'Plan übernommen.'
      } else meldung = d.meldung || 'Das hat gerade nicht geklappt.'
    } catch {
      laeuft = false
      meldung = 'Keine Verbindung.'
    }
    zeichnen()
  }

  dateiFeld.addEventListener('change', () => {
    const f = dateiFeld.files?.[0]
    const slot = zielSlot
    dateiFeld.value = ''
    if (!f || !slot) return
    void planAusPdf(f).then((plan) => {
      if ('fehler' in plan) { meldung = plan.fehler; zeichnen(); return }
      void senden({ slot, datei: plan })
    })
  })

  zeichnen()
  void Promise.all([
    fetch('/api/fallkatalog', { cache: 'no-store' }).then((r) => r.json()),
    fetch('/api/praxiskatalog', { cache: 'no-store' }).then((r) => r.json()),
  ]).then(([fall, kat]) => {
    if (!schleier.isConnected) return
    if (fall?.ok) faelle = fall
    if (kat?.katalog) katalog = kat.katalog
    zeichnen()
  }).catch(() => {
    if (!schleier.isConnected) return
    meldung = 'Die Listen konnten nicht geladen werden.'
    zeichnen()
  })
}

import './homepage.css'
import './clara-handy.css'
import { DOKU_MONAT } from './paket'
import {
  CLARA_ZUSTAENDE, HTML, PLAENE, PLANR, PRIVAT, PVS_RUECK, RUECK_PLAENE, START, ZUSATZ,
  cent, euro, komma, kosten, punkte, umsatz, vergleich, type Regler,
} from './homepageHtml'
import { funnelMelden } from './funnelClient'
import { einwilligungAendern, werbungAktiv, werbungStarten } from './werbung'

/** Öffentliche Startseite von PlanR für Besucher ohne Anmeldung. */

const DIKTAT = '„Clara, HKP für Frau Berger: 14 bis 16 Brücke, 26 Krone – Vollkeramik.“'

let laeuft = 0

/** Hero: Diktat tippt sich, danach füllt sich der Plan und die Summe zählt hoch – in Schleife. */
function demoStarten(wurzel: HTMLElement) {
  const lauf = ++laeuft
  const diktat = wurzel.querySelector<HTMLElement>('[data-diktat]')!
  const plan = wurzel.querySelector<HTMLElement>('[data-plan]')!
  const summe = wurzel.querySelector<HTMLElement>('[data-demo-summe]')!
  const balken = wurzel.querySelector<HTMLElement>('[data-demo-balken]')!
  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches
  const warten = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const ziel = 4380
  const buehne = diktat.closest<HTMLElement>('.hp-buehne')!
  let scrollt = false
  let timer = 0
  const beiScroll = () => {
    scrollt = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => { scrollt = false }, 160)
  }
  window.addEventListener('scroll', beiScroll, { passive: true })
  const vorher = aufraeumen
  aufraeumen = () => {
    vorher?.()
    window.removeEventListener('scroll', beiScroll)
    window.clearTimeout(timer)
  }
  const frei = () => !scrollt && !buehne.classList.contains('hp-pausiert')
  const bisFrei = async () => { while (lauf === laeuft && !frei()) await warten(120) }
  const balkenAuf = (anteil: number) => { balken.style.transform = `scaleX(${anteil})` }
  if (ruhig) {
    diktat.textContent = DIKTAT
    plan.classList.add('sichtbar')
    summe.textContent = euro(ziel)
    balkenAuf(1)
    return
  }
  void (async () => {
    while (lauf === laeuft && document.body.contains(wurzel)) {
      diktat.textContent = ''
      plan.classList.remove('sichtbar')
      summe.textContent = '0 €'
      balkenAuf(0)
      await warten(500)
      for (const z of DIKTAT) {
        if (lauf !== laeuft) return
        await bisFrei()
        diktat.textContent += z
        await warten(32)
      }
      await warten(400)
      plan.classList.add('sichtbar')
      let t0 = performance.now()
      let pauseAb = 0
      await new Promise<void>((fertig) => {
        const schritt = (t: number) => {
          if (lauf !== laeuft) return fertig()
          if (!frei()) {
            if (!pauseAb) pauseAb = t
            window.setTimeout(() => requestAnimationFrame(schritt), 120)
            return
          }
          if (pauseAb) { t0 += t - pauseAb; pauseAb = 0 }
          const p = Math.min(1, (t - t0) / 1600)
          const e = 1 - (1 - p) ** 3
          const text = euro(ziel * e)
          if (summe.textContent !== text) summe.textContent = text
          balkenAuf(e)
          if (p < 1) requestAnimationFrame(schritt)
          else fertig()
        }
        requestAnimationFrame(schritt)
      })
      await warten(3600)
    }
  })()
}

/** Hero-Handy: alle 3 s Flip zwischen Clara (Zuhören → Rechnen → Sprechen, wie auf pickadoc.ai) und dem pinken HKP. */
function claraHandyStarten(wurzel: HTMLElement) {
  const lauf = laeuft
  const feld = (name: string) => wurzel.querySelector<HTMLElement>(`[data-clara="${name}"]`)!
  const flip = feld('flip')
  const schirm = feld('schirm')
  const chips = [...schirm.querySelectorAll<HTMLElement>('.cp-agents span')]
  const punkteEl = [...feld('punkte').querySelectorAll<HTMLButtonElement>('button')]
  let i = 0, schritt = 0, aktiv = 0
  let takt: ReturnType<typeof setInterval> | undefined

  const zeigen = (n: number) => {
    const z = CLARA_ZUSTAENDE[n]
    schirm.dataset.state = z.id
    feld('zustand').textContent = z.zustand
    feld('unter').textContent = z.unter
    let hinweis = z.hinweis
    for (const c of chips) c.classList.remove('is-asking', 'is-answered')
    if (z.id === 'thinking') {
      aktiv = schritt++ % chips.length
      chips[aktiv].classList.add('is-asking')
      hinweis = `prüfe ${chips[aktiv].textContent} …`
    } else if (z.id === 'speaking') chips[aktiv].classList.add('is-answered')
    feld('hinweis').textContent = hinweis
    punkteEl.forEach((p, pi) => p.classList.toggle('is-active', pi === n))
  }
  const starten = () => {
    if (takt) clearInterval(takt)
    takt = setInterval(() => {
      if (lauf !== laeuft || !document.body.contains(wurzel)) return clearInterval(takt)
      const zumHkp = !flip.classList.contains('ist-hkp')
      flip.classList.toggle('ist-hkp', zumHkp)
      if (!zumHkp) {
        i = (i + 1) % CLARA_ZUSTAENDE.length
        zeigen(i)
      }
    }, 3000)
  }
  for (const p of punkteEl) {
    p.addEventListener('click', () => {
      i = Number(p.dataset.i)
      flip.classList.remove('ist-hkp')
      zeigen(i)
      starten()
    })
  }
  zeigen(0)
  starten()
}

/** Plan-Galerie: Klick wählt den Plantyp, sonst wechselt sie alle 5 s von selbst, bis jemand klickt. */
function galerieStarten(wurzel: HTMLElement) {
  const lauf = laeuft
  const galerie = wurzel.querySelector<HTMLElement>('[data-galerie]')!
  const knoepfe = [...galerie.querySelectorAll<HTMLButtonElement>('[role=tab]')]
  const bilder = [...galerie.querySelectorAll<HTMLImageElement>('.hp-fenster-bild img')]
  const eintraege = [...galerie.querySelectorAll<HTMLElement>('.hp-galerie-eintrag')]
  const pfad = galerie.querySelector<HTMLElement>('[data-galerie-pfad]')!
  const buehne = galerie.closest<HTMLElement>('.hp-buehne')!
  let i = 0
  let scrollt = false
  let timer = 0
  const beiScroll = () => {
    scrollt = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => { scrollt = false }, 160)
  }
  window.addEventListener('scroll', beiScroll, { passive: true })
  const zeigen = (n: number, sanft: boolean) => {
    i = n
    knoepfe.forEach((k, ki) => { k.classList.toggle('aktiv', ki === n); k.setAttribute('aria-selected', String(ki === n)) })
    const leiste = knoepfe[n].parentElement!
    if (leiste.scrollWidth > leiste.clientWidth + 4) {
      leiste.scrollTo({ left: knoepfe[n].offsetLeft - 12, behavior: sanft ? 'smooth' : 'auto' })
    }
    bilder.forEach((b, bi) => b.classList.toggle('aktiv', bi === n))
    eintraege.forEach((e, ei) => {
      e.classList.toggle('aktiv', ei === n)
      e.toggleAttribute('aria-hidden', ei !== n)
      const link = e.querySelector('a')!
      if (ei === n) link.removeAttribute('tabindex')
      else link.setAttribute('tabindex', '-1')
    })
    pfad.textContent = `planr.pickadoc.de/planer/${PLAENE[n].pfad}`
  }
  const takt = setInterval(() => {
    if (lauf !== laeuft || !document.body.contains(galerie)) return clearInterval(takt)
    if (scrollt || buehne.classList.contains('hp-pausiert')) return
    zeigen((i + 1) % PLAENE.length, false)
  }, 5000)
  const vorher = aufraeumen
  aufraeumen = () => {
    vorher?.()
    window.removeEventListener('scroll', beiScroll)
    window.clearTimeout(timer)
    clearInterval(takt)
  }
  for (const k of knoepfe) {
    k.addEventListener('click', () => {
      clearInterval(takt)
      zeigen(Number(k.dataset.i), true)
    })
  }
}

/** Rückschreiben: alle 4,5 s fliegt ein anderer Plan über die Bridge in ein anderes PVS und erscheint dort als neue Zeile. */
function rueckStarten(wurzel: HTMLElement) {
  const lauf = laeuft
  const fluss = wurzel.querySelector<HTMLElement>('[data-rueck]')!
  const pvs = fluss.querySelector<HTMLElement>('[data-rueck-pvs]')!
  const feld = (name: string) => fluss.querySelector<HTMLElement>(`[data-rueck-${name}]`)!
  const planr = fluss.querySelector<HTMLElement>('.hp-rueck-planr')!
  let n = 0
  const fuellen = (k: number) => {
    const plan = RUECK_PLAENE[k % RUECK_PLAENE.length]
    const system = PVS_RUECK[k % PVS_RUECK.length]
    feld('art').textContent = plan.art
    feld('text').textContent = plan.text
    feld('summe').textContent = plan.summe
    feld('pvs-name').textContent = system.name
    pvs.style.setProperty('--pvs', system.farbe)
    feld('z-art').textContent = plan.art
    feld('z-text').textContent = plan.text
    feld('z-summe').textContent = plan.summe
  }
  // Die Texte sind verschieden lang; ohne feste Höhe springt bei jedem Wechsel alles darunter mit.
  const hoeheSperren = () => {
    pvs.style.minHeight = ''
    planr.style.minHeight = ''
    let hp = 0
    let hk = 0
    for (let k = 0; k < Math.max(RUECK_PLAENE.length, PVS_RUECK.length); k++) {
      fuellen(k)
      hp = Math.max(hp, pvs.getBoundingClientRect().height)
      hk = Math.max(hk, planr.getBoundingClientRect().height)
    }
    pvs.style.minHeight = `${Math.ceil(hp)}px`
    planr.style.minHeight = `${Math.ceil(hk)}px`
    fuellen(n)
  }
  const zeigen = () => {
    fuellen(n)
    fluss.classList.remove('laeuft')
    void fluss.offsetWidth
    fluss.classList.add('laeuft')
  }
  hoeheSperren()
  zeigen()
  let breite = window.innerWidth
  let groesse = 0
  const beiGroesse = () => {
    window.clearTimeout(groesse)
    groesse = window.setTimeout(() => {
      if (window.innerWidth === breite) return
      breite = window.innerWidth
      hoeheSperren()
    }, 200)
  }
  window.addEventListener('resize', beiGroesse)
  let sichtbar = false
  const sicht = new IntersectionObserver(([e]) => { sichtbar = e.isIntersecting }, { rootMargin: '120px 0px' })
  sicht.observe(fluss)
  let scrollt = false
  let timer = 0
  const beiScroll = () => {
    scrollt = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => { scrollt = false }, 160)
  }
  window.addEventListener('scroll', beiScroll, { passive: true })
  const takt = setInterval(() => {
    if (lauf !== laeuft || !document.body.contains(fluss)) return clearInterval(takt)
    if (!sichtbar || scrollt) return
    n++
    zeigen()
  }, 4500)
  const vorher = aufraeumen
  aufraeumen = () => {
    vorher?.()
    clearInterval(takt)
    sicht.disconnect()
    window.removeEventListener('scroll', beiScroll)
    window.removeEventListener('resize', beiGroesse)
    window.clearTimeout(timer)
    window.clearTimeout(groesse)
  }
}

let aufraeumen: (() => void) | undefined

/** Karten ab „Was PlanR kann“ nacheinander einblenden; Animationen ausserhalb des Bilds anhalten. */
function flussStarten(wurzel: HTMLElement) {
  const vorher = aufraeumen
  const beobachter: IntersectionObserver[] = []
  const teile = [...wurzel.querySelectorAll<HTMLElement>('.hp-fluss .hp-ein')]
  const schritt = window.matchMedia('(max-width: 900px)').matches ? 130 : 75
  const ein = new IntersectionObserver((eintraege) => {
    const treffer = eintraege.filter((e) => e.isIntersecting)
    treffer.sort((a, b) => (a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    treffer.forEach((e, i) => {
      const el = e.target as HTMLElement
      el.style.setProperty('--d', `${i * schritt}ms`)
      el.classList.add('sichtbar')
      ein.unobserve(el)
    })
  }, { threshold: 0.16, rootMargin: '0px 0px -36px 0px' })
  for (const el of teile) ein.observe(el)
  const ruhe = new IntersectionObserver((eintraege) => {
    for (const e of eintraege) e.target.classList.toggle('hp-pausiert', !e.isIntersecting)
  }, { rootMargin: '220px 0px' })
  for (const el of wurzel.querySelectorAll('.hp-hero, .hp-band, .hp-buehne, .hp-sektion')) ruhe.observe(el)
  beobachter.push(ein, ruhe)
  aufraeumen = () => {
    vorher?.()
    for (const io of beobachter) io.disconnect()
  }
}

/** Handy-Menü und Nach-oben-Pfeil. */
function navigationStarten(wurzel: HTMLElement) {
  const burger = wurzel.querySelector<HTMLButtonElement>('[data-burger]')!
  const menue = wurzel.querySelector<HTMLElement>('#hp-menue')!
  const hoch = wurzel.querySelector<HTMLButtonElement>('[data-hoch]')!
  const schalten = (offen: boolean) => {
    wurzel.classList.toggle('hp-menue-offen', offen)
    burger.setAttribute('aria-expanded', String(offen))
    burger.setAttribute('aria-label', offen ? 'Menü schließen' : 'Menü öffnen')
  }
  burger.addEventListener('click', () => schalten(!wurzel.classList.contains('hp-menue-offen')))
  menue.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) schalten(false) })
  hoch.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }))
  const beimScrollen = () => hoch.classList.toggle('sichtbar', window.scrollY > window.innerHeight * 1.2)
  const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schalten(false) }
  window.addEventListener('scroll', beimScrollen, { passive: true })
  window.addEventListener('keydown', taste)
  beimScrollen()
  aufraeumen = () => {
    window.removeEventListener('scroll', beimScrollen)
    window.removeEventListener('keydown', taste)
  }
}

function spielwieseStarten(wurzel: HTMLElement) {
  const r: Regler = { ...START }
  const regler = [...wurzel.querySelectorAll<HTMLInputElement>('[data-regler]')]
  const wert = (k: keyof Regler) => wurzel.querySelector<HTMLElement>(`[data-wert="${k}"]`)!
  const feld = (sel: string) => wurzel.querySelector<HTMLElement>(sel)!
  const basis = umsatz(START)
  const max = umsatz({ zusatz: ZUSATZ.length - 1, faktor: 3.5, bel: 100, privat: PRIVAT.length - 1, beb: 100, plaene: 0 })
  let angezeigt = basis

  const zaehlen = (ziel: number) => {
    const von = angezeigt, t0 = performance.now()
    const schritt = (t: number) => {
      const p = Math.min(1, (t - t0) / 350)
      angezeigt = von + (ziel - von) * (1 - (1 - p) ** 3)
      feld('[data-umsatz]').textContent = euro(angezeigt)
      if (p < 1) requestAnimationFrame(schritt)
    }
    requestAnimationFrame(schritt)
  }

  const zeigen = () => {
    for (const el of regler) el.value = String(r[el.dataset.regler as keyof Regler])
    wert('zusatz').textContent = `Stufe ${r.zusatz} · ${ZUSATZ[r.zusatz].titel}`
    wert('faktor').textContent = komma(r.faktor)
    wert('bel').textContent = `${r.bel} % vom Höchstpreis`
    wert('privat').textContent = `Stufe ${r.privat} · ${PRIVAT[r.privat].titel}`
    wert('beb').textContent = `+${r.beb} %`
    wert('plaene').textContent = String(r.plaene)
    const bebRegler = regler.find((el) => el.dataset.regler === 'beb')!
    bebRegler.disabled = r.privat === 0
    const u = umsatz(r)
    zaehlen(u)
    const plus = u - basis
    feld('[data-plus]').textContent = plus > 0.5 ? `+${euro(plus)} mehr als ohne Regler` : 'Schieb mal ein bisschen …'
    feld('[data-meter]').style.width = `${Math.round(((u - basis) / (max - basis)) * 100)}%`
    const monat = plus * r.plaene
    feld('[data-monat]').textContent = euro(monat)
    const preis = kosten(r.plaene, !!wurzel.querySelector<HTMLInputElement>('[data-doku-dazu]')?.checked)
    feld('[data-kosten]').textContent = cent(preis)
    feld('[data-roi]').textContent = monat > preis
      ? `PlanR hat sich ${Math.floor(monat / preis).toLocaleString('de-DE')}-fach bezahlt gemacht.`
      : ''
    const hinweis = r.faktor > 2.3 ? 'Über 2,3: PlanR schlägt die Begründung je Position vor (§ 10 GOZ).'
      : r.privat > 0 ? 'Privatanteil: PlanR erstellt die Mehrkostenvereinbarung gleich mit.'
        : r.privat === 0 ? 'Der BEB-Aufschlag wirkt, sobald ein Privatanteil gewählt ist.' : ''
    feld('[data-hinweis]').textContent = hinweis
    wurzel.querySelector('.hp-ergebnis')!.classList.toggle('maximal', u >= max - 1)
  }

  for (const el of regler) {
    el.addEventListener('input', () => {
      const k = el.dataset.regler as keyof Regler
      r[k] = Number(el.value)
      funnelMelden('kalkulator')
      zeigen()
    })
  }
  feld('[data-zurueck]').addEventListener('click', () => {
    Object.assign(r, START)
    zeigen()
  })
  zeigen()
}

function dokuWahlStarten(wurzel: HTMLElement) {
  const box = wurzel.querySelector<HTMLInputElement>('[data-doku-dazu]')
  const knopf = wurzel.querySelector<HTMLButtonElement>('[data-doku-knopf]')
  if (!box || !knopf) return
  const setzen = (an: boolean) => {
    box.checked = an
    const v = vergleich(an)
    const titel = wurzel.querySelector('[data-vs-titel]')
    const alt = wurzel.querySelector('[data-vs-alt]')
    const neu = wurzel.querySelector('[data-vs-neu]')
    const betrag = wurzel.querySelector('[data-planr-monat]')
    const hinweis = wurzel.querySelector<HTMLElement>('[data-planr-hinweis]')
    if (titel) titel.textContent = v.titel
    if (alt) alt.innerHTML = punkte(v.alt)
    if (neu) neu.innerHTML = punkte(v.neu)
    if (betrag) betrag.textContent = `${v.monat} €`
    if (hinweis) {
      hinweis.hidden = !an
      hinweis.textContent = an ? `${PLANR} € PlanR und ${DOKU_MONAT} € Sprachdokumentation` : ''
    }
    for (const a of wurzel.querySelectorAll<HTMLAnchorElement>('[data-planr-buchen]')) a.hash = an ? '#buchen-doku' : '#buchen-clara'
    knopf.textContent = an ? 'Dazugebucht' : 'Als Upgrade dazubuchen'
    knopf.classList.toggle('hp-knopf-voll', an)
    knopf.setAttribute('aria-pressed', String(an))
    wurzel.querySelector<HTMLInputElement>('[data-regler="plaene"]')?.dispatchEvent(new Event('input'))
  }
  box.addEventListener('change', () => setzen(box.checked))
  knopf.addEventListener('click', () => setzen(!box.checked))
}

export function homepage(app: HTMLElement) {
  document.body.classList.add('hp-body')
  document.documentElement.classList.add('hp-html')
  document.title = 'PlanR – HKP erstellen per Sprach-KI'
  if (app.dataset.ssr === 'homepage' && app.querySelector('.hp')) {
    delete app.dataset.ssr
  } else {
    delete app.dataset.ssr
    app.innerHTML = HTML
  }
  const wurzel = app.querySelector<HTMLElement>('.hp')!
  aufraeumen?.()
  navigationStarten(wurzel)
  flussStarten(wurzel)
  demoStarten(wurzel)
  claraHandyStarten(wurzel)
  galerieStarten(wurzel)
  rueckStarten(wurzel)
  spielwieseStarten(wurzel)
  dokuWahlStarten(wurzel)
  const einwilligung = wurzel.querySelector<HTMLAnchorElement>('[data-einwilligung]')
  if (einwilligung && werbungAktiv()) {
    einwilligung.hidden = false
    einwilligung.addEventListener('click', (ev) => { ev.preventDefault(); einwilligungAendern() })
  }
  werbungStarten()
  funnelMelden('start')
  const ziel = /^#[a-z-]+$/.test(location.hash) && location.hash !== '#top' ? wurzel.querySelector(location.hash) : null
  ziel?.scrollIntoView()
}

export function homepageVerlassen() {
  laeuft++
  aufraeumen?.()
  aufraeumen = undefined
  document.body.classList.remove('hp-body')
  document.documentElement.classList.remove('hp-html')
}

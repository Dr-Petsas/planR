/** PlanR-Zeichen: Claras Orb mit Sprachwellen und Orbit auf DunkelgrÃ¼n, pinker Bogen als Akzent. */

let zaehler = 0

export function logo(titel = 'PlanR'): string {
  const id = `prl${++zaehler}`
  return `<svg class="pr-logo" viewBox="0 0 48 48" role="img" aria-label="${titel}">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f4a42"/><stop offset="1" stop-color="#051a1b"/>
    </linearGradient>
    <radialGradient id="${id}s" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#3fd8b5" stop-opacity=".45"/><stop offset="1" stop-color="#3fd8b5" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}o" cx=".36" cy=".32" r=".75">
      <stop offset="0" stop-color="#c8fff0"/><stop offset=".45" stop-color="#3fe0bb"/><stop offset="1" stop-color="#0c7a6c"/>
    </radialGradient>
    <linearGradient id="${id}p" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff9cc2"/><stop offset="1" stop-color="#e0407b"/>
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="13" fill="url(#${id}g)"/>
  <rect x=".6" y=".6" width="46.8" height="46.8" rx="12.4" fill="none" stroke="#5ff0c8" stroke-opacity=".28" stroke-width="1.2"/><circle cx="24" cy="24" r="20" fill="url(#${id}s)"/>
  <circle cx="24" cy="24" r="17" fill="none" stroke="#5ff0c8" stroke-opacity=".35" stroke-width="1.1" stroke-dasharray="1.6 2.6"/>
  <path d="M26.96 7.25A17 17 0 0 1 40.74 26.95" fill="none" stroke="url(#${id}p)" stroke-width="2.6" stroke-linecap="round"/>
  <circle cx="40.74" cy="26.95" r="2.3" fill="#ff7aa8"/>
  <circle cx="8.02" cy="18.19" r="1.3" fill="#5ff0c8"/>
  <circle cx="24" cy="24" r="12.6" fill="none" stroke="#5ff0c8" stroke-opacity=".6" stroke-width="1"/>
  <circle cx="24" cy="24" r="9.2" fill="url(#${id}o)"/>
  <rect x="19.3" y="21.6" width="2.1" height="4.8" rx="1.05" fill="#fff"/>
  <rect x="22.95" y="18.9" width="2.1" height="10.2" rx="1.05" fill="#fff"/>
  <rect x="26.6" y="21.6" width="2.1" height="4.8" rx="1.05" fill="#fff"/>
</svg>`
}

/** Logo plus Wortmarke â€žPlanRâ€œ (R im Verlauf). */
export function wortmarke(): string {
  return `<span class="pr-wort">Plan<b>R</b></span>`
}

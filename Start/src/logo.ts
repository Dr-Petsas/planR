/** PlanR-Zeichen: Zahn mit steigenden Umsatzbalken auf Mint-Türkis-Verlauf. */

let zaehler = 0

export function logo(titel = 'PlanR'): string {
  const id = `prl${++zaehler}`
  return `<svg class="pr-logo" viewBox="0 0 48 48" role="img" aria-label="${titel}">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5ff0c8"/><stop offset=".55" stop-color="#2fb3b5"/><stop offset="1" stop-color="#1b6a82"/>
    </linearGradient>
    <linearGradient id="${id}b" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#ffb648"/><stop offset="1" stop-color="#ffe08a"/>
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="13" fill="url(#${id}g)"/>
  <path d="M0 13A13 13 0 0 1 13 0h22a13 13 0 0 1 13 13v3C34 25 16 9 0 20z" fill="#fff" opacity=".13"/>
  <path d="M14.5 9.5c-4.4 0-7 3.2-7 7.6 0 4 2 7 3 11 1.2 4.9 1.8 11 4.6 11 2.7 0 3-5.6 4-9.6.5-2 2.4-3.4 4.9-3.4s4.4 1.4 4.9 3.4c1 4 1.3 9.6 4 9.6 2.8 0 3.4-6.1 4.6-11 1-4 3-7 3-11 0-4.4-2.6-7.6-7-7.6-3.9 0-5.6 2.1-9.5 2.1s-5.6-2.1-9.5-2.1z" fill="#fff"/>
  <rect x="15.2" y="19.6" width="4.4" height="4.6" rx="1.2" fill="#14707f"/>
  <rect x="21.8" y="16.4" width="4.4" height="7.8" rx="1.2" fill="#14707f"/>
  <rect x="28.4" y="12.9" width="4.4" height="11.3" rx="1.2" fill="url(#${id}b)"/>
</svg>`
}

/** Logo plus Wortmarke „PlanR“ (R im Verlauf). */
export function wortmarke(): string {
  return `<span class="pr-wort">Plan<b>R</b></span>`
}

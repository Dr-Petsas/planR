/**
 * In Pickadoc (Sophie) eingebettet öffnet PlanR mit `?thema=sophie` und trägt dann die Sophie-Farben.
 * Die Wahl gilt für den ganzen Tab (sessionStorage), auch wenn man von der Übersicht in einen Planer wechselt.
 */
const SCHLUESSEL = 'planr-thema'

export function themaAnwenden() {
  try {
    if (new URLSearchParams(location.search).get('thema') === 'sophie') sessionStorage.setItem(SCHLUESSEL, 'sophie')
    if (sessionStorage.getItem(SCHLUESSEL) === 'sophie') document.documentElement.classList.add('thema-sophie')
  } catch { /* Speicher gesperrt: Standardfarben */ }
}

themaAnwenden()

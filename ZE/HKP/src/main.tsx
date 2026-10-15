import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './gemeinsam.css'
import './thema'
import App from './App.tsx'
import { HkpMobil } from './components/HkpMobil'
import { BefundFlip } from './components/BefundFlip'
import { linkZugang, mobilGewuenscht } from './store/mobilLink'
import { befundLinkAus } from './store/befund01'

const suche = window.location.search
const zugang = mobilGewuenscht(suche, window.matchMedia?.('(max-width: 760px)').matches ?? false) ? linkZugang(suche) : null
const befundLink = zugang ? null : befundLinkAus(suche)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {zugang ? <HkpMobil zugang={zugang} /> : befundLink ? <BefundFlip zugang={befundLink} /> : <App />}
  </StrictMode>,
)

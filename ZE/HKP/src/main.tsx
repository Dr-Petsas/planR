import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './gemeinsam.css'
import App from './App.tsx'
import { HkpMobil } from './components/HkpMobil'
import { linkZugang, mobilGewuenscht } from './store/mobilLink'

const suche = window.location.search
const zugang = mobilGewuenscht(suche, window.matchMedia?.('(max-width: 760px)').matches ?? false) ? linkZugang(suche) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {zugang ? <HkpMobil zugang={zugang} /> : <App />}
  </StrictMode>,
)

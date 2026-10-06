import type { ReactNode } from 'react'

export function Feld({ label, children, weit }: { label: string; children: ReactNode; weit?: boolean }) {
  return (
    <label className={`feld${weit ? ' weit' : ''}`}>
      <span className="feld-label">{label}</span>
      {children}
    </label>
  )
}

export function TextFeld({ label, value, onChange, weit, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; weit?: boolean; placeholder?: string
}) {
  return (
    <Feld label={label} weit={weit}>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Feld>
  )
}

export function ZahlFeld({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <Feld label={label}>
      <input
        type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step ?? 1}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    </Feld>
  )
}

export function Schalter({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="schalter">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Karte({ titel, children, rechts }: { titel: string; children: ReactNode; rechts?: ReactNode }) {
  return (
    <section className="karte">
      <div className="karte-kopf"><h2>{titel}</h2>{rechts}</div>
      {children}
    </section>
  )
}

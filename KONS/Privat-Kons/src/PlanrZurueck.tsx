/** Logo-Link zurück zur Planübersicht. Normaler Seitenwechsel, damit Zurück im Browser geht. */
export function PlanrZurueck() {
  const mandant = new URLSearchParams(window.location.search).get('mandant')
  const q = mandant ? `?mandant=${encodeURIComponent(mandant)}` : ''
  const href = window.location.hostname.endsWith('.pickadoc-tunnel.com')
    ? `https://planr.pickadoc-tunnel.com/${q}`
    : `${window.location.protocol}//${window.location.hostname || '127.0.0.1'}:5189/${q}`
  return (
    <a
      href={href}
      title="Zurück zu PlanR"
      aria-label="Zurück zu PlanR"
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 40,
        height: 40,
        borderRadius: 10,
        background: '#2f7f8f',
        color: '#fff',
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: '0.4px',
        textDecoration: 'none',
        flex: '0 0 auto',
      }}
    >
      PR
    </a>
  )
}

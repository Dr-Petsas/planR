/** Logo-Link zurück zur Planübersicht. Normaler Seitenwechsel, damit Zurück im Browser geht. */
export function PlanrZurueck() {
  const mandant = new URLSearchParams(window.location.search).get('mandant')
  const q = mandant ? `?mandant=${encodeURIComponent(mandant)}` : ''
  const href = window.location.pathname.startsWith('/planer/') ? `/${q}`
    : window.location.hostname.endsWith('.pickadoc-tunnel.com')
    ? `https://planr.pickadoc-tunnel.com/${q}`
    : `${window.location.protocol}//${window.location.hostname || '127.0.0.1'}:5189/${q}`
  return (
    <a
      href={href}
      title="Zurück zu PlanR"
      aria-label="Zurück zu PlanR"
      style={{ display: 'block', width: 40, height: 40, flex: '0 0 auto', filter: 'drop-shadow(0 4px 10px rgba(20, 112, 127, .35))' }}
    >
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="planr-logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5ff0c8" /><stop offset=".55" stopColor="#2fb3b5" /><stop offset="1" stopColor="#1b6a82" />
          </linearGradient>
          <linearGradient id="planr-logo-b" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ffb648" /><stop offset="1" stopColor="#ffe08a" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="13" fill="url(#planr-logo-g)" />
        <path d="M0 13A13 13 0 0 1 13 0h22a13 13 0 0 1 13 13v3C34 25 16 9 0 20z" fill="#fff" opacity=".13" />
        <path d="M14.5 9.5c-4.4 0-7 3.2-7 7.6 0 4 2 7 3 11 1.2 4.9 1.8 11 4.6 11 2.7 0 3-5.6 4-9.6.5-2 2.4-3.4 4.9-3.4s4.4 1.4 4.9 3.4c1 4 1.3 9.6 4 9.6 2.8 0 3.4-6.1 4.6-11 1-4 3-7 3-11 0-4.4-2.6-7.6-7-7.6-3.9 0-5.6 2.1-9.5 2.1s-5.6-2.1-9.5-2.1z" fill="#fff" />
        <rect x="15.2" y="19.6" width="4.4" height="4.6" rx="1.2" fill="#14707f" />
        <rect x="21.8" y="16.4" width="4.4" height="7.8" rx="1.2" fill="#14707f" />
        <rect x="28.4" y="12.9" width="4.4" height="11.3" rx="1.2" fill="url(#planr-logo-b)" />
      </svg>
    </a>
  )
}

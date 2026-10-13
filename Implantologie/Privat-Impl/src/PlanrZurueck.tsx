/** Logo-Link zurÃ¼ck zur PlanÃ¼bersicht. Normaler Seitenwechsel, damit ZurÃ¼ck im Browser geht. */
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
      title="ZurÃ¼ck zu PlanR"
      aria-label="ZurÃ¼ck zu PlanR"
      style={{ display: 'block', width: 40, height: 40, flex: '0 0 auto', filter: 'drop-shadow(0 4px 10px rgba(5, 26, 27, .35))' }}
    >
      <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="planr-logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0f4a42" /><stop offset="1" stopColor="#051a1b" />
          </linearGradient>
          <radialGradient id="planr-logo-s" cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#3fd8b5" stopOpacity=".45" /><stop offset="1" stopColor="#3fd8b5" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="planr-logo-o" cx=".36" cy=".32" r=".75">
            <stop offset="0" stopColor="#c8fff0" /><stop offset=".45" stopColor="#3fe0bb" /><stop offset="1" stopColor="#0c7a6c" />
          </radialGradient>
          <linearGradient id="planr-logo-p" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff9cc2" /><stop offset="1" stopColor="#e0407b" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="13" fill="url(#planr-logo-g)" />
        <rect x=".6" y=".6" width="46.8" height="46.8" rx="12.4" fill="none" stroke="#5ff0c8" strokeOpacity=".28" strokeWidth="1.2" />
        <circle cx="24" cy="24" r="20" fill="url(#planr-logo-s)" />
        <circle cx="24" cy="24" r="17" fill="none" stroke="#5ff0c8" strokeOpacity=".35" strokeWidth="1.1" strokeDasharray="1.6 2.6" />
        <path d="M26.96 7.25A17 17 0 0 1 40.74 26.95" fill="none" stroke="url(#planr-logo-p)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="40.74" cy="26.95" r="2.3" fill="#ff7aa8" />
        <circle cx="8.02" cy="18.19" r="1.3" fill="#5ff0c8" />
        <circle cx="24" cy="24" r="12.6" fill="none" stroke="#5ff0c8" strokeOpacity=".6" strokeWidth="1" />
        <circle cx="24" cy="24" r="9.2" fill="url(#planr-logo-o)" />
        <rect x="19.3" y="21.6" width="2.1" height="4.8" rx="1.05" fill="#fff" />
        <rect x="22.95" y="18.9" width="2.1" height="10.2" rx="1.05" fill="#fff" />
        <rect x="26.6" y="21.6" width="2.1" height="4.8" rx="1.05" fill="#fff" />
      </svg>
    </a>
  )
}

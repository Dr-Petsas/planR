/** Mailversand über das Pickadoc-Postfach (Strato). Zugang aus der Umgebung bzw. lokal aus data/planr-mail.env – nie im Repo. */
import { readFileSync } from 'node:fs'

interface Zugang { host: string; port: number; user: string; pass: string; von: string }

function zugang(ordner: string): Zugang | null {
  const env: Record<string, string | undefined> = { ...process.env }
  if (!env.PLANR_SMTP_PASS) {
    try {
      for (const zeile of readFileSync(`${ordner}/planr-mail.env`, 'utf8').split(/\r?\n/)) {
        const m = zeile.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)
        if (m) env[m[1]] = m[2].trim()
      }
    } catch { /* kein Postfach eingerichtet */ }
  }
  const host = env.PLANR_SMTP_HOST?.trim(), user = env.PLANR_SMTP_USER?.trim(), pass = env.PLANR_SMTP_PASS
  if (!host || !user || !pass) return null
  return { host, port: Number(env.PLANR_SMTP_PORT) || 465, user, pass, von: env.PLANR_MAIL_VON?.trim() || user }
}

export const infoAdresse = () => process.env.PLANR_MAIL_INFO?.trim() || 'info@pickadoc.de'

/** false = nicht verschickt (kein Zugang oder Fehler); der Grund steht im Log. */
export async function mailSenden(ordner: string, m: { an: string; betreff: string; text: string; antwortAn?: string }): Promise<boolean> {
  const z = zugang(ordner)
  if (!z) {
    console.error('[planr] Mail nicht verschickt: kein SMTP-Zugang (PLANR_SMTP_* bzw. data/planr-mail.env)')
    return false
  }
  try {
    const { createTransport } = await import('nodemailer')
    const transport = createTransport({ host: z.host, port: z.port, secure: z.port === 465, auth: { user: z.user, pass: z.pass } })
    await transport.sendMail({ from: z.von, to: m.an, subject: m.betreff, text: m.text, replyTo: m.antwortAn })
    return true
  } catch (e) {
    console.error('[planr] Mail an', m.an, 'fehlgeschlagen:', e instanceof Error ? e.message : e)
    return false
  }
}

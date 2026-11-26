/**
 * IIMK class invites are titled like "Session No: 15 - EE(C)-LME-(CR B1)":
 *   15   session number
 *   EE   course
 *   (C)  section (same for the whole section)
 *   LME  faculty initials
 *   (CR B1) classroom B1 ("CR" = classroom). Rooms: A1–A4, B1–B4, C1–C4, C6, MDC, …
 * No imports, so it can be tested on its own.
 */
export interface SessionInfo { code: string; section: string; session: string; faculty: string; room: string }

export const looksLikeSession = (title: string) => /^\s*Session\s*No\.?\s*:?\s*\d+/i.test(title)

export function parseSessionTitle(title: string): SessionInfo | null {
  const m = /^\s*Session\s*No\.?\s*:?\s*(\d+)\s*[-–:]\s*(.+?)\s*$/i.exec(title)
  if (!m) return null
  let rest = m[2]
  // The room is the last bracket, after a dash ("-(CR B1)", "-(MDC)") or a space once there's a dash before it.
  let room = ''
  const r = /[-–]\s*\(\s*([^()]*?)\s*\)\s*$/.exec(rest) || (/[-–]/.test(rest) ? /\s\(\s*([^()]*?)\s*\)\s*$/.exec(rest) : null)
  if (r && r.index > 0) {
    room = r[1].replace(/^CR\b\s*[-:]?\s*/i, '').trim() || r[1].trim()
    rest = rest.slice(0, r.index).trim()
  }
  const parts = rest.split(/\s*[-–]\s*/).filter(Boolean)
  if (!parts.length) return null
  const head = parts[0]
  const section = (/\(([^)]*)\)/.exec(head)?.[1] || '').trim()
  const code = head.replace(/\([^)]*\)/g, '').trim()
  if (!code) return null
  return { code, section, session: m[1], faculty: parts.slice(1).join('-'), room }
}

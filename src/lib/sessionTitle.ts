/**
 * IIMK class invites are titled like "Session No: 15 - EE(C)-LME-(CR B1)":
 * session number, course code (C = core), faculty initials, classroom.
 * No imports, so it can be tested on its own.
 */
export interface SessionInfo { code: string; kind: string; session: string; faculty: string; room: string }

export const looksLikeSession = (title: string) => /^\s*Session\s*No\.?\s*:?\s*\d+/i.test(title)

export function parseSessionTitle(title: string): SessionInfo | null {
  const m = /^\s*Session\s*No\.?\s*:?\s*(\d+)\s*[-–:]\s*(.+?)\s*$/i.exec(title)
  if (!m) return null
  let rest = m[2]
  const roomM = /[-–]?\s*\(\s*([^()]*?)\s*\)\s*$/.exec(rest)
  const room = roomM && /\b(CR|LT|room|hall|aud|lab|online|zoom|teams)\b|^[A-Z]{1,3}\s?-?\d/i.test(roomM[1]) ? roomM[1] : ''
  if (room) rest = rest.slice(0, roomM!.index).trim()
  const parts = rest.split(/\s*[-–]\s*/).filter(Boolean)
  if (!parts.length) return null
  const head = parts[0]
  const kind = /\(([^)]*)\)/.exec(head)?.[1] || ''
  const code = head.replace(/\([^)]*\)/g, '').trim()
  if (!code) return null
  return { code, kind, session: m[1], faculty: parts.slice(1).join('-'), room }
}

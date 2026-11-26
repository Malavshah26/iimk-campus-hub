import { strFromU8, unzipSync } from 'fflate'

/**
 * Reads the mess committee's menu sheet (an .xlsx file, or cells pasted from Excel / Google Sheets):
 * a row of day names (Monday … Sunday), then blocks of rows for Breakfast, Lunch, Dinner. The meal
 * can be a label in the left columns ("LUNCH", or letters spelt down the side: L U N C H) or, if
 * there are no labels, the blocks are taken in order. Category labels (Salad, Dal, Veg Dry …) are ignored.
 * No DOM needed, so it can be tested on its own.
 */
export type Grid = string[][]

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()])
const runText = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join('')
const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]))
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
const cellPos = (ref: string) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return m ? { c: colIndex(m[1]), r: +m[2] - 1 } : null }

/** First worksheet of an .xlsx file as a grid of strings (merged cells repeat their value). */
export function xlsxToGrid(data: Uint8Array): Grid {
  let files: Record<string, Uint8Array>
  try { files = unzipSync(data) } catch { throw new Error('That file isn’t a readable .xlsx workbook.') }
  const get = (p: string) => (files[p] ? strFromU8(files[p]) : '')
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => runText(m[1]))

  let path = ''
  const rid = /<sheet\b[^>]*>/.exec(get('xl/workbook.xml'))
  if (rid) {
    const id = attrs(rid[0])['r:id']
    for (const rel of get('xl/_rels/workbook.xml.rels').match(/<Relationship\b[^>]*>/g) || []) {
      const a = attrs(rel)
      if (a.Id === id) path = a.Target.startsWith('/') ? a.Target.slice(1) : 'xl/' + a.Target.replace(/^\.\//, '')
    }
  }
  if (!files[path]) path = Object.keys(files).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0] || ''
  const xml = get(path)
  if (!xml) throw new Error('No worksheet found in that file.')

  const grid: Grid = []
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = attrs(m[1])
    const pos = cellPos(a.r || '')
    if (!pos) continue
    const inner = m[2] || ''
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
    let text = ''
    if (a.t === 's') text = shared[+(v ?? -1)] ?? ''
    else if (a.t === 'inlineStr') text = runText(inner)
    else text = v !== undefined ? decode(v) : ''
    ;(grid[pos.r] ||= [])[pos.c] = clean(text)
  }
  for (const mc of xml.match(/<mergeCell\b[^>]*>/g) || []) {
    const [from, to] = (attrs(mc).ref || '').split(':').map(cellPos)
    if (!from || !to) continue
    const v = grid[from.r]?.[from.c] || ''
    for (let r = from.r; r <= to.r; r++) for (let c = from.c; c <= to.c; c++) (grid[r] ||= [])[c] = v
  }
  for (let r = 0; r < grid.length; r++) grid[r] = Array.from(grid[r] || [], x => x || '')
  return grid
}

/** Cells pasted from a spreadsheet (tab-separated) or a CSV file. */
export function textToGrid(text: string): Grid {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (text.includes('\t')) return lines.map(l => l.split('\t').map(clean))
  // CSV with quoted fields
  const out: Grid = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(clean(cell)); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(clean(cell)); out.push(row); row = []; cell = '' }
    else cell += ch
  }
  row.push(clean(cell))
  out.push(row)
  return out
}

const DAYS: [RegExp, string][] = [[/^mon/i, 'Mon'], [/^tue/i, 'Tue'], [/^wed/i, 'Wed'], [/^thu/i, 'Thu'], [/^fri/i, 'Fri'], [/^sat/i, 'Sat'], [/^sun/i, 'Sun']]
const dayOf = (s: string) => (/^(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\.?$/i.test(s.trim()) ? DAYS.find(([re]) => re.test(s.trim()))?.[1] : undefined)

export interface MenuMeal { meal: string; label: string }
export interface MenuParse { title: string; rows: { day: string; meal: string; items: string }[]; meals: string[]; errors: string[] }

export function parseMenu(grid: Grid, meals: MenuMeal[]): MenuParse {
  const errors: string[] = []
  const hr = grid.findIndex(row => (row || []).filter(c => dayOf(c || '')).length >= 5)
  if (hr < 0) return { title: '', rows: [], meals: [], errors: ['Couldn’t find a row with the day names (Monday … Sunday).'] }
  const title = grid.slice(0, hr).flat().find(c => c && c.length > 8) || ''
  const dayCols = new Map<number, string>()
  grid[hr].forEach((c, i) => { const d = dayOf(c || ''); if (d && ![...dayCols.values()].includes(d)) dayCols.set(i, d) })
  const first = Math.min(...dayCols.keys())

  const keyOf = (m: MenuMeal) => m.label.toUpperCase().replace(/[^A-Z]/g, '')
  const byWord = (text: string) => meals.find(m => new RegExp(`\\b${m.label.replace(/s$/i, '')}s?\\b`, 'i').test(text))
  const items = new Map<string, string[]>() // meal|day -> items
  let current: MenuMeal | undefined
  let letters = ''
  let block = 0
  let sawLabel = false
  const rowMeal: (MenuMeal | undefined)[] = []
  const blockOf: number[] = []

  for (let r = hr + 1; r < grid.length; r++) {
    const row = grid[r] || []
    if (row.some(c => /^\s*note\b/i.test(c || ''))) break
    const left = row.slice(0, first).filter(Boolean).join(' ')
    const dayCells = [...dayCols.keys()].map(i => row[i] || '')
    if (!left && dayCells.every(c => !c)) { letters = ''; if (rowMeal[r - 1] !== undefined || blockOf[r - 1] === block) block++; continue }
    const named = byWord(left)
    if (named) { current = named; letters = ''; sawLabel = true }
    else {
      // Letters spelt down the side: "B","R","E",… -> BREAKFAST (each meal starts with a different letter)
      const single = row.slice(0, first).find(c => /^[A-Za-z]$/.test((c || '').trim()))
      if (single) {
        const next = letters + single.toUpperCase()
        const hit = meals.filter(m => keyOf(m).startsWith(next))
        if (hit.length) { letters = next; if (next.length === 1) { current = hit[0]; sawLabel = true } }
        else { letters = single.toUpperCase(); const h = meals.find(m => keyOf(m).startsWith(letters)); if (h) { current = h; sawLabel = true } }
      }
    }
    rowMeal[r] = current
    blockOf[r] = block
  }
  // No labels at all: blocks separated by blank rows, in meal order.
  const ordered = [...meals]
  for (let r = hr + 1; r < grid.length; r++) {
    if (blockOf[r] === undefined) continue
    const m = sawLabel ? rowMeal[r] : ordered[Math.min(blockOf[r], ordered.length - 1)]
    if (!m) continue
    for (const [col, day] of dayCols) {
      const v = (grid[r]?.[col] || '').trim()
      if (!v || /^[-–—.]+$/.test(v) || dayOf(v)) continue
      const k = m.meal + '|' + day
      const list = items.get(k) || []
      if (!list.some(x => x.toLowerCase() === v.toLowerCase())) list.push(v)
      items.set(k, list)
    }
  }
  const found = meals.filter(m => [...dayCols.values()].some(d => items.has(m.meal + '|' + d)))
  if (!found.length) errors.push('Found the days but no Breakfast / Lunch / Dinner rows under them.')
  const days = [...new Set(dayCols.values())]
  if (days.length < 7) errors.push(`Only found ${days.join(', ')}. Missing days keep their current menu.`)
  const rows = found.flatMap(m => days.map(day => ({ day, meal: m.meal, items: (items.get(m.meal + '|' + day) || []).join(', ') })))
  return { title, rows, meals: found.map(m => m.meal), errors }
}

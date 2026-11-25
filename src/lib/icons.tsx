// Simple drawings used when a post has no photo. Static, trusted markup.
const grid = Array.from({ length: 16 }, (_, i) =>
  `<rect x="${34 + (i % 4) * 8.5}" y="${38 + Math.floor(i / 4) * 10.5}" width="6" height="7" rx="1.5" fill="${i > 11 ? '#2457a6' : '#556173'}"/>`).join('')
const grille = Array.from({ length: 7 }, (_, i) => `<path d="M34 ${26 + i * 6}h32" stroke="#9aa5b4" stroke-width="2"/>`).join('')

export const ICONS: Record<string, string> = {
  earbuds: '<rect x="24" y="36" width="52" height="40" rx="18" fill="#2b3442"/><rect x="24" y="36" width="52" height="18" rx="14" fill="#3a4555"/><path d="M26 54h48" stroke="#556173" stroke-width="2"/><circle cx="50" cy="63" r="2.5" fill="#7ea8e8"/>',
  bottle: '<rect x="41" y="12" width="18" height="11" rx="3" fill="#1f4583"/><rect x="36" y="22" width="28" height="62" rx="10" fill="#2f6bc4"/><rect x="40" y="28" width="6" height="48" rx="3" fill="#a9c6f0" opacity=".7"/>',
  calc: '<rect x="28" y="12" width="44" height="72" rx="6" fill="#2b3442"/><rect x="33" y="18" width="34" height="14" rx="2" fill="#cfdccb"/>' + grid,
  key: '<circle cx="32" cy="50" r="13" fill="none" stroke="#9aa5b4" stroke-width="7"/><path d="M45 50h36M72 50v10M80 50v7" stroke="#9aa5b4" stroke-width="7" fill="none" stroke-linecap="round"/>',
  book: '<rect x="22" y="20" width="56" height="62" rx="3" fill="#2457a6"/><rect x="22" y="20" width="9" height="62" fill="#1f4583"/><rect x="38" y="32" width="32" height="5" rx="2" fill="#dbe7f7"/><rect x="38" y="42" width="24" height="4" rx="2" fill="#a9c6f0"/>',
  cycle: '<circle cx="27" cy="64" r="15" fill="none" stroke="#2b3442" stroke-width="5"/><circle cx="73" cy="64" r="15" fill="none" stroke="#2b3442" stroke-width="5"/><path d="M27 64L42 40h22L73 64M42 40l14 24h17M38 32h12" stroke="#2457a6" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>',
  cooler: '<rect x="26" y="14" width="48" height="68" rx="6" fill="#eef2f7" stroke="#9aa5b4" stroke-width="2"/>' + grille + '<rect x="36" y="70" width="28" height="6" rx="3" fill="#2457a6"/>',
  electronics: '<rect x="12" y="20" width="76" height="48" rx="4" fill="#2b3442"/><rect x="17" y="25" width="66" height="38" rx="2" fill="#7ea8e8"/><path d="M50 68v10" stroke="#4a5568" stroke-width="5"/><rect x="34" y="78" width="32" height="6" rx="3" fill="#2b3442"/>',
  clothing: '<path d="M30 26q20-14 40 0l16 14-8 12-8-6v38H30V46l-8 6-8-12z" fill="#8a94a3"/><path d="M38 24q12 18 24 0" fill="#6f7987"/>',
  room: '<rect x="10" y="44" width="80" height="26" rx="9" fill="#dbe7f7" stroke="#9aa5b4" stroke-width="2"/><rect x="14" y="34" width="26" height="14" rx="6" fill="#fff" stroke="#c4cfdd" stroke-width="2"/>',
  box: '<rect x="24" y="32" width="52" height="44" rx="4" fill="#c4cfdd"/><path d="M24 44h52" stroke="#9aa5b4" stroke-width="3"/><path d="M44 56q0-6 6-6t6 5q0 4-6 6v3" stroke="#6b7686" stroke-width="3" fill="none" stroke-linecap="round"/>',
}

export const CATEGORY_ICON: Record<string, string> = {
  Books: 'book', Electronics: 'electronics', Appliances: 'cooler', Cycles: 'cycle',
  'Furniture & room': 'room', Clothing: 'clothing', Other: 'box',
}

export function Art({ name }: { name: string }) {
  const body = ICONS[name] || ICONS.box
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: `<ellipse cx="50" cy="88" rx="30" ry="4" fill="var(--line)"/>${body}` }} />
  )
}

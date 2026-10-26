// Заголовки статьи базы знаний для содержания над текстом: адреса якорей совпадают с теми, что рисует KbMarkdown.

export interface KbHeading { id: string; level: number; text: string }

export const kbSlug = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Заголовки второго и третьего уровня — для содержания над статьёй. */
export function kbHeadings(md: string): KbHeading[] {
  const out: KbHeading[] = []
  const seen = new Map<string, number>()
  let fence = false
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) fence = !fence
    if (fence) continue
    const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line)
    if (!m) continue
    const base = kbSlug(m[2]) || 'razdel'
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    out.push({ id: n ? `${base}-${n}` : base, level: m[1].length, text: m[2].replace(/[*_`]/g, '') })
  }
  return out
}

export function scrollToHeading(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  try {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${id}`)
  } catch {
    // адрес не обновился — переход всё равно выполнен
  }
}

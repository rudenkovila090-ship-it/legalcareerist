// Закрытая база знаний для резидентов сообщества (кабинет на сайте). Содержимое — обычные Markdown-файлы в папке
// server/content/knowledge: папка = раздел, файл = страница, `_index.md` — название и вступление раздела.
// Порядок задают числовые префиксы в именах (`01-…`), в адресе они отбрасываются. Подробности для автора — docs/knowledge-base.md.
//
//   server/content/knowledge/
//     00-nachalo-raboty.md              ← страница верхнего уровня
//     02-yuridicheskaya-kariera/
//       _index.md                       ← название раздела и вступление
//       01-kak-iskat-rabotu.md          ← страница
//
// В начале файла — необязательный блок:
//   ---
//   title: Как искать работу
//   icon: briefcase        (значок раздела из набора на сайте)
//   draft: true            (черновик: видит только администратор)
//   updated: 2026-10-26
//   ---
//
// Файлы читает только сервер и отдаёт их только резидентам с действующей подпиской и администратору (проверка в index.js);
// адрес страницы берётся из индекса, а не из пути в запросе, поэтому выйти за пределы папки нельзя.
import fs from 'node:fs'
import path from 'node:path'

export const KB_DIR = process.env.KB_DIR || path.join(import.meta.dirname, '..', 'content', 'knowledge')

const WORDS_PER_MIN = 180
const INDEX_TTL_MS = 5000
const MAX_RESULTS = 30

/** Блок «---» в начале файла → { meta, body }. Значения — простые «ключ: значение», кавычки по краям снимаются. */
export function parseFrontMatter(text) {
  const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src)
  if (!m) return { meta: {}, body: src.trim() }
  const meta = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim())
    if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["'«](.*)["'»]$/, '$1').trim()
  }
  return { meta, body: src.slice(m[0].length).trim() }
}

const slugOf = (name) => name.replace(/\.md$/i, '').replace(/^\d+[-_.]\s*/, '').toLowerCase()
const orderOf = (name) => {
  const m = /^(\d+)[-_.]/.exec(name)
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY
}
const prettify = (slug) => {
  const s = slug.replace(/[-_]+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : slug
}
const byOrder = (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ru')
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е')
const plain = (md) => md.replace(/```[\s\S]*?```/g, ' ').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`|~-]+/g, ' ').replace(/\s+/g, ' ').trim()

function readDir(dir, parent, nodes) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  const list = []
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === '_index.md') continue
    if (e.isDirectory()) list.push({ name: e.name, order: orderOf(e.name), dir: true })
    else if (e.isFile() && /\.md$/i.test(e.name)) list.push({ name: e.name, order: orderOf(e.name), dir: false })
  }
  list.sort(byOrder)
  for (const item of list) {
    const slug = slugOf(item.name)
    if (!slug) continue
    const id = parent ? `${parent}/${slug}` : slug
    if (item.dir) {
      const sub = path.join(dir, item.name)
      const indexFile = path.join(sub, '_index.md')
      const raw = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : ''
      const { meta, body } = parseFrontMatter(raw)
      nodes.push({ id, parent, folder: true, title: meta.title || prettify(slug), icon: meta.icon || '', draft: meta.draft === 'true', body, updated: meta.updated || '' })
      readDir(sub, id, nodes)
    } else {
      const file = path.join(dir, item.name)
      const { meta, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'))
      nodes.push({ id, parent, folder: false, title: meta.title || prettify(slug), icon: meta.icon || '', draft: meta.draft === 'true', body, updated: meta.updated || new Date(fs.statSync(file).mtimeMs).toISOString().slice(0, 10) })
    }
  }
}

let cache = { at: 0, index: null }

/** Кто что видит: администратор — всё, резидент — страницы с текстом без черновиков (в том числе внутри черновика) и папки, где есть такие страницы. */
function buildVisibility(nodes) {
  const draftDeep = new Map()
  for (const n of nodes) draftDeep.set(n.id, n.draft || (n.parent ? draftDeep.get(n.parent) === true : false))
  const member = new Set()
  for (const n of nodes) if (!draftDeep.get(n.id) && n.body.length > 0) member.add(n.id)
  // Обход идёт сверху вниз, поэтому в обратном порядке видимость поднимается от страниц к папкам любой глубины.
  for (let i = nodes.length - 1; i >= 0; i--) if (member.has(nodes[i].id) && nodes[i].parent) member.add(nodes[i].parent)
  const admin = new Set(nodes.map((n) => n.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const countsFor = (set) => {
    const counts = new Map()
    for (const n of nodes) {
      if (n.folder || !set.has(n.id)) continue
      for (let p = n.parent; p; p = byId.get(p)?.parent) counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    return counts
  }
  return { admin: { set: admin, counts: countsFor(admin) }, member: { set: member, counts: countsFor(member) } }
}

/** Индекс всей базы: узлы в порядке обхода, словарь по адресу и видимость по ролям. Перечитывается не чаще раза в несколько секунд. */
function getIndex() {
  const now = Date.now()
  if (cache.index && now - cache.at < INDEX_TTL_MS) return cache.index
  const nodes = []
  readDir(KB_DIR, '', nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const n of nodes) {
    n.words = plain(n.body).split(' ').filter(Boolean).length
    n.hay = norm(`${n.title}\n${n.body}`)
    n.titleNorm = norm(n.title)
    n.headings = norm((n.body.match(/^#{1,4}\s.+$/gm) ?? []).join('\n'))
  }
  cache = { at: now, index: { nodes, byId, vis: buildVisibility(nodes) } }
  return cache.index
}

/** Сбросить кэш (для тестов и после загрузки новых файлов). */
export function resetKnowledgeCache() {
  cache = { at: 0, index: null }
}

const visFor = (index, admin) => (admin ? index.vis.admin : index.vis.member)

/** Дерево для боковой панели: { id, parent, title, icon, folder, draft, pages, hasBody }. */
export function knowledgeTree({ admin = false } = {}) {
  const index = getIndex()
  const { set, counts } = visFor(index, admin)
  return index.nodes
    .filter((n) => set.has(n.id))
    .map((n) => ({
      id: n.id,
      parent: n.parent || null,
      title: n.title,
      icon: n.icon,
      folder: n.folder,
      draft: n.draft || undefined,
      hasBody: n.body.length > 0,
      pages: n.folder ? counts.get(n.id) ?? 0 : undefined,
    }))
}

/** Страница или вступление раздела: текст, путь из разделов, вложенные узлы и соседи по порядку чтения. null — нет такой (или не видна). */
export function knowledgePage(id, { admin = false } = {}) {
  const index = getIndex()
  const node = index.byId.get(String(id))
  const { set, counts } = visFor(index, admin)
  if (!node || !set.has(node.id)) return null
  const crumbs = []
  for (let p = node.parent; p; p = index.byId.get(p)?.parent) crumbs.unshift({ id: p, title: index.byId.get(p).title })
  const children = index.nodes
    .filter((n) => n.parent === node.id && set.has(n.id))
    .map((n) => ({ id: n.id, title: n.title, icon: n.icon, folder: n.folder, draft: n.draft || undefined, pages: n.folder ? counts.get(n.id) ?? 0 : undefined }))
  // Порядок чтения: страницы и вступления разделов с текстом — в порядке обхода дерева.
  const readable = index.nodes.filter((n) => set.has(n.id) && n.body.length > 0)
  const at = readable.findIndex((n) => n.id === node.id)
  const near = (n) => (n ? { id: n.id, title: n.title } : null)
  return {
    id: node.id,
    title: node.title,
    icon: node.icon,
    folder: node.folder,
    draft: node.draft || undefined,
    body: node.body,
    updated: node.updated || null,
    readMin: Math.max(1, Math.round(node.words / WORDS_PER_MIN)),
    crumbs,
    children,
    prev: at > 0 ? near(readable[at - 1]) : null,
    next: at >= 0 ? near(readable[at + 1]) : null,
  }
}

/** Первая страница для открытия базы: «Начало работы» (адрес nachalo-raboty), иначе первая видимая страница с текстом. */
export function knowledgeFirstId({ admin = false } = {}) {
  const index = getIndex()
  const { set } = visFor(index, admin)
  const start = index.byId.get('nachalo-raboty')
  if (start && set.has(start.id) && start.body) return start.id
  return index.nodes.find((n) => set.has(n.id) && n.body.length > 0)?.id ?? null
}

/** Поиск по заголовкам и тексту: все слова запроса должны встретиться; заголовок весит больше подзаголовков и текста. */
export function knowledgeSearch(query, { admin = false } = {}) {
  const words = norm(query).split(/[\s,.;:!?()«»"]+/).filter((w) => w.length >= 2).slice(0, 8)
  if (!words.length) return []
  const index = getIndex()
  const { set } = visFor(index, admin)
  const results = []
  for (const n of index.nodes) {
    if (!set.has(n.id) || !n.body) continue
    if (!words.every((w) => n.hay.includes(w))) continue
    let score = 0
    for (const w of words) {
      if (n.titleNorm.includes(w)) score += 20
      if (n.headings.includes(w)) score += 6
      score += Math.min(10, n.hay.split(w).length - 1)
    }
    const text = plain(n.body)
    const at = norm(text).indexOf(words[0])
    const from = Math.max(0, (at < 0 ? 0 : at) - 70)
    const snippet = `${from > 0 ? '…' : ''}${text.slice(from, from + 190)}${from + 190 < text.length ? '…' : ''}`
    const crumbs = []
    for (let p = n.parent; p; p = index.byId.get(p)?.parent) crumbs.unshift(index.byId.get(p).title)
    results.push({ id: n.id, title: n.title, crumbs, snippet, score, draft: n.draft || undefined })
  }
  return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS).map(({ score: _score, ...r }) => r)
}

/** Сводка для карточки в кабинете: сколько страниц и разделов видно. */
export function knowledgeStats({ admin = false } = {}) {
  const index = getIndex()
  const { set } = visFor(index, admin)
  const visible = index.nodes.filter((n) => set.has(n.id))
  return { pages: visible.filter((n) => !n.folder && n.body).length, sections: visible.filter((n) => n.folder && !n.parent).length }
}

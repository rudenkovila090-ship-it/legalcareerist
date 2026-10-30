// Содержимое раздела «Построение карьеры»: всё, что автор меняет файлами, без правки кода (подробности — docs/career-content.md).
// Папка server/content/career (или CAREER_DIR):
//   routes.json        — справочник карьерного плана: ступени, практики, сроки, группы и шаги (кому какие шаги подходят);
//   capital.json       — анкета «Мой профессиональный капитал»: разделы и поля;
//   interview/*.md     — банк вопросов для подготовки к интервью: файл = блок, `## Вопрос` = вопрос, текст под ним = ответ;
//   templates.json     — каталог шаблонов (сами файлы лежат в server/assets/templates).
// Файлы читает только сервер и отдаёт резидентам и администратору (проверка — в careerCabinet.js).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseFrontMatter } from './knowledgeBase.js'

export const CAREER_DIR = process.env.CAREER_DIR || path.join(import.meta.dirname, '..', 'content', 'career')
export const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(import.meta.dirname, '..', 'assets', 'templates')
const TTL_MS = 5000
const cache = new Map()

function cached(key, build) {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && now - hit.at < TTL_MS) return hit.value
  const value = build()
  cache.set(key, { at: now, value })
  return value
}

export const resetCareerCache = () => cache.clear()

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CAREER_DIR, name), 'utf8'))
  } catch {
    return fallback
  }
}

const str = (v, n = 300) => String(v ?? '').trim().slice(0, n)

// ---- Карьерный план ----

/** Справочник плана: ступени (по порядку), практики, сроки, группы шагов и сам перечень шагов. */
export function routeBook() {
  return cached('routes', () => {
    const raw = readJson('routes.json', {})
    const pick = (list) => (Array.isArray(list) ? list.filter((x) => x && x.id && x.label).map((x) => ({ id: str(x.id, 40), label: str(x.label, 80) })) : [])
    const stages = pick(raw.stages)
    const ids = new Set(stages.map((s) => s.id))
    const groups = pick(raw.groups)
    const steps = (Array.isArray(raw.steps) ? raw.steps : [])
      .filter((s) => s && s.id && s.title)
      .map((s) => ({
        id: str(s.id, 60),
        title: str(s.title, 160),
        text: str(s.text, 400),
        group: str(s.group, 40),
        from: ids.has(s.from) ? s.from : stages[0]?.id,
        to: ids.has(s.to) ? s.to : stages.at(-1)?.id,
        areas: Array.isArray(s.areas) ? s.areas.map((a) => str(a, 40)) : [],
        link: s.link && s.link.to ? { to: str(s.link.to, 200), label: str(s.link.label, 60) || 'Открыть' } : null,
      }))
    return { stages, areas: pick(raw.areas), terms: pick(raw.terms), groups, steps }
  })
}

/** Шаги плана «из ступени A в ступень B» для практики: шаги, окно которых пересекается с путём; у шага с areas — только своей практики. */
export function planSteps({ from, to, area }) {
  const book = routeBook()
  const order = new Map(book.stages.map((s, i) => [s.id, i]))
  const a = order.get(from)
  const b = order.get(to)
  if (a === undefined || b === undefined || b < a) return null
  return book.steps.filter((s) => order.get(s.from) <= b && order.get(s.to) >= a && (!s.areas.length || s.areas.includes(area)))
}

// ---- Профессиональный капитал ----

/** Анкета: разделы с полями; тип поля — text (одна строка) или textarea. */
export function capitalSchema() {
  return cached('capital', () => {
    const raw = readJson('capital.json', {})
    const sections = (Array.isArray(raw.sections) ? raw.sections : [])
      .filter((s) => s && s.id && s.title && Array.isArray(s.fields))
      .map((s) => ({
        id: str(s.id, 40),
        title: str(s.title, 100),
        hint: str(s.hint, 300),
        fields: s.fields.filter((f) => f && f.id && f.label).map((f) => ({ id: str(f.id, 60), label: str(f.label, 120), hint: str(f.hint, 300), type: f.type === 'text' ? 'text' : 'textarea' })),
      }))
    return { intro: str(raw.intro, 600), sections }
  })
}

export const capitalFieldIds = () => new Set(capitalSchema().sections.flatMap((s) => s.fields.map((f) => f.id)))

// ---- Подготовка к интервью ----

const slugOf = (name) => name.replace(/\.md$/i, '').replace(/^\d+[-_.]\s*/, '').toLowerCase()
const orderOf = (name) => {
  const m = /^(\d+)[-_.]/.exec(name)
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY
}
const qid = (block, question) => `${block}:${crypto.createHash('sha1').update(question.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8)}`

/** Блоки вопросов: [{ id, title, summary, icon, lead, questions: [{ id, q, a }] }]; блоки без вопросов и черновики пропускаются. */
export function interviewBlocks() {
  return cached('interview', () => {
    const dir = path.join(CAREER_DIR, 'interview')
    let names = []
    try {
      names = fs.readdirSync(dir).filter((n) => /\.md$/i.test(n) && !n.startsWith('.'))
    } catch {
      return []
    }
    names.sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b, 'ru'))
    const blocks = []
    for (const name of names) {
      const id = slugOf(name)
      if (!id) continue
      const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(dir, name), 'utf8'))
      if (meta.draft === 'true') continue
      const parts = body.split(/^##\s+/m)
      const lead = parts.shift().trim()
      const questions = []
      const seen = new Set()
      for (const part of parts) {
        const nl = part.indexOf('\n')
        const q = (nl < 0 ? part : part.slice(0, nl)).trim()
        const a = nl < 0 ? '' : part.slice(nl + 1).trim()
        if (!q || !a) continue
        let key = qid(id, q)
        while (seen.has(key)) key = `${key}x`
        seen.add(key)
        questions.push({ id: key, q, a })
      }
      if (!questions.length) continue
      blocks.push({ id, title: meta.title || id, summary: meta.summary || lead.split('\n')[0] || '', icon: meta.icon || '', lead, questions })
    }
    return blocks
  })
}

/** Все идентификаторы вопросов: чтобы отметка «разобрал» принималась только для существующих. */
export const interviewQuestionIds = () => new Set(interviewBlocks().flatMap((b) => b.questions.map((q) => q.id)))

// ---- Шаблоны ----

/** Каталог: категории и доступные шаблоны (запись есть в templates.json и файл лежит в server/assets/templates). */
export function templateCatalog() {
  return cached('templates', () => {
    const raw = readJson('templates.json', {})
    const categories = (Array.isArray(raw.categories) ? raw.categories : []).filter((c) => c && c.id && c.title).map((c) => ({ id: str(c.id, 40), title: str(c.title, 100), hint: str(c.hint, 300) }))
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .filter((t) => t && t.slug && t.title && t.file && !t.draft)
      .map((t) => ({ slug: str(t.slug, 80), category: str(t.category, 40), title: str(t.title, 120), summary: str(t.summary, 300), file: path.basename(String(t.file)), format: str(t.format, 12) || path.extname(String(t.file)).slice(1).toLowerCase() }))
      .filter((t) => fs.existsSync(path.join(TEMPLATES_DIR, t.file)))
    return { categories, items }
  })
}

/** Путь к файлу шаблона по адресу; null — такого нет (имя берётся из каталога, а не из запроса). */
export function templateFile(slug) {
  const item = templateCatalog().items.find((t) => t.slug === slug)
  return item ? { ...item, path: path.join(TEMPLATES_DIR, item.file) } : null
}

/** Проверка содержимого для автора (server/scripts/checkCareer.js). */
export function careerCheck() {
  const problems = []
  const book = routeBook()
  const stageIds = new Set(book.stages.map((s) => s.id))
  const groupIds = new Set(book.groups.map((g) => g.id))
  if (!book.stages.length) problems.push('routes.json: нет ступеней (stages)')
  const raw = readJson('routes.json', {})
  const ids = new Set()
  for (const s of Array.isArray(raw.steps) ? raw.steps : []) {
    if (!s?.id || !s?.title) { problems.push('routes.json: у шага нет id или title'); continue }
    if (ids.has(s.id)) problems.push(`routes.json: повтор id шага «${s.id}»`)
    ids.add(s.id)
    if (s.from && !stageIds.has(s.from)) problems.push(`routes.json: шаг «${s.id}»: нет ступени from «${s.from}»`)
    if (s.to && !stageIds.has(s.to)) problems.push(`routes.json: шаг «${s.id}»: нет ступени to «${s.to}»`)
    if (s.group && !groupIds.has(s.group)) problems.push(`routes.json: шаг «${s.id}»: нет группы «${s.group}»`)
  }
  const blocks = interviewBlocks()
  const total = blocks.reduce((n, b) => n + b.questions.length, 0)
  const schema = capitalSchema()
  const tpl = readJson('templates.json', { items: [] })
  for (const t of Array.isArray(tpl.items) ? tpl.items : []) {
    if (t.draft) continue
    if (!t.file || !fs.existsSync(path.join(TEMPLATES_DIR, path.basename(String(t.file))))) problems.push(`templates.json: «${t.slug}»: файла «${t.file}» нет в ${TEMPLATES_DIR}`)
  }
  return { steps: book.steps.length, blocks: blocks.length, questions: total, capitalFields: schema.sections.reduce((n, s) => n + s.fields.length, 0), templates: templateCatalog().items.length, problems }
}

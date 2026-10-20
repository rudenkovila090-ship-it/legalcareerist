// Именной билет на мероприятие: картинка-шаблон из server/assets/tickets (без имени, номера, контактов, даты оплаты и штрихкода)
// и поверх неё — данные покупателя. Билет уходит вложением в письмо об оплате (см. sendTicketMail в index.js).
// Шаблон и координаты — на одно мероприятие; у остальных билета нет, письмо уходит без вложения.
import fs from 'node:fs'
import path from 'node:path'
import { code128B, modulesOf } from './code128.js'

const ASSETS = path.join(import.meta.dirname, '..', 'assets')

/** Мероприятия, у которых есть билет-картинка: по slug из каталога. prefix — буквы перед номером в коде билета. */
export const TICKET_TEMPLATES = {
  'dzhazovyy-vecher-dlya-yuristov-2': { file: 'legal-night-jazz-2.png', prefix: 'LNJ2' },
}

export const hasTicketImage = (slug) => Object.hasOwn(TICKET_TEMPLATES, slug)

/** Код билета для штрихкода и подписи: LNJ2-000147. */
export const ticketCode = (slug, number) => `${TICKET_TEMPLATES[slug].prefix}-${String(number).padStart(6, '0')}`

// Библиотека рисования подключается при первом билете, а не при старте сервера: если на сервере она не загрузится,
// пострадает только вложение, а бот, сайт и письма без билета продолжат работать.
let canvasLib = null
async function loadCanvas() {
  canvasLib ??= await import('@napi-rs/canvas')
  return canvasLib
}

// Шрифты: латиница и кириллица лежат отдельными файлами, поэтому в списке семейств кириллица идёт первой, латиница — запасной.
let fontsReady = false
function registerFonts({ GlobalFonts }) {
  if (fontsReady) return
  const dir = path.join(ASSETS, 'fonts')
  const reg = (file, family) => GlobalFonts.registerFromPath(path.join(dir, file), family)
  reg('playfair-display-cyrillic-700-italic.woff2', 'TkNameCyr')
  reg('playfair-display-latin-700-italic.woff2', 'TkNameLat')
  reg('ibm-plex-mono-cyrillic-500-normal.woff2', 'TkMonoCyr500')
  reg('ibm-plex-mono-latin-500-normal.woff2', 'TkMonoLat500')
  reg('ibm-plex-mono-cyrillic-600-normal.woff2', 'TkMonoCyr600')
  reg('ibm-plex-mono-latin-600-normal.woff2', 'TkMonoLat600')
  fontsReady = true
}
const NAME_FONT = (size) => `italic 700 ${size}px "TkNameCyr", "TkNameLat", serif`
const MONO_FONT = (weight, size) => `${weight} ${size}px "TkMonoCyr${weight}", "TkMonoLat${weight}", monospace`

// Координаты на шаблоне 2000×1000 (пиксели).
const LAYOUT = {
  name: { x: 576, baseline: 944, maxWidth: 668, size: 62, minSize: 34 },
  phone: { right: 1518, baseline: 909, maxWidth: 242, size: 25.4 },
  email: { right: 1518, baseline: 945, maxWidth: 242, size: 25.4 },
  number: { center: 1771, baseline: 193, size: 87 },
  paidDate: { center: 1771, baseline: 545, size: 24 },
  barcode: { center: 1772, top: 630, height: 143, maxWidth: 335 },
  code: { center: 1771, baseline: 813, size: 28 },
}
const INK = '#1f1210'
const INK_SOFT = '#33200f'
const RED = '#ac1f37'
const STAMP_RED = '#a82f38'

const templates = new Map()
async function loadTemplate(file, { loadImage }) {
  if (!templates.has(file)) templates.set(file, await loadImage(fs.readFileSync(path.join(ASSETS, 'tickets', file))))
  return templates.get(file)
}

/** Имя для билета: без лишних знаков, с заглавными буквами, если человек набрал всё строчными или всё заглавными. */
export function tidyName(raw) {
  const s = String(raw ?? '')
    .replace(/[^\p{L}\p{N}\s.\-'’]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
  if (/\p{Ll}/u.test(s) && /\p{Lu}/u.test(s)) return s
  return s.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
}

/** +7 900 ••• ••-67: на билете, который могут переслать или сфотографировать, телефон показываем не целиком. */
export function maskPhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length < 7) return ''
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return `+7 ${digits.slice(1, 4)} ••• ••-${digits.slice(-2)}`
  return `+${digits.slice(0, 3)} ••• ••-${digits.slice(-2)}`
}

/** iv•••••@mail.ru */
export function maskEmail(raw) {
  const m = String(raw ?? '').trim().match(/^([^@\s]+)@([^@\s]+)$/)
  if (!m) return ''
  // адреса не зависят от регистра, на билете пишем строчными: «Iv•••@Mail.ru» выглядит как опечатка
  const [, local, domain] = [m[0], m[1].toLowerCase(), m[2].toLowerCase()]
  return `${[...local].slice(0, local.length > 3 ? 2 : 1).join('')}•••••@${domain}`
}

/** Сколько пикселей займёт строка с межбуквенным интервалом. */
function spacedWidth(ctx, text, spacing) {
  const chars = [...text]
  return chars.reduce((w, ch) => w + ctx.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1)
}

/** Рисует строку посимвольно (так выходит ровный моноширинный шрифт с интервалом). align: left | center | right. */
function drawSpaced(ctx, text, x, y, { spacing = 0, align = 'left' } = {}) {
  const width = spacedWidth(ctx, text, spacing)
  let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x
  ctx.textAlign = 'left'
  for (const ch of [...text]) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + spacing
  }
}

/** Подбирает размер шрифта, чтобы строка влезла в maxWidth; если и на минимальном не влезает — обрезает с многоточием. */
function fitText(ctx, text, fontFor, maxWidth, size, minSize) {
  let s = size
  ctx.font = fontFor(s)
  while (ctx.measureText(text).width > maxWidth && s > minSize) {
    s -= 1
    ctx.font = fontFor(s)
  }
  let out = text
  while (ctx.measureText(out).width > maxWidth && out.length > 1) {
    out = `${out.slice(0, -2).trimEnd()}…`
    if (out === '…') break
  }
  return out
}

/**
 * Рисует билет. Возвращает { buffer (JPEG), filename, contentType, code } или null, если для мероприятия нет шаблона.
 * data: { eventSlug, number, name, phone, email, paidAt (мс) }.
 */
export async function renderTicket({ eventSlug, number, name, phone, email, paidAt = Date.now() }) {
  const tpl = TICKET_TEMPLATES[eventSlug]
  if (!tpl) return null
  const lib = await loadCanvas()
  registerFonts(lib)
  const image = await loadTemplate(tpl.file, lib)
  const canvas = lib.createCanvas(image.width, image.height)
  const ctx = canvas.getContext('2d')
  // белая подложка: углы билета прозрачные, а в JPEG прозрачности нет
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0)
  ctx.textBaseline = 'alphabetic'

  const L = LAYOUT
  // имя гостя
  const shownName = tidyName(name)
  if (shownName) {
    ctx.fillStyle = INK
    const fitted = fitText(ctx, shownName, NAME_FONT, L.name.maxWidth, L.name.size, L.name.minSize)
    ctx.textAlign = 'left'
    ctx.fillText(fitted, L.name.x, L.name.baseline)
  }

  // контакты: если телефона нет, почта встаёт на строку телефона
  const lines = [maskPhone(phone), maskEmail(email)].filter(Boolean)
  const slots = lines.length === 1 ? [L.email] : [L.phone, L.email]
  lines.forEach((line, i) => {
    const slot = slots[i]
    ctx.fillStyle = INK_SOFT
    const fitted = fitText(ctx, line, (s) => MONO_FONT(500, s), slot.maxWidth, slot.size, 18)
    drawSpaced(ctx, fitted, slot.right, slot.baseline, { align: 'right' })
  })

  // номер билета
  ctx.fillStyle = RED
  ctx.font = MONO_FONT(500, L.number.size)
  drawSpaced(ctx, String(number).padStart(6, '0'), L.number.center, L.number.baseline, { align: 'center', spacing: -1 })

  // дата оплаты в штампе
  const paidDate = new Date(paidAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Moscow' })
  ctx.fillStyle = STAMP_RED
  ctx.globalAlpha = 0.95
  ctx.font = MONO_FONT(600, L.paidDate.size)
  drawSpaced(ctx, paidDate, L.paidDate.center, L.paidDate.baseline, { align: 'center', spacing: 0.6 })
  ctx.globalAlpha = 1

  // штрихкод и его подпись
  const code = ticketCode(eventSlug, number)
  const widths = code128B(code)
  const unit = Math.max(1, Math.floor(L.barcode.maxWidth / modulesOf(widths)))
  let bx = Math.round(L.barcode.center - (modulesOf(widths) * unit) / 2)
  ctx.fillStyle = INK
  widths.forEach((w, i) => {
    if (i % 2 === 0) ctx.fillRect(bx, L.barcode.top, w * unit, L.barcode.height)
    bx += w * unit
  })
  ctx.fillStyle = INK_SOFT
  ctx.font = MONO_FONT(500, L.code.size)
  drawSpaced(ctx, code, L.code.center, L.code.baseline, { align: 'center', spacing: 1.2 })

  return {
    buffer: canvas.toBuffer('image/jpeg', 92),
    filename: `bilet-${code.toLowerCase()}.jpg`,
    contentType: 'image/jpeg',
    code,
  }
}

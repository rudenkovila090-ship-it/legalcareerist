// «Откуда вы о нас узнали?» — свободный ответ человека в форме сайта. Хранится в карточке заявки
// (поле howHeard) и дополняет UTM-метки: ловит источники, которые метки не видят (рекомендация, подкаст, выступление).

/** Чистит ответ из формы: строка, без управляющих символов и лишних пробелов, не длиннее 200 символов. */
export function cleanHowHeard(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

/** Строка для уведомления админу или карточки; пустой ответ → null. */
export function howHeardLine(value) {
  const text = cleanHowHeard(value)
  return text ? `🗣 Откуда узнали: ${text}` : null
}

import fs from 'node:fs'
import path from 'node:path'

const DAY = 24 * 3600 * 1000
const MSK = 'Europe/Moscow'
const ruDateTime = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'lead-sources.jsonl')
const NO_UTM = 'без метки'

/**
 * Журнал всех заявок с сайта (в т. ч. тех, что не создают отдельную запись: поддержка, контакты, амбассадоры, партнёры):
 * время, что за форма, кто, ответ на «Откуда узнали» (может быть пустым) и UTM-метка. По нему считается сводка в админ-боте.
 */
export function logLeadSource({ kind, name, answer, utm }) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.appendFileSync(FILE, `${JSON.stringify({ at: Date.now(), kind: kind || 'Заявка', name: name || 'без имени', answer: cleanHowHeard(answer), utm: utm || NO_UTM })}\n`)
  } catch (err) {
    console.error('[howHeard] не удалось записать журнал:', err.message)
  }
}

function readLeadSources() {
  try {
    return fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

/** Ключ для группировки ответов: регистр, пунктуация и «ё» не должны плодить варианты («Подкаст», «подкаст!»). */
function groupKey(answer) {
  return answer.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim()
}

const short = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** Экран админ-бота «Откуда узнали»: сколько ответили, топ ответов, что видят метки, последние ответы. */
export function howHeardScreen(period = '30', now = Date.now()) {
  const from = period === 'all' ? 0 : now - 30 * DAY
  const rows = readLeadSources().filter((r) => r.at >= from)
  const answered = rows.filter((r) => r.answer)
  const title = period === 'all' ? 'за всё время' : 'за 30 дней'

  const lines = [`🗣 Откуда узнали · ${title}`, '']
  if (!rows.length) {
    lines.push('Заявок за этот период нет (учёт ведётся с момента добавления вопроса на сайт).')
  } else {
    lines.push(`Заявок: ${rows.length} · ответили на вопрос: ${answered.length} (${Math.round((answered.length / rows.length) * 100)}%)`)
    const groups = new Map()
    for (const r of answered) {
      const key = groupKey(r.answer) || r.answer.toLowerCase()
      const g = groups.get(key) ?? { label: r.answer, count: 0 }
      g.count += 1
      groups.set(key, g)
    }
    if (groups.size) {
      lines.push('', 'Ответы (как пишут люди):')
      for (const g of [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 15)) lines.push(`• ${short(g.label, 80)} — ${g.count}`)
      if (groups.size > 15) lines.push(`… и ещё ${groups.size - 15} разных ответов`)
    }
    const noUtm = answered.filter((r) => r.utm === NO_UTM)
    lines.push('', `📌 Без UTM-метки, но с ответом: ${noUtm.length} — источники, которых метки не увидели`, `С меткой и ответом: ${answered.length - noUtm.length}`)
    const last = [...answered].sort((a, b) => b.at - a.at).slice(0, 10)
    if (last.length) {
      lines.push('', 'Последние ответы:')
      for (const r of last) lines.push(`${ruDateTime(r.at)} · ${r.kind} · ${r.name}: ${short(r.answer, 80)}${r.utm !== NO_UTM ? ` [${r.utm}]` : ''}`)
    }
  }
  return {
    text: lines.join('\n'),
    keyboard: [
      [{ text: period === 'all' ? '30 дней' : '✓ 30 дней', callback_data: 'a:x:src:30' }, { text: period === 'all' ? '✓ Всё время' : 'Всё время', callback_data: 'a:x:src:all' }],
      [{ text: '⬅️ Система', callback_data: 'a:x:sys' }, { text: '🏠 Меню', callback_data: 'a:menu' }],
    ],
  }
}

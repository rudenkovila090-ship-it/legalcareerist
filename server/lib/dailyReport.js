// Ежедневный отчёт по сообществу для админа: выручка за день, новые подписки
// и продления, отписки, ближайшие списания. Считается по карточкам
// подписчиков (store.js), поэтому включает только платежи, учтённые после
// запуска учёта, — история до этого в отчёт не попадает.
const MSK = 'Europe/Moscow'

/** Ключ дня по Москве: 2026-09-29. */
export function mskDayKey(timestamp) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: MSK }).format(new Date(timestamp))
}

function formatRub(amount) {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`
}

function formatRuDay(timestamp) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(timestamp))
}

/** Подпись тарифа платежа: наш тариф (1/3/6 месяцев) или название подписки Prodamus (скидочные тарифы). */
function tariffLabel(payment, tariffs) {
  const known = tariffs[payment.tariffId]
  if (known) return known.period
  return payment.subscriptionName ? `${payment.subscriptionName}` : 'другой тариф'
}

function tariffKey(payment, tariffs) {
  return tariffs[payment.tariffId] ? payment.tariffId : `sub:${payment.subscriptionId ?? payment.subscriptionName ?? '?'}`
}

function contactLine(join) {
  const parts = [join.name && join.name !== '—' ? join.name : null, join.telegram || null, join.phone || null].filter(Boolean)
  return parts.length ? parts.join(', ') : 'контакты не указаны'
}

const DAY = 24 * 3600 * 1000

/** Разбирает аргумент команды /report: сегодня (по умолчанию), вчера, неделя, месяц. */
export function parseReportPeriod(arg) {
  const a = String(arg ?? '').trim().toLowerCase()
  if (a.startsWith('вчера')) return 'yesterday'
  if (a.startsWith('недел')) return 'week'
  if (a.startsWith('месяц')) return 'month'
  return 'today'
}

/** Границы периода (включительно) в ключах дней по Москве и заголовок. */
function periodRange(period, now) {
  const today = mskDayKey(now)
  if (period === 'yesterday') {
    const day = mskDayKey(now - DAY)
    return { from: day, to: day, title: formatRuDay(now - DAY) }
  }
  if (period === 'week') return { from: mskDayKey(now - 6 * DAY), to: today, title: `7 дней, по ${formatRuDay(now)}` }
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today, title: `с 01.${today.slice(5, 7)}.${today.slice(0, 4)} по ${formatRuDay(now)}` }
  return { from: today, to: today, title: formatRuDay(now) }
}

/**
 * Собирает текст отчёта за период (по умолчанию — сегодня, по Москве).
 * joins — массив карточек из store.listJoins(), tariffs — TARIFFS из prodamus.js.
 */
export function buildDailyReport(joins, now, tariffs, period = 'today') {
  const { from, to, title } = periodRange(period, now)
  const inRange = (ts) => {
    const day = mskDayKey(ts)
    return day >= from && day <= to
  }
  const tomorrow = mskDayKey(now + DAY)

  const payments = []
  for (const join of joins) {
    for (const p of join.payments ?? []) {
      if (p.estimated || !p.at || !inRange(p.at)) continue
      payments.push({ ...p, join })
    }
  }
  const first = payments.filter((p) => p.kind === 'first')
  const renewals = payments.filter((p) => p.kind === 'renewal')
  const sum = (list) => list.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)

  const cancelled = joins.filter((j) => j.cancelledAt && inRange(j.cancelledAt))
  const active = joins.filter((j) => j.status === 'active' && !j.lifetime)
  const dueTomorrow = active.filter((j) => j.nextPaymentAt && mskDayKey(j.nextPaymentAt) === tomorrow)

  const byTariff = new Map()
  for (const p of payments) {
    const key = tariffKey(p, tariffs)
    const row = byTariff.get(key) ?? { label: tariffLabel(p, tariffs), count: 0, total: 0 }
    row.count += 1
    row.total += Number(p.amount) || 0
    byTariff.set(key, row)
  }

  const lines = [`📊 Отчёт по сообществу · ${title}`, '']
  if (!payments.length && !cancelled.length) {
    lines.push('За этот период оплат и отписок не было.')
  } else {
    lines.push(`💰 Выручка за период: ${formatRub(sum(payments))} (платежей: ${payments.length})`)
    lines.push(`🆕 Новых подписок: ${first.length} · ${formatRub(sum(first))}`)
    lines.push(`🔁 Продлений: ${renewals.length} · ${formatRub(sum(renewals))}`)
    if (byTariff.size) {
      lines.push('', 'По тарифам:')
      for (const row of byTariff.values()) lines.push(`• ${row.label} — ${row.count} × ${formatRub(row.total / row.count)} = ${formatRub(row.total)}`)
    }
    if (first.length) {
      lines.push('', '🆕 Кто подписался:')
      for (const p of first) lines.push(`• ${contactLine(p.join)} (${tariffLabel(p, tariffs)})`)
    }
    if (cancelled.length) {
      lines.push('', '🔕 Кто отписался — стоит написать и узнать причину:')
      for (const j of cancelled) lines.push(`• ${contactLine(j)}`)
    }
  }

  lines.push('', `⏭️ Списаний завтра: ${dueTomorrow.length}${dueTomorrow.length ? ` · ~${formatRub(dueTomorrow.reduce((acc, j) => acc + (Number(j.payments?.at(-1)?.amount) || 0), 0))}` : ''}`)

  const activeByTariff = new Map()
  for (const j of active) {
    const label = tariffs[j.tariffId]?.period ?? tariffLabel(j.payments?.at(-1) ?? {}, tariffs)
    activeByTariff.set(label, (activeByTariff.get(label) ?? 0) + 1)
  }
  const breakdown = [...activeByTariff].map(([label, n]) => `${label} — ${n}`).join(', ')
  lines.push(`👥 Активных подписчиков: ${active.length}${breakdown ? ` (${breakdown})` : ''}`)
  return lines.join('\n')
}

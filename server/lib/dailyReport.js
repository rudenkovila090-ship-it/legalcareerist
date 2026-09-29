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

/**
 * Собирает текст отчёта за день, в который попадает `now` (по Москве).
 * joins — массив карточек из store.listJoins(), tariffs — TARIFFS из prodamus.js.
 */
export function buildDailyReport(joins, now, tariffs) {
  const today = mskDayKey(now)
  const tomorrow = mskDayKey(now + 24 * 3600 * 1000)

  const payments = []
  for (const join of joins) {
    for (const p of join.payments ?? []) {
      if (p.estimated || !p.at || mskDayKey(p.at) !== today) continue
      payments.push({ ...p, join })
    }
  }
  const first = payments.filter((p) => p.kind === 'first')
  const renewals = payments.filter((p) => p.kind === 'renewal')
  const sum = (list) => list.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)

  const cancelled = joins.filter((j) => j.cancelledAt && mskDayKey(j.cancelledAt) === today)
  const active = joins.filter((j) => j.status === 'active')
  const dueTomorrow = active.filter((j) => j.nextPaymentAt && mskDayKey(j.nextPaymentAt) === tomorrow)

  const byTariff = new Map()
  for (const p of payments) {
    const key = tariffKey(p, tariffs)
    const row = byTariff.get(key) ?? { label: tariffLabel(p, tariffs), count: 0, total: 0 }
    row.count += 1
    row.total += Number(p.amount) || 0
    byTariff.set(key, row)
  }

  const lines = [`📊 Отчёт по сообществу · ${formatRuDay(now)}`, '']
  if (!payments.length && !cancelled.length) {
    lines.push('За сегодня оплат и отписок не было.')
  } else {
    lines.push(`💰 Выручка за день: ${formatRub(sum(payments))} (платежей: ${payments.length})`)
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

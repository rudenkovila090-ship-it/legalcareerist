// Выгрузка месяца в CSV для Excel/Google Таблиц: все доходы и расходы построчно.
// Разделитель — «;», в начале BOM, чтобы кириллица открылась без настроек.
import { mskDayKey } from './dailyReport.js'
import { dealPayments } from './deals.js'

const MSK = 'Europe/Moscow'
const dt = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

export function buildMonthCsv(data, monthKey) {
  const inMonth = (ts) => Boolean(ts) && mskDayKey(ts).slice(0, 7) === monthKey
  const rows = []
  const push = (at, source, description, amount, type = 'доход') => rows.push({ at, source, description, amount, type })

  for (const j of data.joins) {
    for (const p of j.payments ?? []) {
      if (p.estimated || !inMonth(p.at)) continue
      push(p.at, 'Сообщество', `${j.name && j.name !== '—' ? j.name : j.telegram || j.phone} · ${p.subscriptionName || p.tariffId || 'подписка'} · ${p.kind === 'renewal' ? 'продление' : 'первая оплата'}`, p.amount)
    }
  }
  for (const d of data.deals) for (const p of dealPayments(d)) if (inMonth(p.at)) push(p.at, 'Кадры (работодатели)', `Сделка №${d.number} ${d.company || d.name} · ${{ prepay: 'предоплата', final: 'остаток', total: 'оплата' }[p.kind] ?? p.kind}`, p.amount)
  for (const c of data.consultations) if (c.status === 'done' && inMonth(c.statusAt)) push(c.statusAt, 'Консультации', `№${c.number} ${c.name} · ${c.services.join(', ')}`, c.total ?? 0)
  for (const e of data.eventLeads) if (e.amount != null && inMonth(e.statusAt)) push(e.statusAt, 'Мероприятия', `№${e.number} ${e.name} · ${e.eventTitle} ${e.tariff}`, e.amount)
  for (const m of data.purchases ?? []) if (m.amount != null && inMonth(m.paidAt)) push(m.paidAt, 'Материалы', `${m.name || m.phone || ''} · ${m.materialSlug}`, m.amount)
  for (const e of data.expenses) if (inMonth(e.at)) push(e.at, 'Расходы', `${e.category}${e.note ? ` — ${e.note}` : ''}`, e.amount, 'расход')

  rows.sort((a, b) => a.at - b.at)
  const lines = [['Дата', 'Источник', 'Описание', 'Сумма', 'Тип'].map(cell).join(';'), ...rows.map((r) => [dt(r.at), r.source, r.description, String(r.amount).replace('.', ','), r.type].map(cell).join(';'))]
  return `\uFEFF${lines.join('\r\n')}`
}

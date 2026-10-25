// Письмо после оплаты подписки на сообщество: личная ссылка на вступление и её срок, сроки подписки, как отключить автопродление,
// ссылка на кабинет резидента. Собирается здесь, а шлёт его сервер после первой оплаты (и повторно по запросу из кабинета и бота).
import { INVITE_TTL_DAYS } from './communityInvite.js'

const MSK = 'Europe/Moscow'
const date = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts)).replace(/ г\./g, '')
const dateTime = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)).replace(/ г\./g, '')
const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/**
 * Возвращает { subject, text, html }.
 * invite — { url, expiresAt } или null (ссылку не удалось выдать: письмо честно говорит, что её пришлёт поддержка).
 * tariff — название тарифа; amount — сумма платежа; nextPaymentAt — дата следующего списания (null — автопродления нет);
 * oneTime — разовая подписка: доступ до nextPaymentAt, списаний нет.
 */
export function composeSubscriptionMail({ name, tariff, amount, paidAt, nextPaymentAt, oneTime, invite, siteUrl, botUsername, supportHandle }) {
  const hello = name && name !== '—' ? `Здравствуйте, ${name}!` : 'Здравствуйте!'
  const cabinetUrl = `${siteUrl}/cabinet`
  const botUrl = `https://t.me/${botUsername}`
  const supportUrl = `https://t.me/${String(supportHandle).replace(/^@/, '')}`
  const paid = 'Оплата получена — подписка на сообщество «Карьерный юрист» оформлена.'

  const inviteText = invite
    ? [
        'Ваша личная ссылка на вступление в закрытый чат сообщества:',
        invite.url,
        `Нажмите на ссылку и подайте заявку, мы одобрим её автоматически. Ссылка личная и одноразовая: действует ${INVITE_TTL_DAYS} дней, до ${dateTime(invite.expiresAt)} (мск). Не передавайте её другим: вступит тот, кто нажмёт первым.`,
        `Ссылка не открывается или срок вышел? Новую можно получить в личном кабинете (${cabinetUrl}) или в боте (${botUrl}), либо написать в поддержку: ${supportHandle}.`,
      ]
    : [`Ссылку на вступление в чат пришлёт поддержка в ближайшее время. Если ждать не хочется, напишите: ${supportHandle}.`]

  const term = oneTime
    ? `Доступ действует до ${nextPaymentAt ? date(nextPaymentAt) : 'конца оплаченного периода'}, автопродления нет.`
    : nextPaymentAt
      ? `Следующее списание ${rub(amount)}: ${date(nextPaymentAt)}. Подписка продлевается автоматически.`
      : 'Подписка продлевается автоматически.'
  const subLines = [`Тариф: ${tariff}`, amount ? `Оплачено: ${rub(amount)}, ${date(paidAt)}` : null, term].filter(Boolean)

  const cancel = oneTime
    ? 'Подписка разовая, автосписаний нет: доступ закончится в указанный день. Продлить его можно на сайте, в разделе «Сообщество».'
    : `Как отключить автопродление: в личном кабинете (${cabinetUrl}) раздел «Сообщество» → «Отключить автопродление», либо в боте: «Личный кабинет» → «Настройки» → «Отменить подписку». Доступ сохранится до конца оплаченного периода. Войти в кабинет можно по этой почте.`

  const text = [
    hello,
    paid,
    '',
    ...inviteText,
    '',
    'Ваша подписка:',
    ...subLines,
    '',
    cancel,
    '',
    `Личный кабинет резидента: ${cabinetUrl}`,
    `Бот с уведомлениями и кабинетом в Telegram: ${botUrl}`,
    '',
    `Вопросы — ${supportHandle}`,
    '',
    'Карьерный юрист',
  ].join('\n')

  const p = (inner) => `<p style="margin:0 0 16px">${inner}</p>`
  const link = (href, label) => `<a href="${esc(href)}" style="color:#45608a">${esc(label)}</a>`
  const button = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#283953;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:24px;font-weight:bold">${esc(label)}</a>`
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#283953">${[
    p(`<b>${esc(hello)}<br>${esc(paid)}</b>`),
    invite
      ? p(`<b>Ваша личная ссылка на вступление в закрытый чат:</b><br><br>${button(invite.url, 'Вступить в сообщество')}<br><br><span style="font-size:13px;color:#5d6b82">${esc(invite.url)}</span>`) +
        p(`Нажмите на ссылку и подайте заявку, мы одобрим её автоматически. Ссылка личная и одноразовая: действует ${INVITE_TTL_DAYS} дней, до ${esc(dateTime(invite.expiresAt))} (мск). Не передавайте её другим: вступит тот, кто нажмёт первым.`) +
        p(`Ссылка не открывается или срок вышел? Новую можно получить в ${link(cabinetUrl, 'личном кабинете')} или в ${link(botUrl, 'боте')}, либо написать в поддержку: ${link(supportUrl, supportHandle)}.`)
      : p(`Ссылку на вступление в чат пришлёт поддержка в ближайшее время. Если ждать не хочется, напишите: ${link(supportUrl, supportHandle)}.`),
    p(`<b>Ваша подписка</b><br>${subLines.map(esc).join('<br>')}`),
    p(oneTime ? esc(cancel) : `<b>Как отключить автопродление.</b> В ${link(cabinetUrl, 'личном кабинете')}: раздел «Сообщество» → «Отключить автопродление», либо в боте: «Личный кабинет» → «Настройки» → «Отменить подписку». Доступ сохранится до конца оплаченного периода. Войти в кабинет можно по этой почте.`),
    p(`${link(cabinetUrl, 'Личный кабинет резидента')} · ${link(botUrl, 'Бот в Telegram')} · ${link(supportUrl, supportHandle)}`),
    p('Карьерный юрист'),
  ].join('')}</div>`

  return { subject: 'Вы в сообществе «Карьерный юрист»: ссылка на вступление', text, html }
}

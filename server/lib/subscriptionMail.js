// Письмо после оплаты подписки на сообщество: личная ссылка на вступление и её срок, сроки подписки, как отключить автопродление,
// ссылка на кабинет резидента. Собирается здесь, а шлёт его сервер после первой оплаты (и повторно по запросу из кабинета и бота).

const MSK = 'Europe/Moscow'
const date = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ts)).replace(/ г\./g, '')
const rub = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₽`
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/**
 * Возвращает { subject, text, html }.
 * invite — { url } (общая ссылка на вступление; заявку одобряет бот, и только оплатившим) или null (ссылка не задана: письмо говорит, что её пришлёт поддержка).
 * telegram — ник, указанный при оплате: по нему бот узнаёт оплатившего, если тот не запускал бота.
 * tariff — название тарифа; amount — сумма платежа; nextPaymentAt — дата следующего списания (null — автопродления нет);
 * oneTime — разовая подписка: доступ до nextPaymentAt, списаний нет.
 */
export function composeSubscriptionMail({ name, tariff, amount, paidAt, nextPaymentAt, oneTime, invite, telegram, siteUrl, botUsername, supportHandle }) {
  const hello = name && name !== '—' ? `Здравствуйте, ${name}!` : 'Здравствуйте!'
  const cabinetUrl = `${siteUrl}/cabinet`
  const botUrl = `https://t.me/${botUsername}`
  const supportUrl = `https://t.me/${String(supportHandle).replace(/^@/, '')}`
  const paid = 'Оплата получена — подписка на сообщество «Карьерный юрист» оформлена.'

  const who = telegram ? `Подайте заявку с Telegram-аккаунта ${telegram} (ник указан при оплате): так мы узнаем вашу оплату.` : 'Подайте заявку со своего Telegram-аккаунта.'
  const inviteHelp = `Если ник другой или заявку не приняли, откройте бота (${botUrl}) и нажмите Start либо напишите в поддержку: ${supportHandle}.`
  const inviteText = invite
    ? ['Ваша ссылка на вступление в закрытый чат сообщества:', invite.url, `Нажмите на ссылку и подайте заявку, а бот одобрит её автоматически, потому что подписка оплачена. ${who}`, inviteHelp]
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
      ? p(`<b>Ваша ссылка на вступление в закрытый чат:</b><br><br>${button(invite.url, 'Вступить в сообщество')}<br><br><span style="font-size:13px;color:#5d6b82">${esc(invite.url)}</span>`) +
        p(`Нажмите на ссылку и подайте заявку, а бот одобрит её автоматически, потому что подписка оплачена. ${esc(who)}`) +
        p(`Если ник другой или заявку не приняли, откройте ${link(botUrl, 'бота')} и нажмите Start либо напишите в поддержку: ${link(supportUrl, supportHandle)}.`)
      : p(`Ссылку на вступление в чат пришлёт поддержка в ближайшее время. Если ждать не хочется, напишите: ${link(supportUrl, supportHandle)}.`),
    p(`<b>Ваша подписка</b><br>${subLines.map(esc).join('<br>')}`),
    p(oneTime ? esc(cancel) : `<b>Как отключить автопродление.</b> В ${link(cabinetUrl, 'личном кабинете')}: раздел «Сообщество» → «Отключить автопродление», либо в боте: «Личный кабинет» → «Настройки» → «Отменить подписку». Доступ сохранится до конца оплаченного периода. Войти в кабинет можно по этой почте.`),
    p(`${link(cabinetUrl, 'Личный кабинет резидента')} · ${link(botUrl, 'Бот в Telegram')} · ${link(supportUrl, supportHandle)}`),
    p('Карьерный юрист'),
  ].join('')}</div>`

  return { subject: 'Вы в сообществе «Карьерный юрист»: ссылка на вступление', text, html }
}

// ---- Письма о списаниях: напоминание, списание прошло, списание не прошло ----

function shell({ name, siteUrl, botUsername, supportHandle, title, lines, extraHtml = '' }) {
  const hello = name && name !== '—' ? `Здравствуйте, ${name}!` : 'Здравствуйте!'
  const cabinetUrl = `${siteUrl}/cabinet`
  const botUrl = `https://t.me/${botUsername}`
  const supportUrl = `https://t.me/${String(supportHandle).replace(/^@/, '')}`
  const text = [hello, title, '', ...lines, '', `Личный кабинет резидента: ${cabinetUrl}`, `Бот в Telegram: ${botUrl}`, `Вопросы: ${supportHandle}`, '', 'Карьерный юрист'].join('\n')
  const p = (inner) => `<p style="margin:0 0 16px">${inner}</p>`
  const link = (href, label) => `<a href="${esc(href)}" style="color:#45608a">${esc(label)}</a>`
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#283953">${[
    p(`<b>${esc(hello)}<br>${esc(title)}</b>`),
    p(lines.map(esc).join('<br>')),
    extraHtml,
    p(`${link(cabinetUrl, 'Личный кабинет резидента')} · ${link(botUrl, 'Бот в Telegram')} · ${link(supportUrl, supportHandle)}`),
    p('Карьерный юрист'),
  ].join('')}</div>`
  return { text, html }
}

const CANCEL_HINT = 'Если планы изменились, отключите автопродление в личном кабинете: раздел «Сообщество» → «Отключить автопродление» (или в боте: «Личный кабинет» → «Настройки» → «Отменить подписку»). Доступ сохранится до конца оплаченного периода.'

/** Напоминание о списании за days дней (1 или 2). chargeAt — момент списания. */
export function composeChargeReminderMail({ name, days, amount, chargeAt, siteUrl, botUsername, supportHandle }) {
  const when = days === 1 ? 'завтра' : `через ${days} ${days < 5 ? 'дня' : 'дней'}`
  const title = `Напоминаем: ${when}, ${date(chargeAt)}, произойдёт списание за подписку на сообщество «Карьерный юрист»${amount ? ` — ${rub(amount)}` : ''}.`
  const lines = ['Убедитесь, что на карте достаточно средств: тогда подписка продлится сама и доступ к сообществу сохранится.', CANCEL_HINT]
  const { text, html } = shell({ name, siteUrl, botUsername, supportHandle, title, lines })
  return { subject: `Скоро списание за подписку: ${date(chargeAt)}`, text, html }
}

/** Списание прошло, подписка продлена. */
export function composeChargeDoneMail({ name, amount, paidAt, nextPaymentAt, siteUrl, botUsername, supportHandle }) {
  const title = `Списание прошло${amount ? `: ${rub(amount)}` : ''}, подписка на сообщество продлена.`
  const lines = [amount ? `Оплачено: ${rub(amount)}, ${date(paidAt)}.` : null, nextPaymentAt ? `Следующее списание: ${date(nextPaymentAt)}.` : null, 'Чек об оплате придёт от платёжной системы на почту, указанную при оплате.', CANCEL_HINT].filter(Boolean)
  const { text, html } = shell({ name, siteUrl, botUsername, supportHandle, title, lines })
  return { subject: 'Подписка продлена', text, html }
}

/** Списание не прошло: что проверить и как не потерять доступ. */
export function composeChargeFailedMail({ name, amount, chargeAt, siteUrl, botUsername, supportHandle }) {
  const title = `Не получилось списать оплату за подписку на сообщество «Карьерный юрист»${amount ? ` (${rub(amount)})` : ''}, списание было назначено на ${date(chargeAt)}.`
  const lines = [
    'Возможно, банк отклонил платёж или у карты закончился срок. Проверьте карту и баланс: платёжная система повторяет попытки списания несколько дней.',
    `Если карта устарела или её нужно сменить, напишите в поддержку (${supportHandle}) или нажмите «Сменить карту» в личном кабинете: мы поможем, чтобы подписка не прервалась.`,
  ]
  const { text, html } = shell({ name, siteUrl, botUsername, supportHandle, title, lines })
  return { subject: 'Не удалось списать оплату за подписку', text, html }
}

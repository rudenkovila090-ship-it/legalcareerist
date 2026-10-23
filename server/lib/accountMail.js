// Письма личного кабинета: подтверждение почты с заданием пароля и восстановление пароля.
// Оформление как у писем о билетах (ticketMail.js): жирный заголовок, ссылка-кнопка, подпись и контакты.
import { CONTACTS } from './ticketMail.js'

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/**
 * kind: 'activate' — подтвердить почту и задать пароль (новая регистрация);
 *       'reset' — восстановить пароль («Забыли пароль»);
 *       'exists' — кто-то зарегистрировал почту, у которой уже есть аккаунт: ссылка ведёт к смене пароля.
 * Возвращает { subject, text, html }.
 */
export function composeAccountMail({ kind, link, name, hours }) {
  const hello = name ? `Здравствуйте, ${name}!` : 'Здравствуйте!'
  const copy = {
    activate: {
      subject: 'Подтвердите почту и задайте пароль: личный кабинет «Карьерный юрист»',
      head: 'Чтобы войти в личный кабинет, подтвердите почту и задайте пароль.',
      button: 'Подтвердить почту и задать пароль',
      note: 'Если вы не регистрировались на сайте, просто проигнорируйте это письмо: без перехода по ссылке ничего не изменится.',
    },
    reset: {
      subject: 'Восстановление пароля: личный кабинет «Карьерный юрист»',
      head: 'Вы запросили восстановление пароля от личного кабинета.',
      button: 'Задать новый пароль',
      note: 'Если вы не запрашивали восстановление, проигнорируйте письмо: пароль останется прежним.',
    },
    exists: {
      subject: 'У вас уже есть личный кабинет «Карьерный юрист»',
      head: 'С этой почтой на сайте уже зарегистрирован личный кабинет. Если это были вы, войдите со своим паролем; если забыли его, задайте новый по ссылке.',
      button: 'Задать новый пароль',
      note: 'Если вы не пытались зарегистрироваться, проигнорируйте письмо: пароль останется прежним.',
    },
  }[kind]
  const tail = hours % 100
  const word = tail >= 11 && tail <= 14 ? 'часов' : hours % 10 === 1 ? 'час' : hours % 10 >= 2 && hours % 10 <= 4 ? 'часа' : 'часов'
  const valid = `Ссылка действует ${hours} ${word} и работает один раз.`
  const text = [hello, copy.head, '', `${copy.button}: ${link}`, '', valid, copy.note, '', 'Карьерный юрист', '', `${CONTACTS.phone} | ${CONTACTS.email} | сайт: ${CONTACTS.site}`].join('\n')
  const p = (inner) => `<p style="margin:0 0 16px">${inner}</p>`
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#283953">${[
    p(`<b>${esc(hello)}<br>${esc(copy.head)}</b>`),
    p(`<a href="${esc(link)}" style="display:inline-block;padding:12px 22px;background:#283953;color:#ffffff;text-decoration:none;border-radius:24px;font-weight:bold">${esc(copy.button)}</a>`),
    p(`Если кнопка не нажимается, откройте ссылку:<br><a href="${esc(link)}" style="color:#45608a;word-break:break-all">${esc(link)}</a>`),
    p(`${esc(valid)} ${esc(copy.note)}`),
    p('Карьерный юрист'),
    p(`<a href="tel:${CONTACTS.phone.replace(/[^\d+]/g, '')}" style="color:#45608a">${esc(CONTACTS.phone)}</a> | <a href="mailto:${CONTACTS.email}" style="color:#45608a">${esc(CONTACTS.email)}</a> | <a href="${CONTACTS.site}" style="color:#45608a">сайт</a>`),
  ].join('')}</div>`
  return { subject: copy.subject, text, html }
}

/** Письмо об ответе службы поддержки в чате кабинета: сам ответ и ссылка на чат. Возвращает { subject, text, html }. */
export function composeSupportReplyMail({ name, text, link }) {
  const hello = name ? `Здравствуйте, ${name}!` : 'Здравствуйте!'
  const head = 'Служба поддержки ответила в чате личного кабинета.'
  const p = (inner) => `<p style="margin:0 0 16px">${inner}</p>`
  const quoted = `<div style="margin:0 0 16px;padding:14px 16px;background:#f3f5f9;border-radius:12px;white-space:pre-wrap">${esc(text)}</div>`
  const body = [hello, head, '', text, '', `Продолжить переписку: ${link}`, '', 'Карьерный юрист', '', `${CONTACTS.phone} | ${CONTACTS.email} | сайт: ${CONTACTS.site}`].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#283953">${[
    p(`<b>${esc(hello)}<br>${esc(head)}</b>`),
    quoted,
    p(`<a href="${esc(link)}" style="display:inline-block;padding:12px 22px;background:#283953;color:#ffffff;text-decoration:none;border-radius:24px;font-weight:bold">Открыть чат</a>`),
    p('Карьерный юрист'),
    p(`<a href="tel:${CONTACTS.phone.replace(/[^\d+]/g, '')}" style="color:#45608a">${esc(CONTACTS.phone)}</a> | <a href="mailto:${CONTACTS.email}" style="color:#45608a">${esc(CONTACTS.email)}</a> | <a href="${CONTACTS.site}" style="color:#45608a">сайт</a>`),
  ].join('')}</div>`
  return { subject: 'Ответ службы поддержки: «Карьерный юрист»', text: body, html }
}

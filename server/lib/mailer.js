// Отправка писем (выдача материалов, подтверждение билета). SMTP настраивается в server/.env:
// SMTP_HOST, SMTP_PORT (465 по умолчанию), SMTP_USER, SMTP_PASS, SMTP_FROM (иначе SMTP_USER).
// Не настроено — письма не уходят, остальные сценарии (Telegram, кабинет на сайте) работают как раньше.
import nodemailer from 'nodemailer'

let transport = null

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 465
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transport
}

const escapeHtml = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

/** Возвращает { ok, error? }. attachments: [{ filename, content: Buffer }]. html — готовая вёрстка письма (иначе строится из text). */
export async function sendMail({ to, subject, text, html, attachments, messageId }) {
  if (!mailConfigured()) return { ok: false, error: 'smtp_not_configured', definitelyNotSent: true }
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) return { ok: false, error: 'bad_address', definitelyNotSent: true }
  try {
    await getTransport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html: html ?? `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#283953">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`,
      attachments,
      ...(messageId ? { messageId } : {}),
    })
    return { ok: true }
  } catch (err) {
    console.error('[mail] не удалось отправить письмо:', err.message)
    return { ok: false, error: err.message, definitelyNotSent: Boolean(Number(err.responseCode) >= 400 || err.command && err.command !== 'DATA') }
  }
}

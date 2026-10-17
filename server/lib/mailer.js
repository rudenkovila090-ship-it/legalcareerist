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
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transport
}

const escapeHtml = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

/** Возвращает { ok, error? }. attachments: [{ filename, content: Buffer }]. */
export async function sendMail({ to, subject, text, attachments }) {
  if (!mailConfigured()) return { ok: false, error: 'smtp_not_configured' }
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) return { ok: false, error: 'bad_address' }
  try {
    await getTransport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#283953">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`,
      attachments,
    })
    return { ok: true }
  } catch (err) {
    console.error('[mail] не удалось отправить письмо:', err.message)
    return { ok: false, error: err.message }
  }
}

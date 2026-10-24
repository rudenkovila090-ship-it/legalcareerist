// Письмо покупателю с личной ссылкой на материал. Собирается в одном месте: его шлёт сервер после оплаты
// и скрипт `scripts/material-link.sh`, когда нужно выдать новую ссылку (прежняя истекла или письмо потерялось).
import { LINK_TTL_MS } from './materialLinks.js'

const MSK = 'Europe/Moscow'
export const formatMoscowDateTime = (ts) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))

/** Сколько дней действует ссылка (для текстов). */
export const LINK_DAYS = Math.round(LINK_TTL_MS / 86400000)

/**
 * { subject, text }. downloadUrl нет — файла на сайте ещё нет, и письмо честно говорит, что материал пришлёт поддержка.
 * reviewUrl — страница отзыва (по ссылке с токеном покупки); accessUrl — внешняя ссылка на материал, если она задана.
 */
export function composeMaterialMail({ name, title, downloadUrl, expiresAt, accessUrl, reviewUrl, supportHandle }) {
  const lines = [name ? `Здравствуйте, ${name}!` : 'Здравствуйте!', '']
  if (downloadUrl) {
    lines.push(
      `Спасибо за покупку! Материал «${title}» — по вашей личной ссылке:`,
      downloadUrl,
      '',
      `Ссылка действует ${LINK_DAYS} дней — до ${formatMoscowDateTime(expiresAt)} (мск). Скачайте файл за это время и сохраните у себя.`,
    )
  } else {
    lines.push(`Спасибо за покупку! Материал «${title}» пришлёт поддержка в ближайшее время.`)
  }
  if (accessUrl) lines.push('', `Ссылка на материал: ${accessUrl}`)
  if (reviewUrl) lines.push('', `Когда ознакомитесь, оставьте, пожалуйста, отзыв о материале (оценка и пара слов) — это помогает другим студентам: ${reviewUrl}`)
  lines.push('', downloadUrl ? `Ссылка не открывается или срок закончился? Напишите в поддержку — ${supportHandle}: пришлём новую.` : `Если что-то пошло не так — напишите в поддержку: ${supportHandle}`, '', 'Карьерный юрист')
  return { subject: `Ваш материал: ${title}`, text: lines.join('\n') }
}

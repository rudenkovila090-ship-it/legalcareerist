// Открытие чата с Telegram-ботом сайта с параметром /start.
// Это обязательный шаг: по правилам платформы бот не может первым написать
// пользователю, который ни разу не нажал Start в чате с ним — обхода нет.
// Параметр startParam долетает до бота как payload команды /start —
// бэкенд (server/index.js, /api/telegram/webhook) разбирает его и для
// resident_<tariffId> сразу присылает подписанную ссылку на оплату подписки.
export const TELEGRAM_BOT_USERNAME = 'LegalcareeristBot'

export function openTelegramBot(startParam: string) {
  if (typeof window === 'undefined') return
  window.open(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(startParam)}`, '_blank', 'noopener')
}

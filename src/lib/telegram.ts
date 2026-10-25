// Открытие чата с Telegram-ботом сайта с параметром /start.
// Это обязательный шаг: по правилам платформы бот не может первым написать
// пользователю, который ни разу не нажал Start в чате с ним — обхода нет.
// Параметр startParam долетает до бота как payload команды /start —
// бэкенд (server/index.js) разбирает его: access_<токен> привязывает Telegram к оплаченной подписке и присылает личную ссылку на вступление.
// Оплата только на сайте: бот ссылок на оплату не выдаёт.
export const TELEGRAM_BOT_USERNAME = 'legalcareerist_bot'
export const TELEGRAM_BOT_DISPLAY_NAME = 'Карьерный юрист | Помощник'

export function openTelegramBot(startParam: string) {
  if (typeof window === 'undefined') return
  window.open(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(startParam)}`, '_blank', 'noopener')
}

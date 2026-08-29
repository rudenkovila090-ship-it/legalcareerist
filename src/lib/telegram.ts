// Открытие чата с Telegram-ботом сайта с параметром /start.
// Это обязательный шаг: по правилам платформы бот не может первым написать
// пользователю, который ни разу не нажал Start в чате с ним — обхода нет.
// Параметр startParam долетает до бота как payload команды /start и должен
// совпадать со значением, на которое настроена ветка сценария в BotHelp.
export const TELEGRAM_BOT_USERNAME = 'legalcareerist_bot'

export function openTelegramBot(startParam: string) {
  if (typeof window === 'undefined') return
  window.open(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(startParam)}`, '_blank', 'noopener')
}

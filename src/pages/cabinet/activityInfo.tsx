import type { ReactNode } from 'react'
import type { ActivityEntry } from '../../lib/cabinet'
import { icon } from './sections'

const DOC_TYPES: Record<string, string> = { cv: 'резюме', cover: 'сопроводительное письмо', test: 'тестовое задание', other: 'документ' }
const PARTS: Record<string, string> = { practices: 'практики', experience: 'опыт', expectations: 'ожидания по роли', privacy: 'конфиденциальность' }

/** Как показать запись журнала действий: название и иконка. Сервер отдаёт только вид действия и безобидную отметку. */
export function activityLabel(e: ActivityEntry): string {
  switch (e.kind) {
    case 'login': return 'Вход в кабинет'
    case 'password_set': return 'Задан пароль, почта подтверждена'
    case 'password_reset': return 'Пароль восстановлен'
    case 'password_changed': return 'Пароль изменён'
    case 'telegram_linked': return 'Telegram привязан'
    case 'telegram_unlinked': return 'Telegram отвязан'
    case 'profile_saved': return `Сохранён профиль${e.part && PARTS[e.part] ? `: ${PARTS[e.part]}` : ''}`
    case 'contact_updated': return 'Обновлены личные данные'
    case 'document_added': return `Загружен документ${e.docType && DOC_TYPES[e.docType] ? `: ${DOC_TYPES[e.docType]}` : ''}`
    case 'document_deleted': return 'Удалён документ'
    case 'marketing_changed': return e.value ? 'Включены рекламные и информационные сообщения' : 'Выключены рекламные и информационные сообщения'
    case 'data_exported': return 'Скачаны данные о вас'
    case 'deletion_requested': return 'Запрошено удаление данных'
    case 'support_message': return 'Сообщение в поддержку'
    case 'support_reply': return 'Ответ поддержки'
    case 'subscription_cancelled': return 'Отключено автопродление подписки'
    case 'card_change_requested': return 'Запрошена смена карты для списаний'
    default: return 'Действие в кабинете'
  }
}

export function activityIcon(kind: string): ReactNode {
  if (kind.startsWith('password') || kind === 'login') return icon.lock
  if (kind.startsWith('telegram')) return icon.telegram
  if (kind.startsWith('document')) return icon.doc
  if (kind.startsWith('support')) return icon.lifebuoy
  if (kind === 'subscription_cancelled' || kind === 'card_change_requested') return icon.shield
  if (kind === 'data_exported' || kind === 'deletion_requested') return icon.download
  if (kind === 'marketing_changed') return icon.bell
  return icon.user
}

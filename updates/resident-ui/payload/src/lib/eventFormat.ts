import type { EventItem, EventFormat } from '../types'

export const eventFormatText = (event: Pick<EventItem, 'format' | 'city'>): string =>
  event.format === 'online' ? 'Онлайн' : event.format === 'hybrid' ? `${event.city || 'Очно'} + онлайн` : event.city || 'Очно'

/** A hybrid meeting is available to both the online and in-person audience. */
export const matchesEventFormat = (event: Pick<EventItem, 'format'>, filter: EventFormat | 'all'): boolean =>
  filter === 'all' || event.format === filter || (event.format === 'hybrid' && filter !== 'hybrid')

export const eventPriceText = (event: Pick<EventItem, 'price'>): string =>
  event.price === null ? 'Цена не указана' : event.price === 0 ? 'Бесплатно' : `${event.price.toLocaleString('ru-RU')} ₽`

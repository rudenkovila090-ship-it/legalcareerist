// Время мероприятия по Москве: «18:00» или диапазоном «18:00–22:00», если задан endDateTime.
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })

type EventDates = { dateTime: string; endDateTime?: string; dateOnly?: boolean }

export function eventTimeRange(event: EventDates): string {
  if (event.dateOnly) return ''
  return event.endDateTime ? `${clock(event.dateTime)}–${clock(event.endDateTime)}` : clock(event.dateTime)
}

/** У длительных курсов без времени показываем весь период, сохраняя календарные даты. */
export function eventDateRange(event: EventDates): string {
  const date = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' })
  return event.dateOnly && event.endDateTime && event.endDateTime !== event.dateTime
    ? `${date(event.dateTime)} — ${date(event.endDateTime)}`
    : date(event.dateTime)
}

export const eventScheduleText = (event: EventDates): string =>
  [eventDateRange(event), eventTimeRange(event)].filter(Boolean).join(' · ')

/** При известных только датах последний день курса целиком входит в период. */
export const eventEndTimestamp = (event: EventDates): number => {
  const end = event.endDateTime ?? event.dateTime
  return event.dateOnly ? Date.parse(`${end}T00:00:00+03:00`) + 86_400_000 - 1 : Date.parse(end)
}

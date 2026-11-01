// Время мероприятия по Москве: «18:00» или диапазоном «18:00–22:00», если задан endDateTime.
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })

export function eventTimeRange(event: { dateTime: string; endDateTime?: string }): string {
  return event.endDateTime ? `${clock(event.dateTime)}–${clock(event.endDateTime)}` : clock(event.dateTime)
}

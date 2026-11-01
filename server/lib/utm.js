// Подпись источника из UTM-меток: «vk / post / вакансия-юрист». Без меток — «без метки».
export function utmLabel(utm) {
  if (!utm || typeof utm !== 'object') return 'без метки'
  const parts = [utm.utm_source, utm.utm_medium, utm.utm_campaign].filter(Boolean).map((v) => String(v).slice(0, 60))
  return parts.length ? parts.join(' / ') : 'без метки'
}

export const inputClass = 'w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none'
export const labelClass = 'mb-1.5 block text-sm font-medium text-ink/80'

export const longDate = (ts?: number | null) => (ts ? new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

/** Сообщения об ошибках сервера в кабинете. */
export const errorText = (code: string): string =>
  ({
    consent_required: 'Отметьте обязательные галочки внизу формы.',
    bad_salary: 'Зарплата «от» не может быть больше «до».',
    bad_years: 'Стаж — число от 0 до 60.',
    unauthorized: 'Сессия закончилась. Обновите страницу и войдите снова.',
    network: 'Не получилось связаться с сервером. Попробуйте ещё раз.',
  })[code] ?? 'Не получилось сохранить. Попробуйте ещё раз.'

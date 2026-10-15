export const inputClass = 'w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none'
export const labelClass = 'mb-1.5 block text-sm font-medium text-ink/80'

export const longDate = (ts?: number | null) => (ts ? new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

/** Сообщения об ошибках сервера в кабинете. */
export const errorText = (code: string): string =>
  ({
    consent_required: 'Отметьте обязательные галочки внизу формы.',
    bad_salary: 'Зарплата «от» не может быть больше «до».',
    bad_years: 'Стаж — число от 0 до 60.',
    bad_type: 'Подходят PDF, Word (doc, docx), ODT, RTF, Excel, PowerPoint и txt.',
    bad_content: 'Содержимое файла не похоже на заявленный формат. Сохраните документ заново в нужном формате и загрузите ещё раз.',
    file_too_large: 'Файл больше 10 МБ. Сожмите его или загрузите версию поменьше.',
    empty_file: 'Файл пустой.',
    no_file: 'Выберите файл.',
    too_many_documents: 'Достигнут предел документов. Удалите ненужные и загрузите снова.',
    too_many_versions: 'У документа уже максимум версий. Удалите старые.',
    storage_full: 'Место для файлов закончилось. Удалите ненужные документы.',
    not_found: 'Документ не найден. Обновите страницу.',
    unauthorized: 'Сессия закончилась. Обновите страницу и войдите снова.',
    network: 'Не получилось связаться с сервером. Попробуйте ещё раз.',
  })[code] ?? 'Не получилось сохранить. Попробуйте ещё раз.'

/** Размер файла для показа: «48 КБ», «2,4 МБ». */
export const fileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`
  const mb = Math.round((bytes / 1024 / 1024) * 10) / 10
  return `${String(mb).replace('.', ',')} МБ`
}

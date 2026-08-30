// Формирование и проверка подписи Prodamus.
// Источник: официальная библиотека Prodamus (hmac.js), выдаваемая в их
// документации по автоплатежам — https://help.prodamus.ru, статья
// «Создание ссылки с автоплатежом». Проверено на реальных подписанных
// ссылках клубной системы (все 3 тарифа сайта совпали побайтово).
import crypto from 'node:crypto'

export class HmacHelper {
  /** Возвращает подпись данных в виде hex-строки в нижнем регистре. */
  static create(data, key, algo = 'sha256') {
    const payload = { ...data }
    delete payload.signature

    const normalized = sortRecursive(stringifyRecursive(payload))
    const raw = JSON.stringify(normalized).replace(/\//g, '\\/')

    return crypto.createHmac(algo, key).update(raw, 'utf8').digest('hex')
  }

  /** Сравнивает подпись данных с полученной подписью (для проверки вебхука). */
  static verify(data, key, sign, algo = 'sha256') {
    const expected = Buffer.from(HmacHelper.create(data, key, algo), 'utf8')
    const actual = Buffer.from(String(sign).toLowerCase(), 'utf8')
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  }
}

/** Приводит скаляры к строкам по правилам PHP-функции strval(). */
function stringifyRecursive(value) {
  if (Array.isArray(value)) return value.map((item) => stringifyRecursive(item))
  if (value !== null && typeof value === 'object') {
    const result = {}
    for (const key of Object.keys(value)) result[key] = stringifyRecursive(value[key])
    return result
  }
  if (value === null || value === undefined || value === false) return ''
  if (value === true) return '1'
  return String(value)
}

function sortRecursive(value) {
  if (Array.isArray(value)) return value.map((item) => sortRecursive(item))
  if (value !== null && typeof value === 'object') {
    const result = {}
    for (const key of Object.keys(value).sort()) result[key] = sortRecursive(value[key])
    return result
  }
  return value
}

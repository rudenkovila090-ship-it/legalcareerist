// Общая логика простого файлового JSON-хранилища — вынесена из store.js и
// materialsStore.js, которые были устроены одинаково (только разные файлы
// и разные поля записи). Пока заявок немного, файла достаточно; заменить
// на настоящую БД, когда появится полная логика напоминаний/автосписаний.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')

export function createJsonStore(fileName) {
  const file = path.join(DATA_DIR, fileName)

  function load() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return {}
    }
  }

  function save(data) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  }

  function create(record) {
    const token = crypto.randomBytes(12).toString('hex')
    const data = load()
    data[token] = { ...record, paid: false, createdAt: Date.now() }
    save(data)
    return token
  }

  function get(token) {
    return load()[token] ?? null
  }

  /**
   * Находит самую свежую неоплаченную запись с таким телефоном (и, если
   * передан extraMatch — удовлетворяющую ему, например конкретный тариф)
   * и помечает оплаченной. Телефон сравнивается по цифрам — форма на
   * сайте и то, что вернёт Продамус в вебхуке, могут отличаться написанием
   * (+7 999 ... против 89991234567), но набор цифр совпадает.
   */
  function markPaidByPhone(phone, extraMatch) {
    if (!phone) return null
    const wanted = normalizePhone(phone)
    if (!wanted) return null

    const data = load()
    const matches = Object.entries(data)
      .filter(([, v]) => normalizePhone(v.phone) === wanted && !v.paid && (!extraMatch || extraMatch(v)))
      .sort((a, b) => b[1].createdAt - a[1].createdAt)

    const entry = matches[0]
    if (!entry) return null
    const [token, value] = entry
    value.paid = true
    save(data)
    return { token, ...value }
  }

  function setField(token, field, value) {
    const data = load()
    if (!data[token]) return null
    data[token][field] = value
    save(data)
    return data[token]
  }

  return { create, get, markPaidByPhone, setField }
}

/** Оставляет только цифры и сводит ведущую "8" к "7" — для сравнения номеров. */
export function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

// Список доработок и напоминаний админу: что осталось сделать по боту и сайту. Показывается в
// «🛠 Система → 📌 Доработки» и в утренней сводке. При первом запуске заполняется текущим списком.
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(import.meta.dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'todos.json')

const SEED = [
  'Загрузить выгрузку платежей из Prodamus в учёт (scripts/importPayments.js)',
  'Проверить, что вебхуки Prodamus доходят до сервера (Система → время последнего вебхука)',
  'Загрузить выгрузку BotHelp на сервер (scripts/importBotHelp.js) и отключить дублирующие сценарии в BotHelp',
  'Отправить боту PDF материалов и чек-лист новичка (подписи /material …)',
  'Перевыпустить токен бота через @BotFather и обновить server/.env',
  'Мероприятия (сайт): при регистрации обязательные контакты и галочка согласия на рекламную рассылку',
  'Мероприятия: письмо на почту после оплаты — вы зарегистрированы, дата и место',
  'Мероприятия: бот пишет в Telegram — зарегистрирован, оплатил, дата мероприятия',
  'Мероприятия: бот напоминает о мероприятии (только согласившимся на рассылку) с кнопкой «Отказаться от рекламной рассылки»',
  'Мероприятия: красивый PDF-билет — из Telegram и на почте',
  'Тарифы Prodamus: номера подписок для 12 мес., 350, 500, 530 ₽ и вход по промокоду',
  'Профиль с баллами и уровнями: правила начисления баллов и уровни',
  'Отмена подписки из бота прямо в Prodamus (нужен домен платёжной страницы)',
  'Ссылка для обратной связи (FEEDBACK_URL) вместо страницы «Сообщество»',
  'Картинки блоков воронки бота',
  'Google-таблица — отдельная работа',
]

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'))
  } catch {
    const seeded = SEED.map((text, i) => ({ number: i + 1, text, done: false, createdAt: Date.now() }))
    save(seeded)
    return seeded
  }
}

function save(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2))
}

export function listTodos() {
  return load()
}

export function addTodo(text) {
  const list = load()
  const number = list.reduce((max, t) => Math.max(max, t.number), 0) + 1
  list.push({ number, text, done: false, createdAt: Date.now() })
  save(list)
  return number
}

export function setTodoDone(number, done = true) {
  const list = load()
  const t = list.find((x) => x.number === Number(number))
  if (!t) return false
  t.done = done
  t.doneAt = done ? Date.now() : null
  save(list)
  return true
}

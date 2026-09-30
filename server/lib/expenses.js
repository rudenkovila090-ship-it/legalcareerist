// Расходы (реклама, комиссии, сервисы) — вводятся вручную в боте; нужны, чтобы
// в финансах видеть не только выручку, но и прибыль за месяц.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('expenses.json')

export function listExpenses() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function createExpense({ amount, category, note }) {
  const number = listExpenses().reduce((max, e) => Math.max(max, e.number), 0) + 1
  const token = store.create({ number, amount, category: category || 'прочее', note: note || '', at: Date.now() })
  return { token, ...store.get(token) }
}

export function deleteExpense(number) {
  const e = listExpenses().find((x) => x.number === Number(number))
  return e ? store.remove(e.token) : false
}

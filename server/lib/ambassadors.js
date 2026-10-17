// Амбассадоры сообщества — юристы-блогеры с бесплатным членством, которые
// приводят людей по своему промокоду. «Привёл(а)» ведётся вручную кнопкой в карточке.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('ambassadors.json')

export function listAmbassadors() {
  return store.all().sort((a, b) => a.number - b.number)
}

export function getAmbassador(number) {
  return listAmbassadors().find((a) => a.number === Number(number)) ?? null
}

export function createAmbassador({ name, telegram, phone, promo, note }) {
  const number = listAmbassadors().reduce((max, a) => Math.max(max, a.number), 0) + 1
  const token = store.create({ number, name: name || '', telegram: telegram || '', phone: phone || '', promo: promo || '', note: note || '', startedAt: Date.now(), referred: 0 })
  return { token, ...store.get(token) }
}

export function addReferral(number, delta = 1) {
  const a = getAmbassador(number)
  return a ? store.update(a.token, (x) => ({ ...x, referred: Math.max(0, (x.referred ?? 0) + delta) })) : null
}

export function deleteAmbassador(number) {
  const a = getAmbassador(number)
  return a ? store.remove(a.token) : false
}

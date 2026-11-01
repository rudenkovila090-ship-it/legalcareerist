import { useSyncExternalStore } from 'react'

// Приветствие вошедшего в личном кабинете («Здравствуйте, Илья») показывает шапка сайта, слева от значка кабинета.
// Кабинет записывает сюда имя, пока открыт и человек вошёл; на остальных страницах и без входа — пусто.

let current: string | null = null
const listeners = new Set<() => void>()

export function setCabinetGreeting(name: string | null) {
  if (name === current) return
  current = name
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Имя для приветствия в шапке; null — не показывать. */
export function useCabinetGreeting(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}

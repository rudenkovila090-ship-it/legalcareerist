import { useCallback, useEffect, useState } from 'react'

// Личные отметки читателя в базе знаний: избранное, прочитанное и недавние страницы.
// Хранятся только в этом браузере (localStorage), отдельно для каждого аккаунта кабинета; на сервер не отправляются.

const MAX_RECENT = 8

const read = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const write = (key: string, value: string[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // без сохранения — просто не запомним
  }
}

export interface KbMarks {
  favorites: string[]
  read: Set<string>
  recent: string[]
  toggleFavorite: (id: string) => void
  setRead: (id: string, value: boolean) => void
  visit: (id: string) => void
}

/** Избранное, прочитанное и недавние страницы одного читателя. */
export function useKbMarks(login: string): KbMarks {
  const favKey = `ky_kb_fav:${login}`
  const readKey = `ky_kb_read:${login}`
  const recentKey = `ky_kb_recent:${login}`
  const [favorites, setFavorites] = useState<string[]>(() => read(favKey))
  const [done, setDone] = useState<string[]>(() => read(readKey))
  const [recent, setRecent] = useState<string[]>(() => read(recentKey))

  // Другая вкладка могла изменить отметки.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === favKey) setFavorites(read(favKey))
      else if (e.key === readKey) setDone(read(readKey))
      else if (e.key === recentKey) setRecent(read(recentKey))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [favKey, readKey, recentKey])

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      write(favKey, next)
      return next
    })
  }, [favKey])

  const setRead = useCallback((id: string, value: boolean) => {
    setDone((prev) => {
      if (prev.includes(id) === value) return prev
      const next = value ? [...prev, id] : prev.filter((x) => x !== id)
      write(readKey, next)
      return next
    })
  }, [readKey])

  const visit = useCallback((id: string) => {
    setRecent((prev) => {
      if (prev[0] === id) return prev
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT)
      write(recentKey, next)
      return next
    })
  }, [recentKey])

  return { favorites, read: new Set(done), recent, toggleFavorite, setRead, visit }
}

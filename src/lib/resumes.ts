// Хранилище резюме соискателя (конструктор + загруженные файлы) — как и
// лиды (lib/leads.ts), в этом фронтенд-прототипе живет в localStorage,
// эмулируя таблицу на сервере.
import type { ResumeFormData, SavedResume } from '../types'

const KEY = 'ky_resumes'

export function getResumes(): SavedResume[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SavedResume[]) : []
  } catch {
    return []
  }
}

export function getResume(id: string): SavedResume | undefined {
  return getResumes().find((r) => r.id === id)
}

function writeAll(all: SavedResume[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

/** Создает новое резюме конструктора или обновляет существующее (редактирование без списания новой генерации). */
export function saveConstructorResume(data: ResumeFormData, existingId?: string): SavedResume {
  const all = getResumes()
  if (existingId) {
    const idx = all.findIndex((r) => r.id === existingId)
    if (idx !== -1) {
      all[idx] = { ...all[idx], data }
      writeAll(all)
      return all[idx]
    }
  }
  const resume: SavedResume = {
    id: `resume_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    source: 'constructor',
    data,
  }
  all.unshift(resume)
  writeAll(all)
  return resume
}

export function saveUploadedResume(fileName: string): SavedResume {
  const all = getResumes()
  const resume: SavedResume = {
    id: `resume_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    source: 'upload',
    fileName,
  }
  all.unshift(resume)
  writeAll(all)
  return resume
}

export function deleteResume(id: string) {
  writeAll(getResumes().filter((r) => r.id !== id))
}

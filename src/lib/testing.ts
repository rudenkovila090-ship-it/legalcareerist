// Результаты тестирования соискателя (проверка навыков по направлению +
// софт-скиллы) — как и резюме/отклики, в этом прототипе живут в
// localStorage, эмулируя таблицу на сервере. Результат виден и самому
// соискателю в кабинете, и работодателю в карточке отклика (см.
// lib/applications.ts, EmployerAccount.tsx).
import type { Industry } from '../types'

const KEY = 'ky_candidate_test_results'

export interface SkillTestResult {
  direction: Industry
  score: number // 0–100
  correct: number
  total: number
  completedAt: string
}

export interface SoftSkillTestResult {
  score: number // 0–100
  completedAt: string
}

export interface TestResults {
  skillTest?: SkillTestResult
  softSkillTest?: SoftSkillTestResult
}

export function getTestResults(): TestResults {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TestResults) : {}
  } catch {
    return {}
  }
}

function writeAll(results: TestResults) {
  localStorage.setItem(KEY, JSON.stringify(results))
}

export function saveSkillTestResult(direction: Industry, correct: number, total: number): SkillTestResult {
  const result: SkillTestResult = {
    direction,
    correct,
    total,
    score: total > 0 ? Math.round((correct / total) * 100) : 0,
    completedAt: new Date().toISOString(),
  }
  writeAll({ ...getTestResults(), skillTest: result })
  return result
}

export function saveSoftSkillTestResult(averageRating: number): SoftSkillTestResult {
  // Шкала утверждений 1–5 → проценты (1 = 0%, 5 = 100%).
  const score = Math.round(((averageRating - 1) / 4) * 100)
  const result: SoftSkillTestResult = { score: Math.max(0, Math.min(100, score)), completedAt: new Date().toISOString() }
  writeAll({ ...getTestResults(), softSkillTest: result })
  return result
}

// Места в юридических рейтингах, которые работодатель загружает сам —
// пока без справочника конкретных рейтингов (список пришлет заказчик
// отдельно), поэтому название/категория/место — свободный ввод. Каждая
// запись дает бонус к рейтингу работодателя (см. lib/reviews.ts).
export interface EmployerRanking {
  id: string
  name: string
  category: string
  place: string
  year: number
  addedAt: string
}

const KEY = 'ky_employer_rankings'

function seedRankings(): EmployerRanking[] {
  return [
    {
      id: 'rank1',
      name: 'Рейтинг юридических Telegram-каналов',
      category: 'HR-направление',
      place: '5 место',
      year: 2025,
      addedAt: '2026-02-10T09:00:00.000Z',
    },
  ]
}

export function getRankings(): EmployerRanking[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as EmployerRanking[]
    const seeded = seedRankings()
    localStorage.setItem(KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return []
  }
}

function writeAll(all: EmployerRanking[]) {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function addRanking(data: Omit<EmployerRanking, 'id' | 'addedAt'>): EmployerRanking {
  const ranking: EmployerRanking = {
    ...data,
    id: `rank_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    addedAt: new Date().toISOString(),
  }
  const all = [ranking, ...getRankings()]
  writeAll(all)
  return ranking
}

export function deleteRanking(id: string) {
  writeAll(getRankings().filter((r) => r.id !== id))
}

/** 5 очков за каждое загруженное место, максимум 20 (см. computeEmployerRating в lib/reviews.ts). */
export function rankingBonus(rankings: EmployerRanking[]): number {
  return Math.min(20, rankings.length * 5)
}

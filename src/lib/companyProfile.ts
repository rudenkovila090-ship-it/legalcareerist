// Публичная карточка работодателя — то, что в боевой версии увидит
// кандидат на странице вакансии («О работодателе»). В этом прототипе
// редактируется в личном кабинете и хранится в localStorage, как и
// остальные данные кабинета.
export interface CompanyProfile {
  description: string
  industryCategory: string
  city: string
  orgType: string
  website: string
}

const KEY = 'ky_employer_company_profile'

function seed(): CompanyProfile {
  return {
    description: 'Юридическая фирма полного цикла: сопровождаем сделки M&A, корпоративное управление и налоговые споры для среднего и крупного бизнеса.',
    industryCategory: 'Консалтинг',
    city: 'Москва',
    orgType: 'ООО',
    website: '',
  }
}

export function getCompanyProfile(): CompanyProfile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...seed(), ...(JSON.parse(raw) as Partial<CompanyProfile>) }
    const seeded = seed()
    localStorage.setItem(KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return seed()
  }
}

export function saveCompanyProfile(profile: CompanyProfile): void {
  localStorage.setItem(KEY, JSON.stringify(profile))
}

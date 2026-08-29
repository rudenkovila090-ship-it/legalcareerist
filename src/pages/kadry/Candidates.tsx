import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import Testimonials from '../../components/Testimonials'
import { consultationTestimonials } from '../../data/testimonials'
import FAQSection from '../../components/FAQSection'
import { TagRow } from '../../components/Tag'
import LeadForm from '../../components/LeadForm'
import { vacancies } from '../../data/vacancies'
import {
  SPECIALIZATIONS, EMPLOYMENT_TYPES, WORK_SCHEDULES, EXPERIENCE_BUCKETS, EDUCATION_LEVELS,
  COMPANY_INDUSTRY_TREE,
  type Specialization, type WorkFormat, type EmploymentType, type WorkSchedule,
  type ExperienceBucket, type EducationLevel,
} from '../../types'
import KnowledgeList from '../KnowledgeList'
import CareerReserve from './CareerReserve'
import CareerConsultation from './CareerConsultation'

const money = new Intl.NumberFormat('ru-RU')

// Демо-счетчик просмотров вакансии — детерминированный (по id), чтобы не
// прыгал при каждом ререндере.
function vacancyViews(id: string | number) {
  const n = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return 60 + (n * 37) % 380
}

const benefits = [
  { title: 'Подбор работы без лишних хлопот', text: 'Берем переговоры с работодателем на себя и сопровождаем вас от заявки до выхода на позицию.' },
  { title: 'Только юридический рынок', text: 'Понимаем специфику профессии — говорим с вами на одном языке с первого дня.' },
  { title: 'Поддержка на каждом этапе', text: 'От первой заявки до выхода на позицию — или от разбора карьерной ситуации до плана действий.' },
]

const faqItems = [
  { q: 'В чем разница между кадровым резервом и консультацией?', a: 'Кадровый резерв — подбор вакансий под ваш профиль. Консультация — работа с карьерным консультантом: резюме, собеседования, стратегия поиска, карьерные кризисы.' },
  { q: 'Можно воспользоваться и тем, и другим?', a: 'Да, это независимые услуги — можно подать заявку в резерв и отдельно записаться на консультацию.' },
  { q: 'Как быстрее получить доступ к вакансиям?', a: 'Резиденты Сообщества видят новые вакансии первыми — раньше кадрового резерва и открытого рынка.' },
]

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
    </svg>
  )
}
function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M8 6.5h12M8 12h12M8 17.5h12" />
      <circle cx="3.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="17.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconStar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />
    </svg>
  )
}
function IconArchive() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1" />
      <path d="M4.5 9v9a1.5 1.5 0 0 0 1.5 1.5h12A1.5 1.5 0 0 0 19.5 18V9" />
      <path d="M10 13h4" />
    </svg>
  )
}
function IconBook2() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4 5.5c1.5-1 4-1.3 6-.5v14c-2-.8-4.5-.5-6 .5v-14z" />
      <path d="M20 5.5c-1.5-1-4-1.3-6-.5v14c2-.8 4.5-.5 6 .5v-14z" />
    </svg>
  )
}
function IconAccountCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 18.5c1.2-2.3 3.4-3.5 6-3.5s4.8 1.2 6 3.5" />
    </svg>
  )
}

const candidateTabs = [
  { id: 'overview', label: 'Главное', icon: IconHome },
  { id: 'vacancies', label: 'Вакансии', icon: IconList },
  { id: 'consultation', label: 'Карьерная консультация', icon: IconStar },
  { id: 'reserve', label: 'Кадровый резерв', icon: IconArchive },
  { id: 'knowledge', label: 'База знаний', icon: IconBook2 },
  { id: 'account', label: 'Личный кабинет', icon: IconAccountCircle },
] as const

// Раздел «Вакансии» на стороне соискателя — тот же справочник направлений,
// формат/занятость/город/опыт/образование/отрасль компании, что и на доске вакансий.
const vacancySpecIds: Specialization[] = ['inhouse', 'consulting', 'advocacy', 'notary', 'law_enforcement', 'government']
const vacancySpecs = vacancySpecIds.map((id) => SPECIALIZATIONS.find((s) => s.id === id)!)

const CITIES = ['Москва', 'Санкт-Петербург', 'Екатеринбург']

const formats: { id: WorkFormat; label: string }[] = [
  { id: 'office', label: 'Офис' },
  { id: 'hybrid', label: 'Гибрид' },
  { id: 'remote', label: 'Дистанционно' },
]

function parseMinSalary(text: string) {
  return Number(text.replace(/\D/g, '')) || 0
}

export default function Candidates() {
  const [tab, setTab] = useState<(typeof candidateTabs)[number]['id']>('overview')
  // Сброс скролла наверх при переключении подвкладки — иначе при переходе
  // снизу одной вкладки страница показывала низ следующей.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const [spec, setSpec] = useState<Specialization | 'all'>('all')
  const [format, setFormat] = useState<WorkFormat | 'any'>('any')
  const [schedule, setSchedule] = useState<WorkSchedule | 'any'>('any')
  const [employment, setEmployment] = useState<EmploymentType | 'any'>('any')
  const [city, setCity] = useState('')
  const [experience, setExperience] = useState<ExperienceBucket | 'any'>('any')
  const [salaryText, setSalaryText] = useState('')
  const [educationSel, setEducationSel] = useState<Set<EducationLevel>>(new Set())
  const [industrySel, setIndustrySel] = useState<Set<string>>(new Set())

  function toggleEducation(id: EducationLevel) {
    setEducationSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleIndustry(label: string) {
    setIndustrySel((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const minSalary = parseMinSalary(salaryText)
  const [selectedVacancySlug, setSelectedVacancySlug] = useState<string | null>(null)
  const selectedVacancy = vacancies.find((v) => v.slug === selectedVacancySlug) ?? null
  // Открытие конкретной вакансии подменяет список ее карточкой прямо на месте
  // (без перехода по роуту) — список короче карточки, поэтому без сброса
  // скролла страницу утаскивало вниз, к старой позиции клика.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [selectedVacancySlug])

  const filteredVacancies = useMemo(() => {
    return vacancies.filter((v) => {
      if (v.status !== 'open') return false
      if (spec !== 'all' && !v.specialization.includes(spec)) return false
      if (format !== 'any' && v.format !== format) return false
      if (schedule !== 'any' && v.schedule !== schedule) return false
      if (employment !== 'any' && v.employment !== employment) return false
      if (city && v.city !== city) return false
      if (experience !== 'any' && v.experience !== experience) return false
      if (educationSel.size > 0 && !v.education.some((e) => educationSel.has(e))) return false
      if (industrySel.size > 0 && !v.companyIndustry.some((t) => industrySel.has(t))) return false
      if (minSalary > 0 && (v.salaryFrom ?? 0) < minSalary && (v.salaryTo ?? 0) < minSalary) return false
      return true
    })
  }, [spec, format, schedule, employment, city, experience, educationSel, industrySel, minSalary])

  return (
    <div>
      {/* Вкладки раздела — сразу под панелью аудитории «Работодателям / Соискателям» из шапки.
          Закреплена (sticky) — остается на экране при скролле. */}
      <div className="sticky top-[142px] z-20 border-b border-ink/10 bg-white/95 py-4 backdrop-blur-xl [transform:translateZ(0)] [will-change:transform]">
        <div className="container-page">
        <div className="flex flex-wrap justify-end gap-3">
          {candidateTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.id ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'
              }`}
            >
              <t.icon />
              {t.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      {tab === 'overview' && (
        <>
          <div id="hero">
            <PageHero
              wide
              eyebrow="Кадровое юридическое агентство"
              title="Ищете работу или карьерный ориентир? Мы рядом на каждом шаге"
              description="Подбор вакансий, карьерные консультации — для студентов, юристов и начинающих специалистов юридического рынка."
            />
          </div>

          {/* Преимущества */}
          <section className="border-y border-ink/10 bg-white py-12">
            <div className="container-page">
              <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Преимущества</div>
              <h2 className="mb-6 text-2xl font-semibold">Почему соискатели обращаются к нам</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {benefits.map((b) => (
                  <div key={b.title} className="glass rounded-xl p-5">
                    <div className="font-semibold">{b.title}</div>
                    <p className="mt-2 text-sm text-ink/60">{b.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Отзывы */}
          <Testimonials items={consultationTestimonials} compact />

          {/* FAQ */}
          <FAQSection items={faqItems} title="Частые вопросы" />

          {/* Доп. призыв к действию */}
          <section className="container-page pb-16">
            <div className="rounded-2xl bg-ink px-6 py-10 text-center text-white sm:px-10">
              <div className="text-xl font-semibold">Не знаете, с чего начать?</div>
              <p className="mx-auto mt-2 max-w-lg text-sm text-white/70">
                Напишите в Telegram — подскажем, какая услуга подойдет именно вам.
              </p>
              <a
                href="https://t.me/legalcareerst_support"
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-block rounded-full bg-gold-light px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-white"
              >
                Написать в Telegram
              </a>
            </div>
          </section>
        </>
      )}

      {tab === 'vacancies' && selectedVacancy && (
        <section className="container-page pb-16">
          <button
            type="button"
            onClick={() => setSelectedVacancySlug(null)}
            className="text-sm text-ink/50 hover:text-ink"
          >
            ← Все вакансии
          </button>

          <div className="mt-4 grid gap-8 lg:grid-cols-[2fr_1fr]">
            <div>
              <h1 className="text-3xl font-semibold">{selectedVacancy.title}</h1>
              <div className="mt-2 text-ink/60">{selectedVacancy.anonymous ? 'Компания скрыта' : selectedVacancy.company} · {selectedVacancy.city}</div>
              <div className="mt-1 text-sm text-ink/40">{vacancyViews(selectedVacancy.id)} просмотров</div>
              <div className="mt-3">
                <TagRow specialization={selectedVacancy.specialization} industry={selectedVacancy.industry} />
              </div>

              <div className="mt-6 text-lg font-medium">
                {selectedVacancy.salaryFrom ? `от ${money.format(selectedVacancy.salaryFrom)} ₽` : 'По договоренности'}
                {selectedVacancy.salaryTo ? ` до ${money.format(selectedVacancy.salaryTo)} ₽` : ''}
              </div>

              <p className="mt-6 leading-relaxed text-ink/80">{selectedVacancy.description}</p>

              <div className="mt-6">
                <h2 className="font-semibold">Требования</h2>
                <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
                  {selectedVacancy.requirements.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>

              <div className="mt-6">
                <h2 className="font-semibold">Условия</h2>
                <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
                  {selectedVacancy.conditions.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </div>
            </div>

            <aside>
              <LeadForm
                sourceBlock="kadry"
                formType="vacancy_application"
                title="Откликнуться на вакансию"
                description={`Заявка на позицию «${selectedVacancy.title}»`}
                contactLabel="Почта"
                showPhone
                showTelegram
                showResumeUpload
              />
            </aside>
          </div>
        </section>
      )}

      {tab === 'vacancies' && !selectedVacancy && (
        <section className="container-page pb-16">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">Вакансии</div>
          <h2 className="mb-6 text-2xl font-semibold">Доска вакансий</h2>
          <div className="mb-6 rounded-lg bg-ink/[0.04] p-4 text-sm text-ink/60">
            Вакансии открываются по приоритету: сначала их видят резиденты Сообщества, затем — кадровый
            резерв, и только после этого — открытый доступ (см. вкладку «Кадровый резерв»).
          </div>
          <div className="glass mb-8 space-y-4 rounded-xl p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <select
                value={spec}
                onChange={(e) => setSpec(e.target.value as Specialization | 'all')}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
              >
                <option value="all" disabled hidden>Направление</option>
                {spec !== 'all' && <option value="all">Все направления</option>}
                {vacancySpecs.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as WorkFormat | 'any')}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
              >
                <option value="any" disabled hidden>Формат</option>
                {format !== 'any' && <option value="any">Любой формат</option>}
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <select
                value={schedule}
                onChange={(e) => setSchedule(e.target.value as WorkSchedule | 'any')}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
              >
                <option value="any" disabled hidden>График</option>
                {schedule !== 'any' && <option value="any">Любой график</option>}
                {WORK_SCHEDULES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              <select
                value={employment}
                onChange={(e) => setEmployment(e.target.value as EmploymentType | 'any')}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
              >
                <option value="any" disabled hidden>Занятость</option>
                {employment !== 'any' && <option value="any">Любая занятость</option>}
                {EMPLOYMENT_TYPES.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
              >
                <option value="" disabled hidden>Город</option>
                {city && <option value="">Все города</option>}
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select
                value={experience}
                onChange={(e) => setExperience(e.target.value as ExperienceBucket | 'any')}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm"
              >
                <option value="any" disabled hidden>Опыт работы</option>
                {experience !== 'any' && <option value="any">Любой опыт</option>}
                {EXPERIENCE_BUCKETS.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </div>

            <input
              value={salaryText}
              onChange={(e) => setSalaryText(e.target.value)}
              placeholder="Уровень заработной платы, ₽ (например, 100 000)"
              className="w-full rounded-lg border border-ink/15 px-3 py-2 text-sm sm:max-w-xs"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-ink/15 p-3">
                <div className="mb-2 text-sm font-medium text-ink/70">Отрасль компании</div>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {COMPANY_INDUSTRY_TREE.map((group) => (
                    <div key={group.category}>
                      <label className="flex items-center gap-2 text-sm font-medium text-ink">
                        <input
                          type="checkbox"
                          checked={industrySel.has(group.category)}
                          onChange={() => toggleIndustry(group.category)}
                        />
                        {group.category}
                      </label>
                      <div className="ml-5 mt-1 space-y-1">
                        {group.items.map((item) => (
                          <label key={item} className="flex items-center gap-2 text-sm text-ink/60">
                            <input
                              type="checkbox"
                              checked={industrySel.has(item)}
                              onChange={() => toggleIndustry(item)}
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-ink/15 p-3">
                <div className="mb-2 text-sm font-medium text-ink/70">Образование</div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {EDUCATION_LEVELS.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm text-ink/70">
                      <input
                        type="checkbox"
                        checked={educationSel.has(e.id)}
                        onChange={() => toggleEducation(e.id)}
                      />
                      {e.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-sm text-ink/50">{filteredVacancies.length} вакансий</div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVacancies.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVacancySlug(v.slug)}
                className="glass block rounded-xl p-5 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold leading-snug">{v.title}</h3>
                  {v.urgent && <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">Срочно</span>}
                </div>
                <div className="mt-1 text-sm text-ink/60">{v.anonymous ? 'Компания скрыта' : v.company} · {v.city}</div>
                <div className="mt-2 text-sm font-medium text-ink">
                  {v.salaryFrom ? `от ${money.format(v.salaryFrom)} ₽` : 'По договоренности'}
                  {v.salaryTo ? ` до ${money.format(v.salaryTo)} ₽` : ''}
                </div>
                <div className="mt-3">
                  <TagRow specialization={v.specialization} industry={v.industry} />
                </div>
                <div className="mt-3 text-xs text-ink/40">{vacancyViews(v.id)} просмотров</div>
              </button>
            ))}
            {filteredVacancies.length === 0 && <p className="text-ink/50">По заданным фильтрам вакансий не найдено.</p>}
          </div>
        </section>
      )}

      {tab === 'consultation' && <CareerConsultation embedded />}
      {tab === 'reserve' && <CareerReserve embedded />}

      {tab === 'knowledge' && (
        <section className="container-page pb-16">
          <div className="mb-2 text-sm font-medium uppercase tracking-wide text-gold">База знаний</div>
          <h2 className="mb-6 text-2xl font-semibold">Статьи, чек-листы и глоссарий для соискателей</h2>
          <KnowledgeList
            audience="candidates"
            eyebrow="Кадры · Соискателям"
            title="База знаний"
            compact
          />
        </section>
      )}

      {tab === 'account' && (
        <section className="container-page pb-16">
          <div className="rounded-2xl bg-ink px-6 py-10 text-center text-white sm:px-10">
            <div className="text-sm font-medium uppercase tracking-wide text-gold-light">Личный кабинет</div>
            <h2 className="mt-2 text-2xl font-semibold">Заявки, статусы и документы в одном месте</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
              Сквозной личный кабинет для работодателей и соискателей — демо-каркас раздела.
            </p>
            <Link to="/account" className="mt-5 inline-block rounded-full bg-gold-light px-6 py-2.5 text-sm font-semibold text-ink hover:opacity-90">
              Перейти в личный кабинет
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}

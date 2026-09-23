import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import PhoneInput from '../../components/PhoneInput'
import ChipToggle from '../../components/ChipToggle'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getActiveRole } from '../../lib/accountRole'
import { getVacancy, createVacancy, updateVacancyData } from '../../lib/vacancies'
import { canGenerate, consumeGeneration, VACANCY_CREDITS_KEY } from '../../lib/generationCredits'
import { demoEmployer, demoEmployerCompany } from '../../lib/account'
import {
  SPECIALIZATIONS, INDUSTRIES, WORK_FORMATS, EDUCATION_LEVELS, EMPLOYMENT_TYPES, WORK_SCHEDULES, EXPERIENCE_BUCKETS,
  type VacancyFormData, type Specialization, type Industry, type WorkFormat,
  type EmploymentType, type WorkSchedule, type ExperienceBucket, type EducationLevel, type CandidateLevel,
} from '../../types'

const levelLabel: Record<CandidateLevel, string> = { junior: 'Junior', middle: 'Middle', senior: 'Senior' }

function emptyForm(): VacancyFormData {
  return {
    title: '',
    company: demoEmployerCompany.name,
    anonymous: false,
    city: '',
    format: 'office',
    employment: 'full',
    schedule: '5/2',
    level: 'middle',
    experience: 'from1to3',
    education: [],
    specialization: [],
    industry: [],
    salaryFrom: 0,
    salaryTo: 0,
    description: '',
    requirements: '',
    conditions: '',
    contactPhone: demoEmployer.phone ?? '',
    contactEmail: demoEmployer.email,
  }
}

const inputClass = 'rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40'

// Конструктор вакансии — заполняемая форма (без ИИ, тот же принцип, что и
// конструктор резюме соискателя): результат уходит "на модерацию", см.
// EmployerAccount.tsx (демо-кнопки за модератора вместо реального бэкенда)
// и базу знаний работодателя ("Как создать вакансию через бота" — здесь
// та же последовательность полей, только через форму сайта, а не бота).
// Каждая новая вакансия списывает одну генерацию (generationCredits.ts) —
// 1 бесплатная раз в 72ч + докупаемые пакеты; редактирование генерацию не списывает.
export default function VacancyBuilder() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  useDocumentTitle(isEdit ? 'Редактировать вакансию' : 'Конструктор вакансии')
  const navigate = useNavigate()
  const role = getActiveRole()
  const existing = id ? getVacancy(id) : undefined

  const [form, setForm] = useState<VacancyFormData>(existing?.data ?? emptyForm())
  const [blocked, setBlocked] = useState(false)

  if (role !== 'employer') return <Navigate to="/account" replace />
  if (id && !existing) return <Navigate to="/account/employer" replace />

  function update<K extends keyof VacancyFormData>(key: K, value: VacancyFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleArrayField<T extends string>(key: 'specialization' | 'industry' | 'education', id: T) {
    setForm((f) => {
      const arr = f[key] as unknown as T[]
      const next = arr.includes(id) ? arr.filter((v) => v !== id) : [...arr, id]
      return { ...f, [key]: next }
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isEdit && !canGenerate(VACANCY_CREDITS_KEY)) {
      setBlocked(true)
      return
    }
    if (isEdit && id) {
      updateVacancyData(id, form)
      navigate('/account/employer')
      return
    }
    consumeGeneration(VACANCY_CREDITS_KEY)
    createVacancy(form)
    navigate('/account/employer')
  }

  return (
    <div>
      <PageHero
        eyebrow="Личный кабинет · Работодатель"
        title={isEdit ? 'Редактировать вакансию' : 'Конструктор вакансии'}
        description="Заполните форму — вакансия соберется по шаблону и уйдет на модерацию, как и при создании через бота."
      />

      <form onSubmit={handleSubmit} className="container-page grid gap-8 py-10 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="glass rounded-xl p-6">
            <h2 className="mb-4 font-semibold">1. Основное</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Название должности" required className={inputClass} />
              <input
                value={form.company}
                onChange={(e) => update('company', e.target.value)}
                placeholder="Компания"
                required
                disabled={form.anonymous}
                className={`${inputClass} disabled:opacity-40`}
              />
              <input value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="Город" required className={inputClass} />
              <label className="flex items-center gap-2 self-center text-sm text-ink/60">
                <input type="checkbox" checked={form.anonymous} onChange={(e) => update('anonymous', e.target.checked)} />
                Анонимная вакансия (без названия компании)
              </label>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Формат работы</div>
                <ChipToggle options={WORK_FORMATS} selected={[form.format]} onToggle={(id: WorkFormat) => update('format', id)} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Занятость</div>
                <ChipToggle options={EMPLOYMENT_TYPES} selected={[form.employment]} onToggle={(id: EmploymentType) => update('employment', id)} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">График</div>
                <ChipToggle options={WORK_SCHEDULES} selected={[form.schedule]} onToggle={(id: WorkSchedule) => update('schedule', id)} />
              </div>
            </div>
          </div>

          <div className="glass rounded-xl p-6">
            <h2 className="mb-4 font-semibold">2. Специализация и требования</h2>
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Специализация</div>
                <ChipToggle options={SPECIALIZATIONS} selected={form.specialization} onToggle={(id: Specialization) => toggleArrayField('specialization', id)} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Отрасль права</div>
                <ChipToggle options={INDUSTRIES} selected={form.industry} onToggle={(id: Industry) => toggleArrayField('industry', id)} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Уровень</div>
                <div className="flex gap-2">
                  {(Object.keys(levelLabel) as CandidateLevel[]).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => update('level', l)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        form.level === l ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink/60 hover:border-ink/40'
                      }`}
                    >
                      {levelLabel[l]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Требуемый опыт</div>
                <ChipToggle options={EXPERIENCE_BUCKETS} selected={[form.experience]} onToggle={(id: ExperienceBucket) => update('experience', id)} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Образование</div>
                <ChipToggle options={EDUCATION_LEVELS} selected={form.education} onToggle={(id: EducationLevel) => toggleArrayField('education', id)} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Вилка зарплаты, ₽/мес</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} step={5000}
                    value={form.salaryFrom || ''}
                    onChange={(e) => update('salaryFrom', Number(e.target.value) || 0)}
                    placeholder="От"
                    className={`${inputClass} w-32`}
                  />
                  <span className="text-ink/40">—</span>
                  <input
                    type="number" min={0} step={5000}
                    value={form.salaryTo || ''}
                    onChange={(e) => update('salaryTo', Number(e.target.value) || 0)}
                    placeholder="До"
                    className={`${inputClass} w-32`}
                  />
                </div>
                <p className="mt-1 text-xs text-ink/40">Вакансии без вилки зарплаты получают заметно меньше целевых откликов.</p>
              </div>
            </div>
          </div>

          <div className="glass rounded-xl p-6">
            <h2 className="mb-4 font-semibold">3. Описание</h2>
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Обязанности</div>
                <textarea
                  value={form.description}
                  onChange={(e) => update('description', e.target.value)}
                  placeholder={'Каждый пункт с новой строки, например:\nСопровождение сделок M&A\nDue diligence объектов'}
                  rows={4}
                  required
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Требования</div>
                <textarea
                  value={form.requirements}
                  onChange={(e) => update('requirements', e.target.value)}
                  placeholder={'Каждый пункт с новой строки'}
                  rows={3}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">Условия</div>
                <textarea
                  value={form.conditions}
                  onChange={(e) => update('conditions', e.target.value)}
                  placeholder={'Оформление, ДМС, премии — каждый пункт с новой строки'}
                  rows={3}
                  className={`${inputClass} w-full`}
                />
              </div>
            </div>
          </div>

          <div className="glass rounded-xl p-6">
            <h2 className="mb-4 font-semibold">4. Контакты</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <PhoneInput value={form.contactPhone} onChange={(v) => update('contactPhone', v)} required className={inputClass} />
              <input type="email" value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} placeholder="Почта" required className={inputClass} />
            </div>
          </div>
        </div>

        <aside className="h-fit lg:sticky lg:top-20">
          <div className="glass-dark rounded-xl p-6 text-white">
            <div className="text-sm font-medium uppercase tracking-wide text-gold-light">Готово?</div>
            <p className="mt-2 text-sm text-white/60">
              {isEdit
                ? 'Изменения сохранятся сразу.'
                : 'Вакансия уйдет на модерацию — обычно занимает до 1 рабочего дня.'}
            </p>
            {blocked && (
              <p className="mt-3 rounded-lg bg-red-500/15 p-3 text-sm text-red-200">
                Генерации закончились — купите пакет в личном кабинете или дождитесь бесплатной раз в 72 часа.
              </p>
            )}
            <button type="submit" className="mt-4 w-full rounded-full bg-gold-light py-3 text-sm font-semibold text-ink hover:opacity-90">
              {isEdit ? 'Сохранить изменения' : 'Отправить на модерацию'}
            </button>
          </div>
        </aside>
      </form>
    </div>
  )
}

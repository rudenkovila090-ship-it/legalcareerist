import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import PhoneInput from '../../components/PhoneInput'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getActiveRole } from '../../lib/accountRole'
import { getResume, saveConstructorResume } from '../../lib/resumes'
import { canGenerate, consumeGeneration, RESUME_CREDITS_KEY } from '../../lib/generationCredits'
import { demoUser } from '../../lib/account'
import {
  SPECIALIZATIONS, INDUSTRIES, WORK_FORMATS, EDUCATION_LEVELS,
  type ResumeFormData, type ResumeExperienceEntry, type ResumeEducationEntry,
  type Specialization, type Industry, type WorkFormat, type CandidateLevel, type EducationLevel,
} from '../../types'

const levelLabel: Record<CandidateLevel, string> = { junior: 'Junior', middle: 'Middle', senior: 'Senior' }

function emptyExperience(): ResumeExperienceEntry {
  return { id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, company: '', position: '', startDate: '', endDate: '', current: false, duties: '' }
}
function emptyEducation(): ResumeEducationEntry {
  return { id: `edu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, institution: '', degree: 'bachelor', faculty: '', graduationYear: '' }
}
function emptyForm(): ResumeFormData {
  return {
    fullName: demoUser.name,
    desiredPosition: '',
    city: '',
    phone: demoUser.phone ?? '',
    email: demoUser.email,
    telegram: demoUser.telegramId ?? '',
    specialization: [],
    industry: [],
    level: 'middle',
    format: [],
    salaryExpectation: 0,
    experience: [emptyExperience()],
    education: [emptyEducation()],
    skills: [],
    about: '',
  }
}

const inputClass = 'rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40'

function ChipToggle<T extends string>({ options, selected, onToggle }: { options: { id: T; label: string }[]; selected: T[]; onToggle: (id: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onToggle(o.id)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            selected.includes(o.id) ? 'border-ink bg-ink text-white' : 'border-ink/15 text-ink/60 hover:border-ink/40'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Конструктор резюме — заполняемая форма (без ИИ, см. решение по объему
// работ): результат собирается по фиксированному шаблону с фирменным
// оформлением "Карьерного юриста" (см. ResumeView.tsx). Каждое создание
// нового резюме списывает одну генерацию (generationCredits.ts) — 1
// бесплатная раз в 72ч + докупаемые пакеты; редактирование уже созданного
// резюме генерацию не списывает.
export default function ResumeBuilder() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  useDocumentTitle(isEdit ? 'Редактировать резюме' : 'Конструктор резюме')
  const navigate = useNavigate()
  const role = getActiveRole()
  const existing = id ? getResume(id) : undefined

  const [form, setForm] = useState<ResumeFormData>(existing?.data ?? emptyForm())
  const [skillInput, setSkillInput] = useState('')
  const [blocked, setBlocked] = useState(false)

  if (role !== 'candidate') return <Navigate to="/account" replace />
  if (id && (!existing || existing.source !== 'constructor')) return <Navigate to="/account/candidate" replace />

  function update<K extends keyof ResumeFormData>(key: K, value: ResumeFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleArrayField<T extends string>(key: 'specialization' | 'industry' | 'format', id: T) {
    setForm((f) => {
      const arr = f[key] as unknown as T[]
      const next = arr.includes(id) ? arr.filter((v) => v !== id) : [...arr, id]
      return { ...f, [key]: next }
    })
  }

  function addExperience() {
    setForm((f) => ({ ...f, experience: [...f.experience, emptyExperience()] }))
  }
  function removeExperience(entryId: string) {
    setForm((f) => ({ ...f, experience: f.experience.filter((e) => e.id !== entryId) }))
  }
  function updateExperience(entryId: string, patch: Partial<ResumeExperienceEntry>) {
    setForm((f) => ({ ...f, experience: f.experience.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) }))
  }

  function addEducation() {
    setForm((f) => ({ ...f, education: [...f.education, emptyEducation()] }))
  }
  function removeEducation(entryId: string) {
    setForm((f) => ({ ...f, education: f.education.filter((e) => e.id !== entryId) }))
  }
  function updateEducation(entryId: string, patch: Partial<ResumeEducationEntry>) {
    setForm((f) => ({ ...f, education: f.education.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) }))
  }

  function addSkill() {
    const v = skillInput.trim()
    if (!v || form.skills.includes(v)) return
    update('skills', [...form.skills, v])
    setSkillInput('')
  }
  function removeSkill(s: string) {
    update('skills', form.skills.filter((sk) => sk !== s))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isEdit && !canGenerate(RESUME_CREDITS_KEY)) {
      setBlocked(true)
      return
    }
    if (!isEdit) consumeGeneration(RESUME_CREDITS_KEY)
    const saved = saveConstructorResume(form, id)
    navigate(`/account/candidate/resume/${saved.id}`)
  }

  return (
    <div>
      <PageHero
        eyebrow="Личный кабинет · Соискатель"
        title={isEdit ? 'Редактировать резюме' : 'Конструктор резюме'}
        description="Заполните форму — резюме соберется автоматически по фирменному шаблону «Карьерного юриста»."
      />

      <form onSubmit={handleSubmit} className="container-page grid gap-8 py-10 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="glass rounded-xl p-6">
            <h2 className="mb-4 font-semibold">1. Контакты</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} placeholder="ФИО" required className={inputClass} />
              <input value={form.desiredPosition} onChange={(e) => update('desiredPosition', e.target.value)} placeholder="Желаемая должность" required className={inputClass} />
              <input value={form.city} onChange={(e) => update('city', e.target.value)} placeholder="Город" required className={inputClass} />
              <PhoneInput value={form.phone} onChange={(v) => update('phone', v)} required className={inputClass} />
              <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="Почта" required className={inputClass} />
              <input value={form.telegram} onChange={(e) => update('telegram', e.target.value)} placeholder="Telegram" className={inputClass} />
            </div>
          </div>

          <div className="glass rounded-xl p-6">
            <h2 className="mb-4 font-semibold">2. Специализация и условия</h2>
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
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Формат работы</div>
                <ChipToggle options={WORK_FORMATS} selected={form.format} onToggle={(id: WorkFormat) => toggleArrayField('format', id)} />
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">Ожидания по зарплате, ₽</div>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={form.salaryExpectation || ''}
                  onChange={(e) => update('salaryExpectation', Number(e.target.value) || 0)}
                  placeholder="Например, 120000"
                  className={`${inputClass} w-48`}
                />
              </div>
            </div>
          </div>

          <div className="glass rounded-xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">3. Опыт работы</h2>
              <button type="button" onClick={addExperience} className="text-sm font-medium text-ink underline">+ Добавить место работы</button>
            </div>
            <div className="space-y-4">
              {form.experience.map((exp, i) => (
                <div key={exp.id} className="rounded-lg border border-ink/10 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Место работы {i + 1}</div>
                    {form.experience.length > 1 && (
                      <button type="button" onClick={() => removeExperience(exp.id)} className="text-xs text-ink/40 hover:text-red-600">Удалить</button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={exp.company} onChange={(e) => updateExperience(exp.id, { company: e.target.value })} placeholder="Компания" className={inputClass} />
                    <input value={exp.position} onChange={(e) => updateExperience(exp.id, { position: e.target.value })} placeholder="Должность" className={inputClass} />
                    <input type="month" value={exp.startDate} onChange={(e) => updateExperience(exp.id, { startDate: e.target.value })} placeholder="Начало" className={inputClass} />
                    <div className="flex items-center gap-2">
                      <input
                        type="month"
                        value={exp.current ? '' : exp.endDate}
                        disabled={exp.current}
                        onChange={(e) => updateExperience(exp.id, { endDate: e.target.value })}
                        className={`${inputClass} flex-1 disabled:opacity-40`}
                      />
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink/60">
                        <input type="checkbox" checked={exp.current} onChange={(e) => updateExperience(exp.id, { current: e.target.checked, endDate: '' })} />
                        По настоящее время
                      </label>
                    </div>
                  </div>
                  <textarea
                    value={exp.duties}
                    onChange={(e) => updateExperience(exp.id, { duties: e.target.value })}
                    placeholder="Обязанности и достижения"
                    rows={3}
                    className={`${inputClass} mt-3 w-full`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">4. Образование</h2>
              <button type="button" onClick={addEducation} className="text-sm font-medium text-ink underline">+ Добавить</button>
            </div>
            <div className="space-y-4">
              {form.education.map((edu, i) => (
                <div key={edu.id} className="rounded-lg border border-ink/10 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Образование {i + 1}</div>
                    {form.education.length > 1 && (
                      <button type="button" onClick={() => removeEducation(edu.id)} className="text-xs text-ink/40 hover:text-red-600">Удалить</button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={edu.institution} onChange={(e) => updateEducation(edu.id, { institution: e.target.value })} placeholder="Учебное заведение" className={inputClass} />
                    <select
                      value={edu.degree}
                      onChange={(e) => updateEducation(edu.id, { degree: e.target.value as EducationLevel })}
                      className={inputClass}
                    >
                      {EDUCATION_LEVELS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                    <input value={edu.faculty} onChange={(e) => updateEducation(edu.id, { faculty: e.target.value })} placeholder="Факультет" className={inputClass} />
                    <input value={edu.graduationYear} onChange={(e) => updateEducation(edu.id, { graduationYear: e.target.value })} placeholder="Год выпуска" className={inputClass} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-xl p-6">
            <h2 className="mb-4 font-semibold">5. Навыки и о себе</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              {form.skills.map((s) => (
                <span key={s} className="flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-1 text-xs font-medium text-ink/70">
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} className="text-ink/40 hover:text-ink">✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill() } }}
                placeholder="Навык — и Enter"
                className={`${inputClass} flex-1`}
              />
              <button type="button" onClick={addSkill} className="rounded-lg border border-ink/15 px-4 text-sm font-medium text-ink/70 hover:border-ink/40">Добавить</button>
            </div>
            <textarea
              value={form.about}
              onChange={(e) => update('about', e.target.value)}
              placeholder="О себе — коротко о карьерных целях и сильных сторонах"
              rows={4}
              className={`${inputClass} mt-4 w-full`}
            />
          </div>
        </div>

        <aside className="h-fit lg:sticky lg:top-20">
          <div className="glass-dark rounded-xl p-6 text-white">
            <div className="text-sm font-medium uppercase tracking-wide text-gold-light">Готово?</div>
            <p className="mt-2 text-sm text-white/60">
              Резюме соберется по фирменному шаблону «Карьерного юриста» — с оформлением, которое видно на первый взгляд.
            </p>
            {blocked && (
              <p className="mt-3 rounded-lg bg-red-500/15 p-3 text-sm text-red-200">
                Генерации закончились — купите пакет в личном кабинете или дождитесь бесплатной раз в 72 часа.
              </p>
            )}
            <button type="submit" className="mt-4 w-full rounded-full bg-gold-light py-3 text-sm font-semibold text-ink hover:opacity-90">
              {isEdit ? 'Сохранить изменения' : 'Сгенерировать резюме'}
            </button>
          </div>
        </aside>
      </form>
    </div>
  )
}

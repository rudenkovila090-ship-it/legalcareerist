import { Link, Navigate, useParams } from 'react-router-dom'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getActiveRole } from '../../lib/accountRole'
import { getResume } from '../../lib/resumes'
import { SPECIALIZATIONS, INDUSTRIES, EDUCATION_LEVELS, WORK_FORMATS, type CandidateLevel } from '../../types'

const levelLabel: Record<CandidateLevel, string> = { junior: 'Junior', middle: 'Middle', senior: 'Senior' }
const specLabel = Object.fromEntries(SPECIALIZATIONS.map((s) => [s.id, s.label]))
const industryLabel = Object.fromEntries(INDUSTRIES.map((s) => [s.id, s.label]))
const degreeLabel = Object.fromEntries(EDUCATION_LEVELS.map((s) => [s.id, s.label]))
const formatLabel = Object.fromEntries(WORK_FORMATS.map((s) => [s.id, s.label]))
const money = new Intl.NumberFormat('ru-RU')

function formatPeriod(start: string, end: string, current: boolean) {
  const f = (v: string) => {
    if (!v) return '…'
    const [y, m] = v.split('-')
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  }
  return `${f(start)} — ${current ? 'по настоящее время' : f(end)}`
}

// Печатная версия резюме — сам "шаблон" конструктора: фирменное
// оформление (плашка "Карьерного юриста" вверху и внизу) как знак,
// что резюме составлено через сервис, не просто голый список полей.
// Печать/сохранение в PDF — через window.print() (браузерный диалог),
// header/footer сайта скрыты через @media print в index.css.
export default function ResumeView() {
  const { id } = useParams()
  const role = getActiveRole()
  const resume = id ? getResume(id) : undefined
  useDocumentTitle(resume?.data ? `Резюме — ${resume.data.desiredPosition}` : 'Резюме')

  if (role !== 'candidate') return <Navigate to="/account" replace />
  if (!resume || resume.source !== 'constructor' || !resume.data) return <Navigate to="/account/candidate" replace />

  const d = resume.data

  return (
    <div className="bg-ink/[0.03] py-10 print:bg-white print:py-0">
      <div className="container-page mb-6 flex items-center justify-between print:hidden">
        <Link to="/account/candidate" className="text-sm text-ink/50 hover:text-ink">← В личный кабинет</Link>
        <div className="flex gap-3">
          <Link to={`/account/candidate/resume/${resume.id}/edit`} className="rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold text-ink/70 hover:border-ink/40">
            Редактировать
          </Link>
          <button type="button" onClick={() => window.print()} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-ink/90">
            Печать / Сохранить PDF
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-10 shadow-xl print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-6 flex items-center justify-between border-b-2 border-ink pb-4">
          <div>
            <div className="text-2xl font-bold text-ink">{d.fullName}</div>
            <div className="mt-0.5 text-lg text-gold">{d.desiredPosition}</div>
          </div>
          <div className="text-right text-xs font-semibold uppercase tracking-wide text-ink/40">
            Резюме составлено<br />через «Карьерного юриста»
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-ink/70 sm:grid-cols-4">
          <div>{d.city}</div>
          <div>{d.phone}</div>
          <div>{d.email}</div>
          {d.telegram && <div>{d.telegram}</div>}
        </div>

        <div className="mb-6 flex flex-wrap gap-1.5">
          {d.specialization.map((s) => <span key={s} className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">{specLabel[s]}</span>)}
          {d.industry.map((s) => <span key={s} className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">{industryLabel[s]}</span>)}
          <span className="rounded-full bg-gold-light px-2.5 py-1 text-xs font-semibold text-ink">{levelLabel[d.level]}</span>
        </div>

        <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink/70">
          {d.format.length > 0 && <div>Формат: {d.format.map((f) => formatLabel[f]).join(', ')}</div>}
          {d.salaryExpectation > 0 && <div>Ожидания по зарплате: {money.format(d.salaryExpectation)} ₽</div>}
        </div>

        {d.about && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold">О себе</h2>
            <p className="text-sm leading-relaxed text-ink/80">{d.about}</p>
          </section>
        )}

        {d.experience.some((e) => e.company || e.position) && (
          <section className="mb-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold">Опыт работы</h2>
            <div className="space-y-4">
              {d.experience.filter((e) => e.company || e.position).map((e) => (
                <div key={e.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <div className="font-semibold text-ink">{e.position}{e.company && ` — ${e.company}`}</div>
                    <div className="text-xs text-ink/50">{formatPeriod(e.startDate, e.endDate, e.current)}</div>
                  </div>
                  {e.duties && <p className="mt-1 whitespace-pre-line text-sm text-ink/70">{e.duties}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {d.education.some((e) => e.institution) && (
          <section className="mb-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gold">Образование</h2>
            <div className="space-y-2">
              {d.education.filter((e) => e.institution).map((e) => (
                <div key={e.id} className="text-sm">
                  <span className="font-semibold text-ink">{e.institution}</span>
                  <span className="text-ink/60">
                    {e.faculty && `, ${e.faculty}`}{' — '}{degreeLabel[e.degree]}{e.graduationYear && `, ${e.graduationYear}`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {d.skills.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gold">Навыки</h2>
            <div className="flex flex-wrap gap-1.5">
              {d.skills.map((s) => <span key={s} className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-xs font-medium text-ink/70">{s}</span>)}
            </div>
          </section>
        )}

        <div className="mt-8 border-t border-ink/10 pt-3 text-center text-[11px] text-ink/30">
          Резюме сгенерировано в конструкторе «Карьерного юриста» — legalcareerist.ru
        </div>
      </div>
    </div>
  )
}

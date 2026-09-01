import type { ReactNode } from 'react'
import { TagRow } from './Tag'
import type { Vacancy } from '../types'

const money = new Intl.NumberFormat('ru-RU')

/**
 * Основной контент детальной карточки вакансии — общий для отдельной
 * страницы (/vacancies/:slug, VacancyDetail.tsx) и вкладки «Вакансии»
 * внутри «Кадры → Соискателям» (Candidates.tsx), чтобы структура не
 * расходилась между двумя местами, где вакансия показывается подробно.
 * extra — точка вставки специфичного для страницы контента (например,
 * счетчик просмотров в Candidates.tsx) сразу после строки компания/город.
 */
export default function VacancyDetailBody({ vacancy, extra }: { vacancy: Vacancy; extra?: ReactNode }) {
  const hasContacts = vacancy.contactPhone || vacancy.contactEmail
  const hasFooter = vacancy.companyWebsite || vacancy.companyAddress

  return (
    <>
      {vacancy.technicalExample && (
        <div className="mb-4 inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Технический пример — показывает структуру страницы вакансии, не реальное предложение о работе.
        </div>
      )}

      {vacancy.companyTagline && (
        <div className="text-sm font-medium uppercase tracking-wide text-gold">{vacancy.companyTagline}</div>
      )}
      <h1 className="mt-1 text-3xl font-semibold">{vacancy.title}</h1>
      <div className="mt-2 text-ink/60">{vacancy.anonymous ? 'Компания скрыта' : vacancy.company} · {vacancy.city}</div>
      {extra}
      <div className="mt-3">
        <TagRow specialization={vacancy.specialization} industry={vacancy.industry} />
      </div>

      <div className="mt-6 text-lg font-medium">
        {vacancy.salaryFrom ? `от ${money.format(vacancy.salaryFrom)} ₽` : 'По договоренности'}
        {vacancy.salaryTo ? ` до ${money.format(vacancy.salaryTo)} ₽` : ''}
      </div>

      <p className="mt-6 leading-relaxed text-ink/80">{vacancy.description}</p>

      {vacancy.highlights && vacancy.highlights.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold">Почему эта вакансия интересна</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {vacancy.highlights.map((h) => (
              <div key={h.title} className="glass rounded-xl p-4">
                <div className="font-medium">{h.title}</div>
                <div className="mt-1 text-sm text-ink/60">{h.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {vacancy.responsibilities && vacancy.responsibilities.length > 0 ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="font-semibold">Что предстоит делать</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
              {vacancy.responsibilities.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">Кого мы ищем</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
              {vacancy.requirements.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <h2 className="font-semibold">Требования</h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
            {vacancy.requirements.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-8 rounded-xl bg-ink/[0.04] p-5">
        <h2 className="font-semibold">Условия</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
          {vacancy.conditions.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>

      {vacancy.practiceAreas && vacancy.practiceAreas.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold">Направления деятельности компании</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {vacancy.practiceAreas.map((p) => (
              <span key={p} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink/70">{p}</span>
            ))}
          </div>
        </div>
      )}

      {(hasContacts || hasFooter) && (
        <div className="mt-8 rounded-xl border border-ink/10 p-5 text-sm">
          {hasContacts && (
            <>
              <div className="font-semibold">Контакты по вакансии</div>
              <div className="mt-2 space-y-1 text-ink/70">
                {vacancy.contactPhone && <div>Телефон: {vacancy.contactPhone}</div>}
                {vacancy.contactEmail && <div>Эл. почта: {vacancy.contactEmail}</div>}
              </div>
            </>
          )}
          {hasFooter && (
            <div className={hasContacts ? 'mt-4 border-t border-ink/10 pt-4 text-ink/50' : 'text-ink/50'}>
              {vacancy.companyWebsite && <div>{vacancy.companyWebsite}</div>}
              {vacancy.companyAddress && <div>{vacancy.companyAddress}</div>}
            </div>
          )}
        </div>
      )}
    </>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { TagRow } from './Tag'
import { pluralRu } from '../lib/plural'
import type { Vacancy } from '../types'

const money = new Intl.NumberFormat('ru-RU')

function formatSalary(vacancy: Vacancy) {
  if (!vacancy.salaryFrom && !vacancy.salaryTo) return 'По договоренности'
  return [
    vacancy.salaryFrom ? `от ${money.format(vacancy.salaryFrom)} ₽` : null,
    vacancy.salaryTo ? `до ${money.format(vacancy.salaryTo)} ₽` : null,
  ].filter(Boolean).join(' ')
}

/**
 * Реальные (не демо) просмотры/отклики — +1 к просмотрам при каждом
 * открытии страницы. Хранит slug вместе с результатом и сверяет его с
 * текущим при рендере — если пользователь успел переключиться на другую
 * вакансию (вкладка «Соискателям», без перезагрузки страницы), старые
 * цифры не покажутся даже на миг, без лишнего setState в начале эффекта.
 */
function useVacancyStats(slug: string) {
  const [state, setState] = useState<{ slug: string; views: number; applications: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/vacancy/${slug}/view`, { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setState({ slug, views: data.views, applications: data.applications })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  return state && state.slug === slug ? state : null
}

/**
 * Основной контент детальной карточки вакансии — общий для отдельной
 * страницы (/vacancies/:slug, VacancyDetail.tsx) и вкладки «Вакансии»
 * внутри «Кадры → Соискателям» (Candidates.tsx), чтобы структура не
 * расходилась между двумя местами, где вакансия показывается подробно.
 * Блок контактов сюда не входит — см. VacancyContactsBlock, он выводится
 * отдельно, под формой отклика (см. обе страницы-обёртки).
 * extra — точка вставки специфичного для страницы контента.
 */
export default function VacancyDetailBody({ vacancy, extra }: { vacancy: Vacancy; extra?: ReactNode }) {
  const stats = useVacancyStats(vacancy.slug)
  const publishedDate = new Date(vacancy.publishedAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

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

      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-3xl font-semibold">{vacancy.title}</h1>
        <div className="whitespace-nowrap text-lg font-medium text-ink">{formatSalary(vacancy)}</div>
      </div>

      <div className="mt-2 text-ink/60">{vacancy.anonymous ? 'Компания скрыта' : vacancy.company} · {vacancy.city}</div>
      <div className="mt-1 text-sm text-ink/40">Опубликовано {publishedDate}</div>
      {extra}
      {stats && (
        <div className="mt-1 text-sm font-semibold text-gold">
          {stats.views} {pluralRu(stats.views, ['просмотр', 'просмотра', 'просмотров'])} ·{' '}
          {stats.applications} {pluralRu(stats.applications, ['отклик', 'отклика', 'откликов'])}
        </div>
      )}

      <div className="mt-3">
        <TagRow specialization={vacancy.specialization} industry={vacancy.industry} />
      </div>

      {vacancy.aboutCompany ? (
        <div className="mt-6 rounded-xl bg-ink/[0.04] p-5">
          <h2 className="font-semibold">О компании</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">{vacancy.aboutCompany}</p>
        </div>
      ) : (
        // Без отдельного блока "О компании" описание вакансии выполняет роль
        // вводного абзаца; когда aboutCompany задан, он уже вводит контекст,
        // и повторять то же самое отдельным абзацем не нужно.
        <p className="mt-6 leading-relaxed text-ink/80">{vacancy.description}</p>
      )}

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

      {vacancy.officeCoords && (
        <div className="mt-8">
          <h2 className="font-semibold">Офис на карте</h2>
          {vacancy.companyAddress && <p className="mt-1 text-sm text-ink/60">{vacancy.companyAddress}</p>}
          <div className="mt-3 overflow-hidden rounded-xl border border-ink/10">
            <iframe
              title="Офис на карте"
              src={`https://yandex.ru/map-widget/v1/?ll=${vacancy.officeCoords.lng}%2C${vacancy.officeCoords.lat}&z=16&pt=${vacancy.officeCoords.lng},${vacancy.officeCoords.lat},pm2rdm`}
              width="100%"
              height="360"
              loading="lazy"
              style={{ border: 0 }}
            />
          </div>
        </div>
      )}
    </>
  )
}

/** Контакты по вакансии — выводится отдельно от основного блока, под формой отклика. */
export function VacancyContactsBlock({ vacancy }: { vacancy: Vacancy }) {
  const hasContacts = vacancy.contactPhone || vacancy.contactEmail
  const hasFooter = vacancy.companyWebsite || vacancy.companyAddress
  if (!hasContacts && !hasFooter) return null

  return (
    <div className="rounded-xl border border-ink/10 p-5 text-sm">
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
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { SpecTag, IndustryTag } from './Tag'
import { pluralRu } from '../lib/plural'
import { getUtm } from '../lib/utm'
import { salaryLabel } from '../lib/vacancySalary'
import { WORK_FORMATS, WORK_SCHEDULES, EMPLOYMENT_TYPES, type Vacancy } from '../types'

/** @ник → ссылка на Telegram, адрес почты → mailto, телефон → tel: — в шагах «Как откликнуться». */
const LINKABLE = /(@[A-Za-z0-9_]{4,32}|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\+\d[\d\s()-]{9,})/g
function linkify(text: string): ReactNode[] {
  return text.split(LINKABLE).map((part, i) => {
    if (i % 2 === 0) return part
    const href = part.startsWith('@') ? `https://t.me/${part.slice(1)}` : part.startsWith('+') ? `tel:${part.replace(/[^\d+]/g, '')}` : `mailto:${part}`
    return <a key={i} href={href} className="underline hover:text-ink" {...(href.startsWith('https') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{part.trim()}</a>
  })
}

/**
 * Обязательный набор пунктов «Условия» — формируется из полей вакансии, а
 * не вводится вручную по каждой вакансии отдельно, чтобы ни один пункт не
 * потерялся при заполнении новой реальной вакансии. vacancy.conditions —
 * доп. пункты сверх этого набора (например, «Опцион», «Оплата обучения»).
 */
function buildConditions(vacancy: Vacancy): { label: string; value: string }[] {
  const formatLabel = WORK_FORMATS.find((f) => f.id === vacancy.format)?.label ?? vacancy.format
  const scheduleLabel = WORK_SCHEDULES.find((s) => s.id === vacancy.schedule)?.label ?? vacancy.schedule
  const employmentLabel = EMPLOYMENT_TYPES.find((e) => e.id === vacancy.employment)?.label ?? vacancy.employment

  return [
    { label: 'Адрес', value: vacancy.companyAddress || vacancy.city },
    { label: 'Формат работы', value: formatLabel },
    { label: 'График работы', value: scheduleLabel },
    { label: 'Занятость', value: employmentLabel },
    vacancy.employmentArrangement ? { label: 'Оформление', value: vacancy.employmentArrangement } : null,
    salaryLabel(vacancy) ? { label: 'Заработная плата', value: salaryLabel(vacancy) as string } : null,
    vacancy.bonuses ? { label: 'Бонусы', value: vacancy.bonuses } : null,
  ].filter((c): c is { label: string; value: string } => Boolean(c))
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
    fetch(`/api/vacancy/${slug}/view`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utm: getUtm() }) })
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
 * отдельно, под формой отклика (см. обе страницы-обертки).
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
        {salaryLabel(vacancy) && <div className="whitespace-nowrap text-lg font-medium text-ink">{salaryLabel(vacancy)}</div>}
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

      {/* Специализация + направления деятельности — один ряд тегов, без
          повтора: если заданы practiceAreas (более конкретные, чем общая
          отрасль), показываем их вместо тега отрасли, а не вместе с ним —
          иначе "Корпоративное право / M&A" дублировалось бы соседними
          тегами "Корпоративное право" и "M&A". */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {vacancy.specialization.map((s) => <SpecTag key={s} id={s} />)}
        {vacancy.practiceAreas && vacancy.practiceAreas.length > 0
          ? vacancy.practiceAreas.map((p) => (
              <span key={p} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink/70">{p}</span>
            ))
          : vacancy.industry.map((i) => <IndustryTag key={i} id={i} />)}
      </div>

      {vacancy.aboutCompany ? (
        <div className="mt-6 rounded-xl bg-ink/[0.04] p-5">
          <h2 className="font-semibold">О работодателе</h2>
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
            <h2 className="font-semibold">Задачи на позиции</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-ink/70">
              {vacancy.responsibilities.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">Требования</h2>
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
          {buildConditions(vacancy).map((c) => (
            <li key={c.label}><span className="font-semibold text-ink">{c.label}:</span> {c.value}</li>
          ))}
          {vacancy.conditions.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>

      {vacancy.howToApply && vacancy.howToApply.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold">Как откликнуться</h2>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-ink/70">
            {vacancy.howToApply.map((step) => <li key={step}>{linkify(step)}</li>)}
          </ol>
        </div>
      )}

      {vacancy.officeCoords && (
        <div className="mt-8">
          <h2 className="font-semibold">Адрес</h2>
          {vacancy.companyAddress && <p className="mt-1 text-sm text-ink/60">{vacancy.companyAddress}</p>}
          <div className="mt-3 overflow-hidden rounded-xl border border-ink/10">
            <iframe
              title="Адрес на карте"
              src={`https://yandex.ru/map-widget/v1/?ll=${vacancy.officeCoords.lng}%2C${vacancy.officeCoords.lat}&z=14&pt=${vacancy.officeCoords.lng},${vacancy.officeCoords.lat},pm2rdm`}
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

/**
 * Контакты по вакансии — выводится отдельно от основного блока, под формой
 * отклика. Адрес сюда намеренно не входит — он уже есть в блоке "Адрес" с
 * картой в основном контенте, повторять его здесь не нужно.
 */
export function VacancyContactsBlock({ vacancy }: { vacancy: Vacancy }) {
  if (!vacancy.contactPhone && !vacancy.contactEmail && !vacancy.contactTelegram) return null

  return (
    <div className="rounded-xl border border-ink/10 p-5 text-sm">
      <div className="font-semibold">Контакты по вакансии</div>
      <div className="mt-2 space-y-1 text-ink/70">
        {vacancy.contactPhone && <div><span className="font-semibold text-ink">Телефон:</span> {vacancy.contactPhone}</div>}
        {vacancy.contactEmail && <div><span className="font-semibold text-ink">Почта:</span> {vacancy.contactEmail}</div>}
        {vacancy.contactTelegram && (
          <div>
            <span className="font-semibold text-ink">Telegram:</span>{' '}
            <a href={`https://t.me/${vacancy.contactTelegram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">{vacancy.contactTelegram}</a>
          </div>
        )}
      </div>
    </div>
  )
}

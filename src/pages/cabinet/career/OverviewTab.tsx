import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { pluralRu } from '../../../lib/plural'
import type { CareerState } from '../../../lib/careerCabinet'
import { icon } from '../sections'
import { Chip, Progress } from '../kit'
import { btnAccent, focusRing } from '../kitStyles'

// Обзор: три уровня. 1 — что делать дальше (тёмный блок «карьерный план» и жёлтая плитка «подготовка к интервью»);
// 2 — остальные инструменты цветными плитками; 3 — тихая строка: подкаст и то, что ещё в разработке.

type Tone = 'ink' | 'amber' | 'soft' | 'white'

const TONE: Record<Tone, { box: string; bubble: string; muted: string }> = {
  ink: { box: 'bg-ink text-white', bubble: 'bg-amber-300 text-ink', muted: 'text-white/65' },
  amber: { box: 'bg-amber-300 text-ink', bubble: 'bg-ink text-white', muted: 'text-ink/65' },
  soft: { box: 'bg-gold-light/30 text-ink', bubble: 'bg-ink text-white', muted: 'text-ink/65' },
  white: { box: 'bg-white text-ink shadow-[0_1px_2px_rgba(40,57,83,0.06)]', bubble: 'bg-ink/[0.07] text-ink', muted: 'text-ink/55' },
}

function Tile({ to, tone, ic, title, children, foot, className = '' }: { to: string; tone: Tone; ic: ReactNode; title: string; children?: ReactNode; foot?: ReactNode; className?: string }) {
  const t = TONE[tone]
  return (
    <Link to={to} className={`group flex min-w-0 flex-col gap-2 rounded-2xl p-3.5 transition-transform hover:-translate-y-0.5 ${t.box} ${focusRing} ${className}`}>
      <span className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl [&>svg]:h-[1.125rem] [&>svg]:w-[1.125rem] ${t.bubble}`}>{ic}</span>
        <span className="min-w-0 flex-1 text-sm font-bold leading-snug">{title}</span>
        <span className={`shrink-0 text-lg leading-none transition-transform group-hover:translate-x-0.5 ${t.muted}`} aria-hidden="true">→</span>
      </span>
      {children && <span className={`block text-xs leading-relaxed ${t.muted}`}>{children}</span>}
      {foot && <span className="mt-auto block pt-0.5">{foot}</span>}
    </Link>
  )
}

export default function OverviewTab({ state }: { state: CareerState }) {
  const { plan, interview, achievements, capital, recommendations, templates, podcast } = state
  const done = plan?.steps.filter((s) => s.done).length ?? 0
  const total = plan?.steps.length ?? 0
  const next = plan?.steps.find((s) => !s.done)
  const fields = capital.schema.sections.reduce((n, s) => n + s.fields.length, 0)
  const filled = Object.keys(capital.values).length
  const stage = (id: string) => state.meta.stages.find((s) => s.id === id)?.label ?? id

  return (
    <div className="space-y-2">
      {/* Уровень 1 */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Link to="/cabinet/route" className={`group relative flex min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-2xl bg-ink p-4 text-white transition-transform hover:-translate-y-0.5 sm:p-5 ${focusRing}`}>
          <span className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.06]" aria-hidden="true" />
          <span className="relative flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/60">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-ink [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.route}</span>
            Карьерный план
          </span>
          {plan ? (
            <span className="relative block">
              <span className="flex items-end gap-3">
                <span className="text-4xl font-semibold leading-none tabular-nums sm:text-5xl">{done}<span className="text-xl text-white/45 sm:text-2xl"> / {total}</span></span>
                <span className="pb-1 text-xs text-white/65">{pluralRu(done, ['шаг выполнен', 'шага выполнено', 'шагов выполнено'])}<br />{stage(plan.from)} → {stage(plan.to)}</span>
              </span>
              <span className="mt-3 block"><Progress value={done} max={total} tone="amber" label="Выполнено шагов плана" /></span>
              <span className="mt-3 block text-[13px] text-white/80">
                {next ? <>Следующий шаг: <span className="font-semibold text-white">{next.title}</span></> : 'Все шаги выполнены: можно обновить цель.'}
              </span>
            </span>
          ) : (
            <span className="relative block">
              <span className="block text-xl font-semibold leading-snug sm:text-2xl">Составьте карьерный план</span>
              <span className="mt-1.5 block max-w-md text-[13px] text-white/70">Четыре вопроса: где вы сейчас, куда хотите прийти, в какой практике и за какое время. Получите шаги с отметками о выполнении.</span>
            </span>
          )}
          <span className="relative"><span className={btnAccent}>{plan ? 'Продолжить' : 'Составить план'}</span></span>
        </Link>

        <Link to="/cabinet/interview-prep" className={`group relative flex min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-2xl bg-amber-300 p-4 text-ink transition-transform hover:-translate-y-0.5 sm:p-5 ${focusRing}`}>
          <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink/65">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.mic}</span>
            Подготовка к интервью
          </span>
          {interview.total > 0 ? (
            <span className="block">
              <span className="text-4xl font-semibold leading-none tabular-nums sm:text-5xl">{interview.done}<span className="text-xl text-ink/45 sm:text-2xl"> / {interview.total}</span></span>
              <span className="mt-1.5 block text-xs text-ink/70">{pluralRu(interview.done, ['вопрос разобран', 'вопроса разобрано', 'вопросов разобрано'])}</span>
              <span className="mt-3 block"><Progress value={interview.done} max={interview.total} label="Разобрано вопросов" /></span>
            </span>
          ) : (
            <span className="block text-sm font-semibold">Банк вопросов скоро появится</span>
          )}
          <span className="inline-flex w-fit items-center justify-center rounded-full bg-ink px-4 py-1.5 text-[13px] font-bold text-white">{interview.done > 0 ? 'Продолжить' : 'Тренироваться'}</span>
        </Link>
      </div>

      {/* Уровень 2 */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Tile to="/cabinet/templates" tone="soft" ic={icon.book} title="Шаблоны" foot={<Chip>{templates > 0 ? `${templates} ${pluralRu(templates, ['шаблон', 'шаблона', 'шаблонов'])}` : 'скоро'}</Chip>}>
          Резюме и письма в готовом оформлении: скачайте и подставьте свои данные.
        </Tile>
        <Tile
          to="/cabinet/recommendations"
          tone="white"
          ic={icon.star}
          title="Рекомендация"
          foot={recommendations.ready > 0 ? <Chip tone="amber">готово: {recommendations.ready}</Chip> : recommendations.active > 0 ? <Chip>в работе: {recommendations.active}</Chip> : <Chip tone="soft">запросить</Chip>}
        >
          Рекомендация от «Карьерного юриста»: приложите к отклику на вакансию.
        </Tile>
        <Tile
          to="/cabinet/portfolio"
          tone="white"
          ic={icon.folder}
          title="Портфолио"
          className="sm:col-span-2 lg:col-span-1"
          foot={<span className="flex flex-wrap gap-1.5"><Chip tone="soft">{achievements.length} {pluralRu(achievements.length, ['достижение', 'достижения', 'достижений'])}</Chip><Chip tone="soft">капитал: {filled} из {fields}</Chip></span>}
        >
          Достижения, профессиональный капитал и медиакит: одна страница о вас.
        </Tile>
      </div>

      {/* Уровень 3 */}
      <div className="flex flex-wrap items-center gap-2 px-1 pt-1 text-xs">
        <Link to="/cabinet/podcast" className={`inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-ink/80 transition-colors hover:text-ink ${focusRing}`}>
          <span className="text-ink/55 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.headphones}</span>
          Подкаст: {podcast ? 'заявка отправлена' : 'стать гостем'}
        </Link>
        {['Оценка рынка', 'Фото для CV'].map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink/20 px-3 py-1.5 font-medium text-ink/45">{t} · скоро</span>
        ))}
      </div>
    </div>
  )
}

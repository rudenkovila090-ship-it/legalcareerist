import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { type CabinetUser, type DashboardData, type ResidentInfo } from '../../lib/cabinet'
import { news } from '../../data/news'
import { pluralRu } from '../../lib/plural'
import { allGroups, icon, sections, sectionsOfGroup } from './sections'
import { CardHead, Chip, IconBubble } from './ui'
import { longDate } from './shared'

type Tone = 'good' | 'warn' | 'muted'

/** Подписка для плиток и статусов: заголовок, пояснение и цвет. */
function subscription(r: ResidentInfo): { title: string; sub: string; tone: Tone } {
  if (r.status === 'lifetime') return { title: 'Бессрочно', sub: 'Резидент сообщества', tone: 'good' }
  if (r.status === 'active') {
    const left = r.daysLeft ?? 0
    const base = `до ${longDate(r.until)}${left > 0 ? `, ${left} ${pluralRu(left, ['день', 'дня', 'дней'])}` : ''}`
    return { title: 'Резидент', sub: r.cancelled || r.autoRenew === false ? `${base}, без автопродления` : base, tone: 'good' }
  }
  if (r.status === 'ended') return { title: 'Закончилась', sub: `с ${longDate(r.until)}`, tone: 'warn' }
  return { title: 'Нет подписки', sub: 'Вступить в сообщество', tone: 'muted' }
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

/** Главная кабинета: четыре основных раздела, новости и полный перечень разделов. */
export default function Dashboard({ user, dash }: { user: CabinetUser; dash: DashboardData | null }) {
  const sub = subscription(user.resident)
  const unread = dash?.support.unread ?? 0

  return (
    <div className="space-y-6">
      {/* Плитки: компактные и яркие, каждая своим цветом, чтобы обзор не сливался в одну массу */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile to="/cabinet/resident" icon={icon.shield} label="Подписка" value={sub.title} note={sub.sub} variant="ink" />
        <Tile to="/cabinet/events" icon={icon.ticket} label="Мероприятия" value={dash ? String(dash.counts.events) : '—'} note={dash ? pluralRu(dash.counts.events, ['регистрация', 'регистрации', 'регистраций']) : ' '} variant="gold" />
        <Tile to="/cabinet/cv" icon={icon.folder} label="Документы" value={dash ? String(dash.counts.documents) : '—'} note="резюме и письма" variant="light" />
        <Tile to="/cabinet/support" icon={icon.lifebuoy} label="Поддержка" value={unread > 0 ? `${unread} ${pluralRu(unread, ['ответ', 'ответа', 'ответов'])}` : 'Написать'} note={unread > 0 ? 'ждет вас в чате' : 'ответим в чате'} variant={unread > 0 ? 'alert' : 'outline'} />
      </div>

      {/* Новости: что происходит в сообществе и в «Карьерном юристе» (берутся из src/data/news.ts) */}
      <section aria-label="Новости">
        <CardHead title="Новости сообщества" to="/news" linkText="Все новости" />
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
          {news.slice(0, 3).map((n) => {
            const cover = n.image ?? n.images?.[0]
            return (
              <Link key={n.slug} to={`/news/${n.slug}`} className={`glass flex min-w-0 gap-3 rounded-2xl p-3 ${focusRing}`}>
                {cover && <img src={cover} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink/50">
                    <span className="rounded-full bg-gold-light/30 px-2 py-0.5 font-semibold text-ink">{n.tag}</span>
                    <span>{n.date}</span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm font-semibold leading-snug">{n.title}</span>
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Все разделы: свёрнуто, чтобы обзор не превращался в длинный список (полный перечень есть в меню) */}
      <details className="group" aria-label="Все разделы">
        <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white/60 px-5 py-4 text-sm font-semibold hover:border-ink/25 ${focusRing}`}>
          <span>Все разделы кабинета <span className="font-normal text-ink/50">({sections.length})</span></span>
          <span className="text-lg leading-none text-ink/40 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        </summary>
        <div className="mt-4 space-y-6">
          {allGroups.map((g) => (
            <div key={g.id}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/40">{g.title}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {sectionsOfGroup(g.id).map((s) => (
                  <Link key={s.id} to={`/cabinet/${s.id}`} className={`glass flex min-w-0 items-center gap-3 rounded-xl p-4 ${focusRing}`}>
                    <IconBubble>{s.icon}</IconBubble>
                    <span className="min-w-0 flex-1 font-semibold leading-snug">{s.title}</span>
                    {s.ready ? <Chip tone="good">Доступно</Chip> : <Chip tone="warn">В разработке</Chip>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-ink/40">Разделы со значком «В разработке» мы подключаем по очереди.</p>
        </div>
      </details>
    </div>
  )
}

const TILE_VARIANTS = {
  ink: { box: 'bg-ink text-white shadow-ink/30', bubble: 'bg-white/15 text-white', note: 'text-white/70' },
  gold: { box: 'bg-gold text-white shadow-gold/30', bubble: 'bg-white/20 text-white', note: 'text-white/80' },
  light: { box: 'bg-gold-light text-ink shadow-gold-light/40', bubble: 'bg-ink/15 text-ink', note: 'text-ink/75' },
  outline: { box: 'border-2 border-ink bg-white text-ink shadow-ink/10', bubble: 'bg-ink text-white', note: 'text-ink/60' },
  alert: { box: 'bg-amber-400 text-ink shadow-amber-400/40', bubble: 'bg-ink text-white', note: 'text-ink/75' },
}

function Tile({ to, icon: ic, label, value, note, variant }: { to: string; icon: ReactNode; label: string; value: string; note: string; variant: keyof typeof TILE_VARIANTS }) {
  const v = TILE_VARIANTS[variant]
  return (
    <Link to={to} className={`flex min-w-0 flex-col gap-1 rounded-2xl p-3 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg ${v.box} ${focusRing}`}>
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full [&>svg]:h-3.5 [&>svg]:w-3.5 ${v.bubble}`}>{ic}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="truncate text-base font-bold leading-tight sm:text-lg">{value}</div>
      <div className={`min-h-4 truncate text-[11px] leading-4 ${v.note}`}>{note}</div>
    </Link>
  )
}

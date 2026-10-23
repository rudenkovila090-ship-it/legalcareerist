import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { isResidentAccount, type CabinetEvent, type CabinetUser, type DashboardData, type ResidentInfo } from '../../lib/cabinet'
import { pluralRu } from '../../lib/plural'
import { allGroups, icon, sections, sectionsOfGroup } from './sections'
import { Avatar, CardHead, Chip, IconBubble } from './ui'
import { longDate, relativeTime, roleOf } from './shared'
import { activityIcon, activityLabel } from './activityInfo'
import { FAQ } from './faq'

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

const arrow = <span className="h-4 w-4 shrink-0 text-ink/30 [&>svg]:h-4 [&>svg]:w-4">{icon.arrow}</span>
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'

/** Обзор кабинета: профиль, плитки, статусы, данные, история, действия, быстрые шаги и помощь. */
export default function Dashboard({ user, dash }: { user: CabinetUser; dash: DashboardData | null }) {
  const sub = subscription(user.resident)
  const role = roleOf(user)
  const resident = isResidentAccount(user)
  const percent = dash?.completeness.percent ?? null
  const unread = dash?.support.unread ?? 0

  return (
    <div className="space-y-6">
      {/* Профиль */}
      <section className="glass rounded-2xl p-6 sm:p-8" aria-label="Профиль">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={user.contact.name || user.name} email={user.contact.email} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="truncate text-2xl font-semibold tracking-tight">{user.contact.name || user.name}</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${role.tone === 'gold' ? 'bg-gold-light/30 text-ink' : role.tone === 'ink' ? 'bg-ink text-white' : 'bg-ink/[0.06] text-ink/70'}`}>{role.label}</span>
            </div>
            {user.contact.email && <p className="mt-1 truncate text-sm text-ink/60">{user.contact.email}</p>}
            <p className="mt-2 text-sm text-ink/70">
              {[
                sub.title === 'Нет подписки' ? 'Подписки на сообщество нет' : `Подписка: ${sub.title.toLowerCase()}, ${sub.sub}`,
                user.memberSince ? `в кабинете с ${new Date(user.memberSince).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Link to="/cabinet/profile" className={`self-start rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink/70 hover:text-ink sm:self-center ${focusRing}`}>
            Редактировать
          </Link>
        </div>

        {percent !== null && (
          <div className="mt-6 border-t border-ink/10 pt-5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">Профиль заполнен на {percent}%</span>
              {percent === 100 && <Chip tone="good">Всё готово</Chip>}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Заполненность профиля">
              <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
            {dash && dash.completeness.missing.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {dash.completeness.missing.slice(0, 3).map((m) => (
                  <Link key={m.key} to={m.to} className={`rounded-full bg-ink/[0.06] px-3 py-1.5 text-xs font-medium text-ink/70 hover:bg-ink/10 hover:text-ink ${focusRing}`}>
                    {m.label} →
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Плитки: компактные и яркие, каждая своим цветом, чтобы обзор не сливался в одну массу */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile to="/cabinet/resident" icon={icon.shield} label="Подписка" value={sub.title} note={sub.sub} variant="ink" />
        <Tile to="/cabinet/events" icon={icon.ticket} label="Мероприятия" value={dash ? String(dash.counts.events) : '—'} note={dash ? pluralRu(dash.counts.events, ['регистрация', 'регистрации', 'регистраций']) : ' '} variant="gold" />
        <Tile to="/cabinet/cv" icon={icon.folder} label="Документы" value={dash ? String(dash.counts.documents) : '—'} note="резюме и письма" variant="light" />
        <Tile to="/cabinet/support" icon={icon.lifebuoy} label="Поддержка" value={unread > 0 ? `${unread} ${pluralRu(unread, ['ответ', 'ответа', 'ответов'])}` : 'Написать'} note={unread > 0 ? 'ждёт вас в чате' : 'ответим в чате'} variant={unread > 0 ? 'alert' : 'outline'} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Статусы: только то, что можно изменить, у каждого — кнопка «Изменить» */}
        <section className="glass min-w-0 rounded-2xl p-6" aria-label="Статусы">
          <CardHead title="Статусы" />
          <ul className="space-y-1">
            <StatusRow to="/cabinet/resident" icon={icon.shield} label="Подписка" value={sub.title} tone={sub.tone} hint={sub.sub} />
            <StatusRow to="/cabinet/telegram" icon={icon.telegram} label="Telegram" value={user.telegram.linked ? 'Привязан' : 'Не привязан'} tone={user.telegram.linked ? 'good' : 'warn'} hint={user.telegram.linked ? user.telegram.name : 'привяжите по коду из бота'} action={user.telegram.linked || !user.telegram.canLink ? 'Изменить' : 'Привязать'} />
            <StatusRow to="/cabinet/privacy" icon={icon.lock} label="Скрытый поиск" value={user.privacy.hidden ? 'Включён' : 'Выключен'} tone={user.privacy.hidden ? 'good' : 'muted'} />
            <StatusRow to="/cabinet/consents" icon={icon.bell} label="Рассылки" value={user.consents.marketing === true ? 'Включены' : user.consents.marketing === false ? 'Выключены' : 'Не выбрано'} tone={user.consents.marketing === true ? 'good' : 'muted'} />
          </ul>
        </section>

        {/* Личные данные и контакты */}
        <section className="glass min-w-0 rounded-2xl p-6" aria-label="Личные данные и контакты">
          <CardHead title="Личные данные и контакты" to="/cabinet/profile" linkText="Изменить" />
          <dl className="space-y-4">
            <DataRow icon={icon.user} label="Имя" value={user.contact.name || user.name} />
            <DataRow icon={icon.mail} label="Почта" value={user.contact.email || '—'} />
            <DataRow icon={icon.phone} label="Телефон" value={user.contact.phone} empty={resident ? 'Не указан' : '—'} action={resident && !user.contact.phone ? { to: '/cabinet/profile', text: 'Добавить' } : undefined} />
            <DataRow icon={icon.telegram} label="Telegram" value={user.telegram.linked ? user.telegram.name || 'Привязан' : ''} empty="Не привязан" action={!user.telegram.linked && user.telegram.canLink ? { to: '/cabinet/telegram', text: 'Привязать' } : undefined} />
          </dl>
        </section>

        {/* История */}
        <section className="glass min-w-0 rounded-2xl p-6" aria-label="История">
          <CardHead title="История" to="/cabinet/events" linkText="Все мероприятия" />
          {dash && dash.recentEvents.length > 0 ? (
            <ul className="space-y-3">
              {dash.recentEvents.map((e, i) => <EventRow key={`${e.slug ?? e.title}-${i}`} event={e} />)}
            </ul>
          ) : (
            <Empty icon={icon.calendar} text={dash ? 'Пока нет регистраций на мероприятия.' : 'Загружаем…'} action={dash ? { href: '/events', text: 'Посмотреть мероприятия' } : undefined} />
          )}
        </section>

        {/* Последние действия */}
        <section className="glass min-w-0 rounded-2xl p-6" aria-label="Последние действия">
          <CardHead title="Последние действия" to="/cabinet/activity" linkText="Весь журнал" />
          {dash && dash.activity.length > 0 ? (
            <ul className="space-y-3">
              {dash.activity.map((a) => (
                <li key={`${a.at}-${a.kind}`} className="flex items-center gap-3">
                  <IconBubble tone="soft">{activityIcon(a.kind)}</IconBubble>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{activityLabel(a)}</div>
                    <div className="text-xs text-ink/50">{relativeTime(a.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={icon.history} text={dash ? 'Действий пока нет.' : 'Загружаем…'} />
          )}
        </section>
      </div>

      {/* Быстрые действия */}
      <section aria-label="Быстрые действия">
        <h2 className="mb-3 text-base font-semibold">Быстрые действия</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Quick to="/cabinet/cv" icon={icon.doc} title="Загрузить резюме" note="Основное резюме для работодателей" />
          {!user.telegram.linked && user.telegram.canLink ? (
            <Quick to="/cabinet/telegram" icon={icon.telegram} title="Привязать Telegram" note="Подписка и билеты подтянутся" />
          ) : (
            <Quick to="/cabinet/settings" icon={icon.sliders} title="Настройки" note="Уведомления и конфиденциальность" />
          )}
          <Quick to="/cabinet/password" icon={icon.lock} title="Сменить пароль" note="И посмотреть, как вы входите" />
          <Quick to="/cabinet/mydata" icon={icon.download} title="Скачать мои данные" note="Всё, что мы о вас храним" />
          <Quick to="/cabinet/support" icon={icon.lifebuoy} title="Написать в поддержку" note="Ответим в чате и на почту" />
          <Quick to="/cabinet/help" icon={icon.help} title="Помощь и FAQ" note="Ответы на частые вопросы" />
        </div>
      </section>

      {/* Помощь */}
      <section className="glass rounded-2xl p-6" aria-label="Помощь">
        <CardHead title="Частые вопросы" to="/cabinet/help" linkText="Все вопросы" />
        <div className="divide-y divide-ink/10">
          {FAQ.filter((f) => ['login', 'ticket', 'missing'].includes(f.id)).map((f) => (
            <details key={f.id} className="group py-3">
              <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded text-sm font-medium ${focusRing}`}>
                {f.q}
                <span className="text-ink/40 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
              </summary>
              <div className="mt-2 text-sm leading-relaxed text-ink/70">{f.a}</div>
            </details>
          ))}
        </div>
        <Link to="/cabinet/support" className={`mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 ${focusRing}`}>
          Открыть чат поддержки
        </Link>
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

function StatusRow({ to, icon: ic, label, value, tone, hint, action = 'Изменить' }: { to: string; icon: ReactNode; label: string; value: string; tone: Tone; hint?: string; action?: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl py-2.5">
      <IconBubble tone="soft">{ic}</IconBubble>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{label}</span>
          <Chip tone={tone}>{value}</Chip>
        </div>
        {hint && <div className="mt-0.5 truncate text-xs text-ink/50">{hint}</div>}
      </div>
      <Link to={to} className={`shrink-0 rounded-full border border-ink/15 px-3.5 py-1.5 text-xs font-semibold text-ink/70 hover:border-ink/30 hover:text-ink ${focusRing}`}>{action}</Link>
    </li>
  )
}

function DataRow({ icon: ic, label, value, empty = '—', action }: { icon: ReactNode; label: string; value: string; empty?: string; action?: { to: string; text: string } }) {
  return (
    <div className="flex items-center gap-3">
      <IconBubble tone="soft">{ic}</IconBubble>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-ink/50">{label}</dt>
        <dd className={`truncate text-sm font-medium ${value ? '' : 'text-ink/40'}`}>{value || empty}</dd>
      </div>
      {action && <Link to={action.to} className={`shrink-0 rounded text-sm font-medium text-gold hover:text-ink ${focusRing}`}>{action.text}</Link>}
    </div>
  )
}

function EventRow({ event }: { event: CabinetEvent }) {
  const tone: Tone = event.attended || event.status === 'Оплачен' ? 'good' : event.status === 'Отменено' ? 'warn' : 'muted'
  return (
    <li className="flex items-center gap-3">
      <IconBubble tone="soft">{icon.calendar}</IconBubble>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{event.title}</div>
        <div className="text-xs text-ink/50">{longDate(event.date)}</div>
      </div>
      <Chip tone={tone}>{event.status}</Chip>
    </li>
  )
}

function Empty({ icon: ic, text, action }: { icon: ReactNode; text: string; action?: { href: string; text: string } }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-ink/[0.03] px-4 py-8 text-center">
      <IconBubble tone="soft">{ic}</IconBubble>
      <p className="text-sm text-ink/60">{text}</p>
      {action && <Link to={action.href} className={`rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:text-ink ${focusRing}`}>{action.text}</Link>}
    </div>
  )
}

function Quick({ to, icon: ic, title, note }: { to: string; icon: ReactNode; title: string; note: string }) {
  return (
    <Link to={to} className={`glass flex min-w-0 items-center gap-3 rounded-2xl p-4 ${focusRing}`}>
      <IconBubble>{ic}</IconBubble>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="truncate text-xs text-ink/50">{note}</div>
      </div>
      {arrow}
    </Link>
  )
}

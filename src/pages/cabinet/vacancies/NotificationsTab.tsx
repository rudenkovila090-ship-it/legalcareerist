import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchNotifications, markNotificationsRead, setNotificationTelegram, type CabinetNotification } from '../../../lib/vacanciesCabinet'
import { icon } from '../sections'
import { dayTitle, relativeTime } from '../shared'
import { Switch } from '../ui'
import { BlockHead, EmptyNote, Surface } from '../kit'
import { accent, btnGhost, focusRing } from '../kitStyles'

// Уведомления: лента в кабинете (ответ рекрутера, смена статуса отклика, ответ поддержки, кадровый резерв) и копия в
// Telegram-боте, если он привязан. Непрочитанные подсвечены жёлтой точкой; нажатие отмечает прочитанным и ведёт в нужный раздел.

const KIND_ICON: Record<CabinetNotification['kind'], ReactNode> = {
  chat_reply: icon.chat,
  application_status: icon.list,
  support_reply: icon.lifebuoy,
  reserve: icon.box,
}

export default function NotificationsTab({ onRead }: { onRead: () => void }) {
  const navigate = useNavigate()
  const [items, setItems] = useState<CabinetNotification[] | null>(null)
  const [telegram, setTelegram] = useState(true)
  const [linked, setLinked] = useState(false)
  const [failed, setFailed] = useState(false)
  const [savingTg, setSavingTg] = useState(false)

  useEffect(() => {
    let live = true
    fetchNotifications().then((r) => {
      if (!live) return
      if (r.ok) {
        setItems(r.data.items)
        setTelegram(r.data.settings.telegram)
        setLinked(r.data.telegramLinked)
      } else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [])

  const unread = items?.filter((n) => !n.readAt).length ?? 0
  const groups = useMemo(() => {
    const out: { title: string; items: CabinetNotification[] }[] = []
    for (const n of items ?? []) {
      const title = dayTitle(n.at)
      const last = out[out.length - 1]
      if (last && last.title === title) last.items.push(n)
      else out.push({ title, items: [n] })
    }
    return out
  }, [items])

  async function readAll() {
    const r = await markNotificationsRead()
    if (r.ok) {
      setItems((prev) => prev?.map((n) => (n.readAt ? n : { ...n, readAt: Date.now() })) ?? prev)
      onRead()
    }
  }

  async function open(n: CabinetNotification) {
    if (!n.readAt) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: Date.now() } : x)) ?? prev)
      await markNotificationsRead([n.id])
      onRead()
    }
    navigate(n.link)
  }

  async function toggleTelegram(value: boolean) {
    setSavingTg(true)
    setTelegram(value)
    const r = await setNotificationTelegram(value)
    setSavingTg(false)
    if (r.ok) setTelegram(r.data.settings.telegram)
    else setTelegram(!value)
  }

  if (failed) return <Surface><p className="text-sm text-ink/60">Не получилось загрузить уведомления. Обновите страницу через минуту.</p></Surface>
  if (!items) return <Surface><p className="text-sm text-ink/50">Загружаем уведомления…</p></Surface>

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* Уровень 2: лента */}
      <section aria-label="Лента уведомлений">
        <BlockHead
          title="Лента"
          note={unread > 0 ? `${unread} непрочитанных` : 'Всё прочитано'}
          aside={unread > 0 ? <button type="button" onClick={() => void readAll()} className={btnGhost}>Отметить все прочитанными</button> : undefined}
        />
        {items.length === 0 ? (
          <EmptyNote icon={icon.bell} title="Пока уведомлений нет">
            Здесь появятся ответы рекрутера, смена статуса ваших откликов, ответы поддержки и новости по кадровому резерву.
          </EmptyNote>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.title}>
                <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink/40">{g.title}</div>
                <ul className="space-y-1.5">
                  {g.items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => void open(n)}
                        className={`flex w-full items-start gap-3 rounded-2xl p-3.5 text-left transition-colors ${n.readAt ? 'bg-white/70 hover:bg-white' : 'bg-white shadow-[0_1px_2px_rgba(40,57,83,0.08)] hover:shadow-[0_6px_18px_-10px_rgba(40,57,83,0.4)]'} ${focusRing}`}
                      >
                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full [&>svg]:h-[1.125rem] [&>svg]:w-[1.125rem] ${n.readAt ? 'bg-ink/[0.06] text-ink/60' : 'bg-ink text-white'}`}>{KIND_ICON[n.kind]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className={`min-w-0 flex-1 text-sm leading-snug ${n.readAt ? 'font-medium text-ink/75' : 'font-semibold'}`}>{n.title}</span>
                            {!n.readAt && <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${accent}`} aria-label="Не прочитано" />}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-sm text-ink/60">{n.text}</span>
                          <span className="mt-1 block text-xs text-ink/40">{relativeTime(n.at)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Уровень 3: куда приходят */}
      <aside aria-label="Куда приходят уведомления" className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <Surface>
          <h2 className="text-base font-semibold">Куда приходят</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white [&>svg]:h-[1.125rem] [&>svg]:w-[1.125rem]">{icon.bell}</span>
              <span className="min-w-0 flex-1"><span className="block font-medium">Личный кабинет</span><span className="block text-xs text-ink/50">всегда, эта лента</span></span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Включено</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.07] text-ink/70 [&>svg]:h-[1.125rem] [&>svg]:w-[1.125rem]">{icon.telegram}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Telegram-бот</span>
                <span className="block text-xs text-ink/50">{linked ? 'копия каждого уведомления' : 'сначала привяжите Telegram'}</span>
              </span>
              {linked && <Switch checked={telegram} onChange={(v) => void toggleTelegram(v)} label="Присылать уведомления в Telegram-бота" disabled={savingTg} />}
            </li>
          </ul>
          {!linked && (
            <Link to="/cabinet/telegram" className={`${btnGhost} mt-4 w-full`}>Привязать Telegram</Link>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink/45">Когда Telegram не привязан, об ответе рекрутера и смене статуса отклика мы дополнительно напишем на почту.</p>
        </Surface>
      </aside>
    </div>
  )
}

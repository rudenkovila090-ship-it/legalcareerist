import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import PageHero from '../../components/PageHero'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getActiveRole, clearActiveRole } from '../../lib/accountRole'
import {
  getOrganizerEvents, approveOrganizerEvent, rejectOrganizerEvent, type OrganizerEventStatus,
} from '../../lib/organizerEvents'
import type { EventType, EventFormat } from '../../types'

const eventTypeLabel: Record<EventType, string> = {
  conference: 'Ключевое мероприятие',
  webinar: 'Вебинар',
  breakfast: 'Бизнес-завтрак',
  intensive: 'Интенсив',
  tour: 'Экскурсия',
  internship: 'Стажировка',
}
const eventFormatLabel: Record<EventFormat, string> = { online: 'Онлайн', offline: 'Офлайн' }
const statusLabel: Record<OrganizerEventStatus, string> = {
  draft: 'Черновик',
  pending_moderation: 'На модерации',
  published: 'Опубликовано',
  rejected: 'Отклонено',
  closed: 'Закрыто',
}
const statusClass: Record<OrganizerEventStatus, string> = {
  draft: 'bg-ink/[0.06] text-ink/60',
  pending_moderation: 'bg-amber-50 text-amber-700',
  published: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  closed: 'bg-ink/[0.06] text-ink/50',
}
const money = new Intl.NumberFormat('ru-RU')

// /account/moderator — демо-роль администратора площадки, отдельная от
// кабинета работодателя-организатора: видит очередь мероприятий на
// модерацию и одобряет/отклоняет их. Работает с тем же хранилищем
// (lib/organizerEvents.ts), что и самомодерация в EmployerAccount — в этом
// прототипе оба интерфейса управляют одними и теми же демо-данными, но это
// две разные роли/страницы, как и просилось в ТЗ («админ-панель (минимум):
// список мероприятий, карточка модерации «одобрить/отклонить»»).
export default function ModeratorAccount() {
  useDocumentTitle('Модерация мероприятий')
  const role = getActiveRole()

  const [events, setEvents] = useState(() => getOrganizerEvents())
  const [statusFilter, setStatusFilter] = useState<'pending_moderation' | OrganizerEventStatus>('pending_moderation')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  if (role !== 'moderator') return <Navigate to="/account" replace />

  function refresh() {
    setEvents(getOrganizerEvents())
  }

  function handleApprove(id: string) {
    approveOrganizerEvent(id)
    refresh()
  }

  function handleReject(id: string) {
    if (!rejectReason.trim()) return
    rejectOrganizerEvent(id, rejectReason.trim())
    refresh()
    setRejectingId(null)
    setRejectReason('')
  }

  const filtered = events.filter((ev) => ev.status === statusFilter)
  const pendingCount = events.filter((ev) => ev.status === 'pending_moderation').length

  return (
    <div>
      <PageHero
        eyebrow="Модератор"
        title="Модерация мероприятий"
        description="Демо-роль администратора площадки — отдельная от кабинета организатора: очередь мероприятий на модерацию и решение «одобрить/отклонить»."
        prototype
      />

      <section className="container-page pb-16">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['pending_moderation', `На модерации${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
              ['published', 'Опубликованные'],
              ['rejected', 'Отклоненные'],
              ['draft', 'Черновики'],
              ['closed', 'Архивные'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${statusFilter === id ? 'bg-ink text-white' : 'border border-ink/15 text-ink/60 hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link to="/account" className="text-sm font-medium text-ink/50 hover:text-ink">Сменить роль</Link>
            <button type="button" onClick={clearActiveRole} className="text-sm font-medium text-ink/50 hover:text-ink">Выйти</button>
          </div>
        </div>

        <div className="glass rounded-xl">
          {filtered.length === 0 && (
            <p className="p-5 text-sm text-ink/50">Нет мероприятий в этой категории.</p>
          )}
          <div className="divide-y divide-ink/10">
            {filtered.map((ev) => (
              <div key={ev.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{ev.data.title}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass[ev.status]}`}>{statusLabel[ev.status]}</span>
                    </div>
                    <div className="mt-1 text-xs text-ink/50">
                      {eventTypeLabel[ev.data.type]}
                      {' · '}{ev.data.format === 'online' ? eventFormatLabel.online : `${eventFormatLabel.offline}${ev.data.city ? `, ${ev.data.city}` : ''}`}
                      {' · '}{new Date(ev.data.dateTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                      {' · '}{ev.data.price === 0 ? 'Бесплатно' : `${money.format(ev.data.price)} ₽`}
                    </div>
                    {ev.data.description && (
                      <p className="mt-1.5 max-w-xl text-sm text-ink/60">{ev.data.description}</p>
                    )}
                    {ev.status === 'rejected' && ev.rejectionReason && (
                      <div className="mt-1 text-xs text-red-600">Причина отказа: {ev.rejectionReason}</div>
                    )}
                    {ev.catalogSlug && (
                      <Link to={`/events/${ev.catalogSlug}`} className="mt-1 inline-block text-xs text-ink/40 underline hover:no-underline">
                        Посмотреть на афише
                      </Link>
                    )}
                  </div>

                  {ev.status === 'pending_moderation' && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => handleApprove(ev.id)} className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                        Одобрить
                      </button>
                      <button type="button" onClick={() => setRejectingId(ev.id)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                        Отклонить
                      </button>
                    </div>
                  )}
                </div>

                {rejectingId === ev.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Причина отказа"
                      className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm placeholder:text-ink/40 focus:outline-none"
                    />
                    <button type="button" onClick={() => handleReject(ev.id)} className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                      Отклонить
                    </button>
                    <button type="button" onClick={() => { setRejectingId(null); setRejectReason('') }} className="text-xs font-medium text-ink/50 hover:text-ink">
                      Отмена
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

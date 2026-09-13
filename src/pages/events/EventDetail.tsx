import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { events } from '../../data/events'
import RelatedContentBlock from '../../components/RelatedContentBlock'
import { getRelatedContent } from '../../lib/related'
import { submitLead, pingEventRegistrationClick } from '../../lib/leads'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import PhoneInput from '../../components/PhoneInput'
import EventsFooter from './EventsFooter'
import { SPECIALIZATIONS, INDUSTRIES, type EventTariff } from '../../types'
import { registerForEvent } from '../../lib/eventRegistrations'
import { isFavoriteEvent, toggleFavoriteEvent } from '../../lib/eventFavorites'
import { useEventViews } from '../../lib/useEventViews'

const specLabel = new Map(SPECIALIZATIONS.map((s) => [s.id, s.label]))
const industryLabel = new Map(INDUSTRIES.map((i) => [i.id, i.label]))

const eventTypeLabel = { conference: 'Ключевое мероприятие', webinar: 'Вебинар', breakfast: 'Бизнес-завтрак', intensive: 'Интенсив', tour: 'Экскурсия', internship: 'Стажировка' }

// Крупный фон-афиша вверху детальной страницы — тот же принцип цветового
// кодирования по типу, что и на карточке в афише (posterTone в
// EventsHome.tsx), но не импортируется оттуда, чтобы не тянуть в чанк
// детальной страницы весь список мероприятий и фильтры.
const posterTone: Record<string, string> = {
  conference: 'from-ink to-[#1a2536]',
  webinar: 'from-gold to-ink',
  breakfast: 'from-gold-light to-gold',
  intensive: 'from-ink to-gold',
  tour: 'from-gold-light to-ink',
  internship: 'from-gold-light via-gold to-ink',
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').toUpperCase()
}

// Иконки для карточек «Что вы получите после мероприятия» — по порядку
// пунктов takeaways (запись, чек-лист/материал, доступ к сообществу).
// Минималистичные, тот же стиль обводки (stroke, viewBox 24×24), что и
// иконки на других страницах сайта.
function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5l6 3.5-6 3.5v-7z" />
    </svg>
  )
}
function IconChecklist() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="4.5" y="3.5" width="15" height="17" rx="2" />
      <path d="M8 8.5l1.3 1.3L11.5 7.5M8 15l1.3 1.3L11.5 14M14 8.5h5.5M14 15h5.5" />
    </svg>
  )
}
function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />
      <circle cx="9" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
}
const takeawayIcons = [IconPlay, IconChecklist, IconChat]

function IconHeart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 20.5s-7.5-4.6-9.5-9C1 8 2.5 4.5 6 4.5c2 0 3.4 1 4.5 2.5C11.6 5.5 13 4.5 15 4.5c3.5 0 5 3.5 3.5 7-2 4.4-9.5 9-9.5 9Z" />
    </svg>
  )
}
function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M21.5 3.5 2.7 11c-.9.36-.9 1.63.02 1.96l4.5 1.62 1.75 5.62c.24.77 1.22.98 1.76.38l2.4-2.65 4.5 3.34c.72.53 1.75.15 1.95-.72l3.4-15.1c.22-.98-.75-1.8-1.68-1.94Z" />
    </svg>
  )
}
function IconVk() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M13.2 17.8c-4.9 0-7.7-3.4-7.8-8.9h2.5c.1 4 1.8 5.7 3.2 6V8.9h2.4v3.5c1.3-.14 2.7-1.7 3.2-3.5h2.4c-.36 2.2-2 3.9-3.1 4.6 1.1.55 3 2 3.7 4.3h-2.6c-.5-1.7-1.8-3-3.6-3.2v3.2Z" />
    </svg>
  )
}
function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11.5 6.5 13 5a3.5 3.5 0 0 1 5 5l-1.5 1.5" />
      <path d="M12.5 17.5 11 19a3.5 3.5 0 0 1-5-5l1.5-1.5" />
    </svg>
  )
}

/** «Поделиться» — Telegram/VK по прямым ссылкам-шарерам + копирование
 *  ссылки на страницу. Без внешних SDK — просто sharer-URL, как у большинства сайтов. */
function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false)
  const url = typeof window !== 'undefined' ? window.location.href : ''
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  function handleCopy() {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-white/50">Поделиться:</span>
      <a
        href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Поделиться в Telegram"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white hover:bg-white/10"
      >
        <IconTelegram />
      </a>
      <a
        href={`https://vk.com/share.php?url=${encodedUrl}&title=${encodedTitle}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Поделиться в VK"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white hover:bg-white/10"
      >
        <IconVk />
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Скопировать ссылку"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white hover:bg-white/10"
      >
        <IconLink />
      </button>
      {copied && <span className="text-xs text-white/70">Ссылка скопирована</span>}
    </div>
  )
}

export default function EventDetail() {
  const { slug } = useParams()
  const event = events.find((e) => e.slug === slug)
  useDocumentTitle(event?.title ?? 'Мероприятие не найдено')
  const views = useEventViews(slug ?? '')

  const [tariffId, setTariffId] = useState<EventTariff['id']>(event?.tariffs[0]?.id ?? 'light')
  const [form, setForm] = useState({ fio: '', phone: '', email: '', telegram: '' })
  const [registered, setRegistered] = useState(false)
  const [favorite, setFavorite] = useState(() => (event ? isFavoriteEvent(event.id) : false))

  function handleToggleFavorite() {
    if (!event) return
    setFavorite(toggleFavoriteEvent(event.id).includes(event.id))
  }

  // «Стать партнером мероприятия» — лид-заявка: пока просто уведомление,
  // что такой-то человек из такой-то компании хочет стать партнером
  // именно этого мероприятия (без логики согласования/статусов).
  const [partnerForm, setPartnerForm] = useState({ fio: '', company: '', phone: '', email: '' })
  const [partnerSent, setPartnerSent] = useState(false)

  if (!event) {
    return (
      <div>
        <div className="container-page py-16">
          <p>Мероприятие не найдено. <Link className="underline" to="/events">Все мероприятия</Link></p>
        </div>
        <EventsFooter />
      </div>
    )
  }

  // Только мероприятия и база знаний — без вакансий и клубов сообщества.
  const related = getRelatedContent(event, 'event', event.id).filter((r) => r.type !== 'vacancy' && r.type !== 'club')
  const tariff = event.tariffs.find((t) => t.id === tariffId) ?? event.tariffs[0]

  function scrollToRegister() {
    document.getElementById('register')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleRegister(e: FormEvent) {
    e.preventDefault()
    if (!event) return
    if (!form.fio.trim() || (!form.phone.trim() && !form.email.trim())) return
    submitLead({
      sourceBlock: 'events',
      formType: 'event_registration',
      name: form.fio,
      contact: [form.phone, form.email, form.telegram].filter(Boolean).join(' / '),
      interest: [event.title, tariff.name],
      eventSlug: event.slug,
    })
    registerForEvent(event.id, event.title)
    setRegistered(true)
  }

  function handlePartnerSubmit(e: FormEvent) {
    e.preventDefault()
    if (!event) return
    if (!partnerForm.fio.trim() || !partnerForm.company.trim() || (!partnerForm.phone.trim() && !partnerForm.email.trim())) return
    submitLead({
      sourceBlock: 'events',
      formType: 'event_partner_application',
      name: partnerForm.fio,
      contact: [partnerForm.phone, partnerForm.email].filter(Boolean).join(' / '),
      interest: [event.title, partnerForm.company],
    })
    setPartnerSent(true)
  }

  return (
    <div className="pb-12">
      <div className="container-page pt-8">
        <Link to="/events" className="text-sm text-ink/50 hover:text-ink">← Все мероприятия</Link>
      </div>

      {/* Большой фон-афиша: дата, время по Москве, название, описание в два
          предложения, «Сфера» с тегами специализации/отрасли и кнопка
          «Записаться» — скроллит к блоку регистрации ниже. */}
      <div className={`mt-4 bg-gradient-to-br p-10 text-white sm:p-14 ${posterTone[event.type] ?? posterTone.webinar}`}>
        <div className="container-page">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium uppercase tracking-wide text-white/70">{eventTypeLabel[event.type]}</span>
            {event.partner && (
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">Партнер: {event.partner}</span>
            )}
            {event.international && (
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">Международное</span>
            )}
            {event.language === 'en' && (
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">На английском</span>
            )}
          </div>
          {/* Дата/время/формат — самый заметный акцент на афише: крупнее и
              ярче обычного текста (не text-white/80, а сплошной белый,
              жирным), разделитель — вертикальная линия, не точка. */}
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xl font-bold text-white sm:text-2xl">
            <span>{new Date(event.dateTime).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            <span className="h-6 w-px shrink-0 bg-white/40" aria-hidden="true" />
            <span>{new Date(event.dateTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} по Москве</span>
            <span className="h-6 w-px shrink-0 bg-white/40" aria-hidden="true" />
            <span>{event.format === 'online' ? 'Онлайн' : event.city}</span>
          </div>
          {/* Без max-w — заголовок и описание растянуты на всю ширину афиши,
              иначе строка обрывается посреди слова («…Карьера в M&A» уходило
              переносом на новую строку некрасиво). */}
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{event.title}</h1>
          <p className="mt-4 text-white/80">{event.description}</p>

          {/* Свои пилюли, не общий TagRow — тот рассчитан на светлый фон
              (bg-ink/5 text-ink/70), на темной афише был бы нечитаем. */}
          <div className="mt-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">Сфера</div>
            <div className="flex flex-wrap gap-1.5">
              {event.specialization.map((s) => (
                <span key={s} className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-medium text-white">{specLabel.get(s)}</span>
              ))}
              {event.industry.map((i) => (
                <span key={i} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">{industryLabel.get(i)}</span>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {event.registrationLink ? (
              <a
                href={event.registrationLink}
                target="_blank"
                rel="noreferrer"
                onClick={() => pingEventRegistrationClick(event.slug)}
                className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-ink hover:opacity-90"
              >
                Зарегистрироваться на сайте организатора
              </a>
            ) : (
              <button
                type="button"
                onClick={scrollToRegister}
                className="rounded-full bg-white px-8 py-3 text-sm font-semibold text-ink hover:opacity-90"
              >
                Приобрести билет
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleFavorite}
              aria-pressed={favorite}
              className="flex items-center gap-2 rounded-full border border-white/40 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <IconHeart filled={favorite} />
              {favorite ? 'В избранном' : 'В избранное'}
            </button>
            <ShareButtons title={event.title} />
            {views !== null && <span className="text-sm text-white/60">{views} просмотров</span>}
          </div>
        </div>
      </div>

      <div className="container-page mt-10 grid gap-10 lg:grid-cols-[2fr_1fr]">
        <div>
          <div>
            <h2 className="text-xl font-semibold">Программа</h2>
            <ul className="mt-3 space-y-2 text-ink/70">
              {event.program.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/40" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {event.audienceFit.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold">Это мероприятие для вас, если</h2>
              <ul className="mt-3 space-y-2 text-ink/70">
                {event.audienceFit.map((a) => (
                  <li key={a} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/40" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {event.bonuses.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold">Дополнительные бонусы участникам</h2>
              <ul className="mt-3 space-y-2 text-ink/70">
                {event.bonuses.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8">
            <h2 className="text-xl font-semibold">Что вы получите после мероприятия</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {event.takeaways.map((t, i) => {
                const Icon = takeawayIcons[i % takeawayIcons.length]
                return (
                  <div key={t} className="rounded-2xl border border-ink/10 bg-ink/[0.02] p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white">
                      <Icon />
                    </div>
                    <p className="mt-3 text-sm text-ink/70">{t}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Спикеры — кружок (фото или плейсхолдер), под ним имя и регалии,
              текст выровнен по левому краю колонки. */}
          {event.speakers.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold">Спикеры</h2>
              <div className="mt-4 flex flex-wrap gap-6">
                {event.speakers.map((s) => (
                  <div key={s.name} className="w-40">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-ink to-gold text-lg font-semibold text-white/70">
                      {initials(s.name)}
                    </div>
                    <div className="mt-3 text-left text-sm font-semibold text-ink">{s.name}</div>
                    <div className="text-left text-xs text-ink/60">{s.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Стать партнером мероприятия — лид-заявка: пока просто фиксируем
              отклик (кто и от какой компании хочет стать партнером именно
              этого мероприятия), без логики согласования. */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold">Стать партнером мероприятия</h2>
            <p className="mt-2 text-sm text-ink/60">
              Оставьте заявку — мы свяжемся, чтобы обсудить формат партнерства для этого мероприятия.
            </p>
            {partnerSent ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1">Мы свяжемся с вами, чтобы обсудить детали партнерства.</p>
              </div>
            ) : (
              <form onSubmit={handlePartnerSubmit} className="mt-4 grid gap-3 rounded-2xl border border-ink/10 bg-ink/[0.02] p-5 sm:grid-cols-2">
                <input
                  value={partnerForm.fio}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, fio: e.target.value }))}
                  placeholder="ФИО"
                  required
                  className="rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
                />
                <input
                  value={partnerForm.company}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, company: e.target.value }))}
                  placeholder="Компания"
                  required
                  className="rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
                />
                <PhoneInput
                  value={partnerForm.phone}
                  onChange={(value) => setPartnerForm((f) => ({ ...f, phone: value }))}
                  className="rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
                />
                <input
                  type="email"
                  value={partnerForm.email}
                  onChange={(e) => setPartnerForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="Почта"
                  className="rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
                />
                <button type="submit" className="rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90 sm:col-span-2">
                  Отправить заявку
                </button>
              </form>
            )}
          </div>

          {/* «Может быть полезно» — только релевантное теме мероприятия
              (мероприятия/база знаний/вакансии по тем же тегам специализации
              и отрасли), см. getRelatedContent. */}
          <RelatedContentBlock items={related} title="Может быть полезно" />
        </div>

        <aside id="register" className="scroll-mt-24">
          <div className="glass rounded-2xl p-6">
            {event.status === 'completed' ? (
              event.sale ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Мероприятие завершено — доступно к покупке</div>
                  {event.sale.recording !== undefined && (
                    <button className="flex w-full items-center justify-between rounded-lg border border-ink/15 px-4 py-2.5 text-sm hover:border-ink/30">
                      <span>Запись</span>
                      <span className="font-semibold">{event.sale.recording === 0 ? 'Бесплатно' : `${event.sale.recording.toLocaleString('ru-RU')} ₽`}</span>
                    </button>
                  )}
                  {event.sale.materials !== undefined && (
                    <button className="flex w-full items-center justify-between rounded-lg border border-ink/15 px-4 py-2.5 text-sm hover:border-ink/30">
                      <span>Материалы</span>
                      <span className="font-semibold">{event.sale.materials.toLocaleString('ru-RU')} ₽</span>
                    </button>
                  )}
                  {event.sale.bundle !== undefined && (
                    <button className="flex w-full items-center justify-between rounded-lg bg-ink px-4 py-2.5 text-sm text-white hover:bg-ink/90">
                      <span>Запись + материалы</span>
                      <span className="font-semibold">{event.sale.bundle === 0 ? 'Бесплатно' : `${event.sale.bundle.toLocaleString('ru-RU')} ₽`}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-ink/[0.04] p-3 text-sm text-ink/60">
                  Мероприятие завершено. Запись — в разделе «Полезные материалы».
                </div>
              )
            ) : (
              <>
                <div className="text-sm font-semibold uppercase tracking-wide text-gold">Регистрация</div>
                <h3 className="mt-1 text-lg font-semibold">Выберите тариф участия</h3>

                <div className="mt-4 grid gap-2.5">
                  {event.tariffs.map((t) => {
                    const selected = t.id === tariffId
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTariffId(t.id)}
                        className={`rounded-xl border p-3.5 text-left transition-colors ${selected ? 'border-ink bg-ink/[0.03]' : 'border-ink/15 hover:border-ink/30'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 font-semibold text-ink">
                            <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${selected ? 'border-ink bg-ink' : 'border-ink/30'}`} />
                            {t.name}
                          </span>
                          <span className="font-semibold text-ink">{t.price === 0 ? 'Бесплатно' : `${t.price.toLocaleString('ru-RU')} ₽`}</span>
                        </div>
                        <ul className="mt-2 space-y-0.5 pl-5 text-xs text-ink/60">
                          {t.includes.map((i) => <li key={i}>· {i}</li>)}
                        </ul>
                      </button>
                    )
                  })}
                </div>

                {event.promoCode && (
                  <div className="mt-2 text-xs text-ink/50">Промокод: {event.promoCode}</div>
                )}

                {event.registrationLink && (
                  <a
                    href={event.registrationLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => pingEventRegistrationClick(event.slug)}
                    className="mt-4 block rounded-lg bg-ink py-2.5 text-center text-sm font-semibold text-white hover:bg-ink/90"
                  >
                    Регистрация на сайте организатора
                  </a>
                )}
                {event.registrationLink && (
                  <div className="mt-3 text-center text-xs text-ink/40">или зарегистрируйтесь через тарифы ниже</div>
                )}

                {registered ? (
                  <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Вы зарегистрированы. Напоминание придет заранее.</div>
                ) : (
                  <form onSubmit={handleRegister} className="mt-4 grid gap-2.5">
                    <input
                      value={form.fio}
                      onChange={(e) => setForm((f) => ({ ...f, fio: e.target.value }))}
                      placeholder="ФИО"
                      required
                      className="rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
                    />
                    <PhoneInput
                      value={form.phone}
                      onChange={(value) => setForm((f) => ({ ...f, phone: value }))}
                      className="rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
                    />
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="Почта"
                      className="rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
                    />
                    <input
                      value={form.telegram}
                      onChange={(e) => setForm((f) => ({ ...f, telegram: e.target.value }))}
                      placeholder="Telegram"
                      className="rounded-lg border border-ink/15 px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-ink/40"
                    />
                    <button type="submit" className="mt-1 rounded-lg bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90">
                      {tariff.price === 0 ? 'Приобрести билет' : `Приобрести билет — ${tariff.price.toLocaleString('ru-RU')} ₽`}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          {event.organizer && (
            <div className="glass mt-4 rounded-2xl p-6">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Организатор</div>
              <div className="mt-2 text-lg font-semibold text-ink">{event.organizer.name}</div>
              {event.organizer.description && (
                <p className="mt-2 text-sm text-ink/60">{event.organizer.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {event.organizer.site && (
                  <a href={event.organizer.site} target="_blank" rel="noreferrer" className="font-medium text-ink underline hover:no-underline">
                    Сайт
                  </a>
                )}
                {event.organizer.socialLinks && (
                  <a href={event.organizer.socialLinks} target="_blank" rel="noreferrer" className="font-medium text-ink underline hover:no-underline">
                    Соцсети
                  </a>
                )}
              </div>
            </div>
          )}

          {event.format === 'offline' && (event.city || event.location) && (
            <div className="glass mt-4 overflow-hidden rounded-2xl">
              <div className="p-6 pb-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink/40">Место проведения</div>
                <div className="mt-1 text-sm text-ink/70">{event.location}</div>
              </div>
              <iframe
                title="Место проведения мероприятия на карте"
                src={`https://yandex.ru/map-widget/v1/?text=${encodeURIComponent([event.city, event.location].filter(Boolean).join(', '))}`}
                className="h-56 w-full border-0"
                loading="lazy"
              />
            </div>
          )}
        </aside>
      </div>

      <EventsFooter />
    </div>
  )
}

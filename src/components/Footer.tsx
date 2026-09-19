import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import PhoneInput from './PhoneInput'
import { submitLead, makeTicketNumber } from '../lib/leads'

// Единый футер по всему сайту (раздел 5 карты сайта). Визуально построен по
// тому же принципу, что и подвал раздела «Мероприятия» (EventsFooter) —
// яркие заголовки колонок (text-white, font-bold), приглушенные ссылки
// (text-white/40), соцсети отдельной полноширинной строкой. «Карьерный
// Юрист» — отдельная полноширинная строка над колонками (не колонка сетки),
// чтобы название и подпись гарантированно помещались в одну строку, а не
// переносились в узкой колонке. Юридический блок — крайняя правая колонка.

function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M21.5 3.5 2.7 11.2c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.9.9.9.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.7-.8L23.9 4.9c.3-1.3-.5-1.9-1.4-1.4z" />
    </svg>
  )
}
function IconVk() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M13.2 17.3c-5.4 0-8.6-3.7-8.7-9.9h2.8c.1 4.5 2.1 6.4 3.6 6.8v-6.8h2.6v3.9c1.5-.2 3.1-2 3.6-3.9h2.6c-.4 2.3-2.1 4.1-3.3 4.9 1.2.6 3.1 2.2 3.9 4.9h-2.9c-.6-1.8-2-3.2-3.9-3.4v3.4z" />
    </svg>
  )
}
function IconYoutube() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M22 12s0-3-.4-4.4a2.9 2.9 0 0 0-2-2C17.9 5 12 5 12 5s-5.9 0-7.6.6a2.9 2.9 0 0 0-2 2C2 9 2 12 2 12s0 3 .4 4.4a2.9 2.9 0 0 0 2 2C6.1 19 12 19 12 19s5.9 0 7.6-.6a2.9 2.9 0 0 0 2-2C22 15 22 12 22 12z" opacity=".18" />
      <path d="M10 15.2V8.8L15.8 12z" />
    </svg>
  )
}
function IconTiktok() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M16.5 2h-3v13.6a2.6 2.6 0 1 1-2-2.5v-3a5.6 5.6 0 1 0 5 5.6V9c1 .7 2.2 1.1 3.5 1.1V7a3.5 3.5 0 0 1-3.5-3.5z" />
    </svg>
  )
}
function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M13.6 10.6 20.4 3h-2l-5.8 6.6L7.9 3H2.5l6.9 10.1L2.5 21h2l6.2-7 5 7h5.4l-7.2-10.4h-.3zm-2.2 2.5-.7-1L5 4.7h2.3l4.6 6.6.7 1 6 8.6h-2.3l-4.9-7z" />
    </svg>
  )
}
function IconZakon() {
  return <span className="text-[11px] font-bold leading-none">Zn</span>
}
function IconDzen() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12,2 Q12,12 22,12 Q12,12 12,22 Q12,12 2,12 Q12,12 12,2 Z" />
    </svg>
  )
}
function IconPodcast() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
    </svg>
  )
}

export default function Footer() {
  // «Помощь → Поддержка» — тот же лид-механизм, что и в разделе «Мероприятия»
  // (submitLead formType: 'support_request'): заявки из любой точки сайта
  // (эта форма, вкладка «Мероприятия → Поддержка» и т.д.) попадают в одну и
  // ту же ленту лидов, а не заводятся отдельными типами.
  const [supportForm, setSupportForm] = useState({ fio: '', phone: '', email: '', telegram: '', question: '' })
  const [supportTicket, setSupportTicket] = useState<string | null>(null)
  const [supportMissing, setSupportMissing] = useState(false)

  function handleSupportSubmit(e: FormEvent) {
    e.preventDefault()
    setSupportMissing(false)
    if (!supportForm.fio.trim() || !supportForm.phone.trim() || !supportForm.question.trim()) {
      setSupportMissing(true)
      return
    }
    submitLead({
      sourceBlock: 'home',
      formType: 'support_request',
      name: supportForm.fio,
      contact: [supportForm.phone, supportForm.email, supportForm.telegram].filter(Boolean).join(' / '),
      interest: [supportForm.question],
    })
    setSupportTicket(makeTicketNumber())
  }

  return (
    <footer className="border-t border-white/10 bg-ink text-white/40">
      <div className="container-page pt-14">
        <div className="mb-3 text-lg font-semibold text-white">Карьерный Юрист</div>
        <p className="whitespace-nowrap text-sm leading-relaxed text-white/60 max-sm:whitespace-normal">
          Кадровое агентство и сообщество для юридического рынка — под одним брендом.
        </p>
      </div>

      <div className="container-page grid gap-10 py-10 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Кадры</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/kadry/employers">Работодателям</Link></li>
            <li><Link className="hover:text-white" to="/kadry/candidates">Соискателям</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Сообщество</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/community">Вступить в сообщество</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Мероприятия</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/events">Все мероприятия</Link></li>
            <li><Link className="hover:text-white" to="/events/materials">Материалы (демо-каркас)</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Маркетплейс</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/marketplace">Каталог полезных материалов</Link></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Помощь</div>
          <ul className="space-y-2 text-sm">
            <li><a className="hover:text-white" href="#support">Поддержка</a></li>
          </ul>
        </div>

        <div>
          <div className="mb-3 whitespace-nowrap text-sm font-bold uppercase tracking-wide text-white">Юридический блок</div>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-white" to="/legal/privacy">Политика обработки персональных данных</Link></li>
            <li><Link className="hover:text-white" to="/legal/consent">Согласие на обработку персональных данных</Link></li>
            <li><Link className="hover:text-white" to="/legal/marketing-consent">Согласие на получение рекламных и информационных материалов</Link></li>
          </ul>
        </div>
      </div>

      {/* Поддержка — контакты + лид-форма запроса помощи, id="support" для
          якоря из колонки «Помощь» выше. Та же форма, что и на вкладке
          «Мероприятия → Поддержка» (см. EventsHome.tsx), сюда перенесена
          один в один, чтобы обращение с любой страницы сайта уходило в одну
          и ту же ленту лидов (formType: 'support_request'). */}
      <div id="support" className="border-t border-white/10 py-10">
        <div className="container-page">
          <div className="mb-2 text-sm font-bold uppercase tracking-wide text-white">Поддержка</div>
          <h2 className="mb-6 text-xl font-semibold text-white">Написать нам</h2>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="rounded-xl bg-white/5 p-5">
                <div className="text-sm text-white/40">Email</div>
                <a href="mailto:info@legalcareerist.ru" className="font-medium text-white hover:text-white/80">info@legalcareerist.ru</a>
              </div>
              <div className="rounded-xl bg-white/5 p-5">
                <div className="text-sm text-white/40">Телефон</div>
                <a href="tel:+79322621344" className="font-medium text-white hover:text-white/80">+7 932 262-13-44</a>
              </div>
              <div className="rounded-xl bg-white/5 p-5">
                <div className="text-sm text-white/40">Telegram</div>
                <a href="https://t.me/legalcareerst_support" target="_blank" rel="noreferrer" className="font-medium text-white hover:text-white/80">@legalcareerst_support</a>
              </div>
            </div>

            {supportTicket ? (
              <div className="rounded-xl bg-white/5 p-6 text-emerald-400">
                <div className="font-semibold">Заявка отправлена</div>
                <p className="mt-1 text-sm text-white/60">
                  Номер вашей заявки — <span className="font-semibold text-emerald-400">№ {supportTicket}</span>. Мы свяжемся с вами в ближайшее время.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSupportSubmit} className="rounded-xl bg-white/5 p-6">
                <div className="font-semibold text-white">Задать вопрос</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input
                    value={supportForm.fio}
                    onChange={(e) => setSupportForm((f) => ({ ...f, fio: e.target.value }))}
                    placeholder="ФИО"
                    required
                    className="rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/40"
                  />
                  <PhoneInput
                    value={supportForm.phone}
                    onChange={(value) => setSupportForm((f) => ({ ...f, phone: value }))}
                    required
                    className="rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/40"
                  />
                  <input
                    type="email"
                    value={supportForm.email}
                    onChange={(e) => setSupportForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Почта"
                    className="rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/40"
                  />
                  <input
                    value={supportForm.telegram}
                    onChange={(e) => setSupportForm((f) => ({ ...f, telegram: e.target.value }))}
                    placeholder="Telegram"
                    className="rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/40"
                  />
                </div>
                <textarea
                  value={supportForm.question}
                  onChange={(e) => setSupportForm((f) => ({ ...f, question: e.target.value }))}
                  placeholder="Вопрос"
                  required
                  rows={4}
                  className="mt-3 w-full rounded-lg border border-white/15 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/40"
                />

                {supportMissing && (
                  <p className="mt-3 text-sm text-red-400">Заполните ФИО, телефон и вопрос.</p>
                )}

                <button
                  type="submit"
                  className="mt-4 w-full rounded-lg bg-gold-light py-2.5 text-sm font-semibold text-ink hover:opacity-90"
                >
                  Отправить
                </button>
                <p className="mt-2 text-center text-xs text-white/30">Нажимая «Отправить», вы соглашаетесь на обработку персональных данных.</p>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Соцсети — отдельной полноширинной строкой, не колонкой сетки выше:
          8 иконок в один ряд не помещались бы в узкую колонку и переносились
          на вторую строку (тот же прием, что и в EventsFooter/CommunityFooter). */}
      <div className="border-t border-white/10 py-8">
        <div className="container-page">
          <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white">Социальные сети</div>
          <div className="flex flex-wrap gap-2.5">
            <a href="https://t.me/legalcareerist" target="_blank" rel="noreferrer" aria-label="Telegram" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconTelegram />
            </a>
            <a href="https://vk.com/legalcareerist" target="_blank" rel="noreferrer" aria-label="ВКонтакте" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconVk />
            </a>
            <a href="https://dzen.ru/id/69087002dedfba7e86b46418" target="_blank" rel="noreferrer" aria-label="Дзен" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconDzen />
            </a>
            <a href="https://legalcareerist.mave.digital/" target="_blank" rel="noreferrer" aria-label="Подкаст" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconPodcast />
            </a>
            <a href="https://www.youtube.com/channel/UC3lHAByHe4-To0sJEghrTdw" target="_blank" rel="noreferrer" aria-label="YouTube" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconYoutube />
            </a>
            <a href="https://tiktok.com/@legalcareerist" target="_blank" rel="noreferrer" aria-label="TikTok" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconTiktok />
            </a>
            <a href="https://x.com/legalcareerist" target="_blank" rel="noreferrer" aria-label="X (Twitter)" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconX />
            </a>
            <a href="https://zakon.ru/karernyj_yurist" target="_blank" rel="noreferrer" aria-label="Закон.ру" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 hover:text-white">
              <IconZakon />
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-5">
        <div className="container-page text-center text-xs text-white/40">
          <span>© {new Date().getFullYear()} ИП Руденков И.В. Карьерный Юрист. ИНН 262607024144 ОГРНИП 325784700110048</span>
        </div>
      </div>
    </footer>
  )
}

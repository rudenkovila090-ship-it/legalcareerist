import { useEffect, useState, type FormEvent } from 'react'
import ConsentCheck from '../../../components/ConsentCheck'
import { consentOf } from '../../../lib/consent'
import { fetchPodcast, peekPodcast, savePodcast, withdrawPodcast, type PodcastApplication, type PodcastInput } from '../../../lib/careerCabinet'
import { icon } from '../sections'
import { longDate } from '../shared'
import { Chip, Surface, TabSkeleton } from '../kit'
import { btnGhost, btnPrimary, field, focusRing, label } from '../kitStyles'
import type { CareerHandle } from './useCareer'

// Подкаст «Карьерный юрист»: заявка на участие гостем в эпизоде. Резидент оставляет контакты и темы, на которые ему интересно
// выступить; заявка приходит админу в бота. Заявку можно поправить и отозвать. Выпуски подкаста здесь не показываем.

const errorText = (code: string) =>
  ({
    consent_required: 'Отметьте обе галочки внизу формы: без согласия мы не можем хранить ваши контакты.',
    name_required: 'Укажите, как к вам обращаться.',
    contact_required: 'Оставьте хотя бы один способ связи: почту, телефон или Telegram.',
    topics_required: 'Напишите хотя бы одну тему, о которой хотите рассказать.',
    too_many_attempts: 'Слишком много попыток. Попробуйте через час.',
  })[code] ?? 'Не получилось отправить. Попробуйте ещё раз.'

const empty: PodcastInput = { name: '', email: '', phone: '', telegram: '', about: '', topics: '', link: '' }
const fromApplication = (a: PodcastApplication): PodcastInput => ({ name: a.name, email: a.email, phone: a.phone, telegram: a.telegram, about: a.about, topics: a.topics, link: a.link })

export default function PodcastTab({ career }: { career: CareerHandle }) {
  const cached = peekPodcast()
  const [loaded, setLoaded] = useState(Boolean(cached))
  const [failed, setFailed] = useState(false)
  const [app, setApp] = useState<PodcastApplication | null>(cached?.application ?? null)
  const [form, setForm] = useState<PodcastInput>(() => (cached?.application ? fromApplication(cached.application) : { ...empty, ...(cached?.prefill ?? {}) }))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)

  useEffect(() => {
    let live = true
    fetchPodcast().then((r) => {
      if (!live) return
      if (r.ok) {
        setApp(r.data.application)
        setForm((cur) => (r.data.application ? fromApplication(r.data.application) : cur.name || cur.email || cur.topics ? cur : { ...empty, name: r.data.prefill.name, email: r.data.prefill.email, phone: r.data.prefill.phone, telegram: r.data.prefill.telegram }))
        setLoaded(true)
      } else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [])

  const set = (k: keyof PodcastInput, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const consent = consentOf(e)
    setBusy(true)
    setError('')
    const r = await savePodcast(form, app ? undefined : { policy: consent.policy, processing: consent.processing })
    setBusy(false)
    if (!r.ok) {
      setError(errorText(r.error))
      return
    }
    setApp(r.data.application)
    setEditing(false)
    career.patch({ podcast: { status: r.data.application.status, updatedAt: r.data.application.updatedAt } })
  }

  async function withdraw() {
    setBusy(true)
    const r = await withdrawPodcast()
    setBusy(false)
    if (!r.ok) return
    setApp(null)
    setConfirmWithdraw(false)
    setEditing(false)
    career.patch({ podcast: null })
  }

  if (failed && !loaded) return <Surface><p className="text-[13px] text-ink/60">Не получилось загрузить данные. Обновите страницу через минуту.</p></Surface>
  if (!loaded) return <TabSkeleton rows={2} />

  const showForm = !app || editing
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-2">
        <section className="relative overflow-hidden rounded-2xl bg-ink p-4 text-white sm:p-5">
          <span className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/[0.06]" aria-hidden="true" />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/60">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 text-ink [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.headphones}</span>Подкаст
            </div>
            <h2 className="mt-2 text-lg font-semibold leading-snug sm:text-xl">Станьте гостем эпизода</h2>
            <p className="mt-1 max-w-lg text-[13px] text-white/70">Расскажите, о чём вам интересно поговорить в подкасте «Карьерный юрист»: оставьте контакты и темы, мы свяжемся, когда будем собирать гостей.</p>
          </div>
        </section>

        {app && !editing && (
          <section className="rounded-2xl bg-amber-100 p-4" aria-label="Ваша заявка">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-300 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon.check}</span>Заявка отправлена</h3>
              <Chip>с {longDate(app.createdAt)}</Chip>
            </div>
            <p className="mt-1.5 text-xs text-ink/70">Мы свяжемся с вами по указанным контактам. Заявку можно поправить или отозвать в любой момент.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { setForm(fromApplication(app)); setEditing(true) }} className={btnPrimary}>Изменить заявку</button>
              {!confirmWithdraw ? (
                <button type="button" onClick={() => setConfirmWithdraw(true)} className={`rounded-full px-3 py-1.5 text-[13px] font-medium text-ink/55 hover:text-red-700 ${focusRing}`}>Отозвать заявку</button>
              ) : (
                <span className="flex items-center gap-2 text-xs">
                  Запись о вас будет удалена.
                  <button type="button" onClick={() => void withdraw()} disabled={busy} className="rounded-full bg-red-600 px-3 py-1 font-bold text-white hover:bg-red-700 disabled:opacity-60">Да, отозвать</button>
                  <button type="button" onClick={() => setConfirmWithdraw(false)} className={btnGhost}>Нет</button>
                </span>
              )}
            </div>
          </section>
        )}
      </div>

      <Surface>
        {showForm ? (
          <>
            <h2 className="text-base font-semibold">{app ? 'Изменить заявку' : 'Заявка на участие'}</h2>
            <p className="mb-3 mt-0.5 text-xs text-ink/55">Контакты подставлены из кабинета: поправьте, если нужно.</p>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor="pod-name" className={label}>Как к вам обращаться</label>
                <input id="pod-name" value={form.name} onChange={(e) => set('name', e.target.value.slice(0, 80))} required autoComplete="name" className={field} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pod-email" className={label}>Почта</label>
                  <input id="pod-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value.slice(0, 120))} autoComplete="email" className={field} />
                </div>
                <div>
                  <label htmlFor="pod-phone" className={label}>Телефон</label>
                  <input id="pod-phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value.slice(0, 30))} autoComplete="tel" placeholder="+7" className={field} />
                </div>
              </div>
              <div>
                <label htmlFor="pod-tg" className={label}>Telegram <span className="font-normal text-ink/40">ник</span></label>
                <input id="pod-tg" value={form.telegram} onChange={(e) => set('telegram', e.target.value.slice(0, 60))} placeholder="@nickname" className={field} />
                <p className="mt-1 text-[11px] text-ink/45">Нужен хотя бы один способ связи: почта, телефон или Telegram.</p>
              </div>
              <div>
                <label htmlFor="pod-topics" className={label}>Темы, на которые вам интересно выступить</label>
                <textarea id="pod-topics" value={form.topics} onChange={(e) => set('topics', e.target.value.slice(0, 1500))} required rows={4} placeholder={'Каждая тема с новой строки, например:\nКак перейти из суда в консалтинг\nПервый год в налоговой практике'} className={field} />
              </div>
              <div>
                <label htmlFor="pod-about" className={label}>Коротко о себе <span className="font-normal text-ink/40">по желанию</span></label>
                <textarea id="pod-about" value={form.about} onChange={(e) => set('about', e.target.value.slice(0, 600))} rows={2} placeholder="Где работаете, сколько лет в профессии" className={field} />
              </div>
              <div>
                <label htmlFor="pod-link" className={label}>Ссылка на соцсети или профиль <span className="font-normal text-ink/40">по желанию</span></label>
                <input id="pod-link" type="url" value={form.link} onChange={(e) => set('link', e.target.value.slice(0, 300))} placeholder="https://" className={field} />
              </div>
              {!app && (
                <div className="rounded-xl bg-ink/[0.04] p-3">
                  <p className="mb-2 text-xs text-ink/60">Чтобы хранить ваши контакты и передать заявку, нужно согласие. Заявку можно отозвать в любой момент.</p>
                  <ConsentCheck marketing={false} />
                </div>
              )}
              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={btnPrimary}>{busy ? 'Отправляем…' : app ? 'Сохранить' : 'Отправить заявку'}</button>
                {app && <button type="button" onClick={() => setEditing(false)} className={btnGhost}>Отмена</button>}
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold">Ваша заявка</h2>
            <dl className="mt-3 space-y-2.5 text-[13px]">
              {[['Имя', app!.name], ['Почта', app!.email], ['Телефон', app!.phone], ['Telegram', app!.telegram ? `@${app!.telegram}` : ''], ['Ссылка', app!.link], ['О себе', app!.about]].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink/45">{k}</dt><dd className="mt-0.5 break-words font-medium">{v}</dd></div>
              ))}
              <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-ink/45">Темы</dt><dd className="mt-1 flex flex-col gap-1">{app!.topics.split('\n').filter(Boolean).map((t) => <span key={t} className="rounded-lg bg-ink/[0.05] px-2.5 py-1 font-medium">{t}</span>)}</dd></div>
            </dl>
          </>
        )}
      </Surface>
    </div>
  )
}

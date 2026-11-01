import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import ConsentCheck from '../../../components/ConsentCheck'
import { consentOf } from '../../../lib/consent'
import { pluralRu } from '../../../lib/plural'
import { fetchReserve, joinReserve, peekReserve, leaveReserve, renewReserve, type ReserveInfo, type ReserveState } from '../../../lib/vacanciesCabinet'
import { icon } from '../sections'
import { longDate } from '../shared'
import { BlockHead, Surface, TabSkeleton } from '../kit'
import { accent, btnGhost, btnPrimary, focusRing } from '../kitStyles'

// Кадровый резерв: закрытая база проверенных кандидатов, которым мы предлагаем вакансии раньше открытой публикации.
// Вступить можно из кабинета (нужно согласие на хранение данных), срок хранения — год с вступления или продления;
// выйти и удалить запись можно в любой момент. Запись, оставленная через форму на сайте, находится по той же почте.

const DAY = 86400000
const field = 'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-base placeholder:text-ink/40 focus:border-ink/40 focus:outline-none sm:text-sm'
const label = 'mb-1.5 block text-sm font-medium text-ink/80'

const errorText = (code: string) =>
  ({
    consent_required: 'Отметьте обе галочки внизу формы: без согласия мы не можем хранить ваши данные.',
    position_required: 'Укажите, кем хотите работать.',
    no_contact: 'Нужна почта аккаунта или ник в Telegram, чтобы мы нашли вашу запись.',
    too_many_attempts: 'Слишком много попыток. Попробуйте через час.',
  })[code] ?? 'Не получилось сохранить. Попробуйте ещё раз.'

function Facts({ r, now, dark }: { r: ReserveInfo; now: number; dark?: boolean }) {
  const left = Math.max(0, Math.ceil((r.until - now) / DAY))
  const total = 365
  const share = Math.min(1, Math.max(0, left / total))
  const dim = dark ? 'text-white/55' : 'text-ink/50'
  return (
    <div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div><dt className={`text-xs ${dim}`}>Вступили</dt><dd className="mt-0.5 font-semibold">{longDate(r.joinedAt)}</dd></div>
        <div><dt className={`text-xs ${dim}`}>{r.renewedAt ? 'Продлено' : 'Согласие дано'}</dt><dd className="mt-0.5 font-semibold">{longDate(r.renewedAt ?? r.joinedAt)}</dd></div>
        <div><dt className={`text-xs ${dim}`}>Хранение до</dt><dd className="mt-0.5 font-semibold">{longDate(r.until)}</dd></div>
      </dl>
      <div className="mt-4">
        <div className={`flex items-baseline justify-between text-xs ${dim}`}><span>Осталось {left} {pluralRu(left, ['день', 'дня', 'дней'])}</span><span>срок — год</span></div>
        <div className={`mt-1.5 h-2 overflow-hidden rounded-full ${dark ? 'bg-white/15' : 'bg-ink/10'}`} role="progressbar" aria-valuenow={left} aria-valuemin={0} aria-valuemax={total} aria-label="Сколько осталось до конца срока хранения">
          <div className={`h-full rounded-full ${left <= 60 ? 'bg-amber-400' : dark ? 'bg-white' : 'bg-ink'}`} style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      </div>
    </div>
  )
}

export default function ReserveTab({ onChanged }: { onChanged: () => void }) {
  const [state, setState] = useState<ReserveState | null>(() => peekReserve() ?? null)
  const [failed, setFailed] = useState(false)
  const [position, setPosition] = useState(() => peekReserve()?.reserve?.position ?? peekReserve()?.prefill.position ?? '')
  const [city, setCity] = useState(() => peekReserve()?.reserve?.city ?? peekReserve()?.prefill.city ?? '')
  const [university, setUniversity] = useState(() => peekReserve()?.reserve?.university ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [now] = useState(() => Date.now())

  const apply = (s: ReserveState) => {
    setState(s)
    setPosition(s.reserve?.position ?? s.prefill.position)
    setCity(s.reserve?.city ?? s.prefill.city)
    setUniversity(s.reserve?.university ?? '')
  }

  useEffect(() => {
    let live = true
    fetchReserve().then((r) => {
      if (!live) return
      if (r.ok) {
        setState(r.data)
        setPosition(r.data.reserve?.position ?? r.data.prefill.position)
        setCity(r.data.reserve?.city ?? r.data.prefill.city)
        setUniversity(r.data.reserve?.university ?? '')
      } else setFailed(true)
    })
    return () => {
      live = false
    }
  }, [])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const consent = consentOf(e)
    const joined = Boolean(state?.reserve)
    setBusy(true)
    setError('')
    setSaved(false)
    const r = await joinReserve({ position, city, university }, joined ? undefined : { policy: consent.policy, processing: consent.processing })
    setBusy(false)
    if (!r.ok) {
      setError(errorText(r.error))
      return
    }
    apply(r.data)
    setSaved(true)
    onChanged()
  }

  async function renew() {
    setBusy(true)
    setError('')
    const r = await renewReserve()
    setBusy(false)
    if (!r.ok) {
      setError(errorText(r.error))
      return
    }
    apply(r.data)
    setSaved(true)
  }

  async function leave() {
    setBusy(true)
    setError('')
    const r = await leaveReserve()
    setBusy(false)
    setConfirmLeave(false)
    if (!r.ok) {
      setError(errorText(r.error))
      return
    }
    apply(r.data)
    onChanged()
  }

  if (failed) return <Surface><p className="text-sm text-ink/60">Не получилось загрузить данные. Обновите страницу через минуту.</p></Surface>
  if (!state) return <TabSkeleton rows={2} />
  const r = state.reserve
  const closeToEnd = r ? r.until - now <= 60 * DAY : false

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-3">
        {/* Уровень 1: состояние */}
        {r ? (
          <Surface className="!bg-ink !text-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full ${accent} [&>svg]:h-[1.125rem] [&>svg]:w-[1.125rem]`}>{icon.box}</span>
                  <h2 className="text-xl font-semibold">Вы в кадровом резерве</h2>
                </div>
                <p className="mt-2 max-w-xl text-sm text-white/70">Мы предлагаем вам подходящие вакансии раньше открытой публикации. Резерв №{r.number}{r.fromSite ? ' · заявка оставлена на сайте' : ''}.</p>
              </div>
              {closeToEnd && <span className={`rounded-full px-3 py-1 text-xs font-bold ${accent}`}>Скоро срок хранения</span>}
            </div>
            <div className="mt-5 rounded-2xl bg-white/10 p-4">
              <Facts r={r} now={now} dark />
            </div>
          </Surface>
        ) : (
          <Surface className="!bg-ink !text-white">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 [&>svg]:h-[1.125rem] [&>svg]:w-[1.125rem]">{icon.box}</span>
              <h2 className="text-xl font-semibold">Кадровый резерв</h2>
            </div>
            <p className="mt-2 max-w-xl text-sm text-white/75">Это закрытая база проверенных кандидатов: мы предлагаем им вакансии раньше открытой публикации. Расскажите, кем хотите работать, и мы будем присылать подходящее.</p>
            <ul className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
              {['Хранение — год', 'Выйти можно в любой момент', 'Данные видим только мы'].map((t) => <li key={t} className="rounded-full bg-white/10 px-3 py-1.5 text-white/80">{t}</li>)}
            </ul>
          </Surface>
        )}

        {/* Уровень 2: форма */}
        <Surface>
          <BlockHead title={r ? 'Ваши данные в резерве' : 'Вступить в резерв'} note={r ? 'Можно поправить в любой момент' : 'Имя и почту возьмём из кабинета'} />
          {!state.hasContact && !r && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Нужна почта аккаунта или привязанный Telegram, чтобы мы нашли вашу запись. <Link to="/cabinet/telegram" className="font-semibold underline">Привязать Telegram</Link></p>}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="res-position" className={label}>Кем хотите работать</label>
              <input id="res-position" value={position} onChange={(e) => setPosition(e.target.value.slice(0, 120))} required placeholder="Например: младший юрист, помощник юриста" className={field} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="res-city" className={label}>Город</label>
                <input id="res-city" value={city} onChange={(e) => setCity(e.target.value.slice(0, 80))} placeholder="Москва" className={field} />
              </div>
              <div>
                <label htmlFor="res-uni" className={label}>Университет <span className="font-normal text-ink/40">по желанию</span></label>
                <input id="res-uni" value={university} onChange={(e) => setUniversity(e.target.value.slice(0, 120))} placeholder="Например: НИУ ВШЭ" className={field} />
              </div>
            </div>
            {!r && (
              <div className="rounded-2xl bg-ink/[0.04] p-4">
                <p className="mb-3 text-xs text-ink/60">Чтобы хранить ваши данные в резерве, нужно согласие. Хранить будем год, продлить или выйти можно в любой момент.</p>
                <ConsentCheck marketing={false} />
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy || (!r && !state.hasContact)} className={btnPrimary}>{busy ? 'Сохраняем…' : r ? 'Сохранить' : 'Вступить в резерв'}</button>
              {saved && !busy && <span className="text-sm font-medium text-emerald-700">Готово</span>}
            </div>
          </form>
        </Surface>
      </div>

      {/* Уровень 3: срок и выход */}
      <aside aria-label="Срок и выход" className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <Surface>
          <h2 className="text-base font-semibold">Как это работает</h2>
          <ol className="mt-3 space-y-3 text-sm text-ink/70">
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">1</span><span>Вы оставляете пожелания: должность, город, университет.</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">2</span><span>Мы предлагаем подходящие вакансии раньше открытой публикации.</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">3</span><span>Через год срок хранения закончится: продлить согласие можно здесь в один клик.</span></li>
          </ol>
        </Surface>
        {r && (
          <Surface>
            <h2 className="text-base font-semibold">Срок и выход</h2>
            <div className="mt-3 flex flex-col gap-2">
              <button type="button" onClick={() => void renew()} disabled={busy} className={closeToEnd ? btnPrimary : btnGhost}>Продлить согласие на год</button>
              {!confirmLeave ? (
                <button type="button" onClick={() => setConfirmLeave(true)} className={`rounded-full px-4 py-2 text-sm font-medium text-ink/50 hover:text-red-700 ${focusRing}`}>Выйти из резерва</button>
              ) : (
                <div className="rounded-2xl bg-red-50 p-3 text-sm">
                  <p className="text-red-800">Запись о вас будет удалена сразу. Вступить снова можно в любой момент.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void leave()} disabled={busy} className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">Да, выйти</button>
                    <button type="button" onClick={() => setConfirmLeave(false)} className={btnGhost}>Остаться</button>
                  </div>
                </div>
              )}
            </div>
          </Surface>
        )}
        <p className="px-2 text-xs leading-relaxed text-ink/45">Всё, что мы о вас храним, можно скачать или удалить в разделе «Аккаунт → Настройки».</p>
      </aside>
    </div>
  )
}

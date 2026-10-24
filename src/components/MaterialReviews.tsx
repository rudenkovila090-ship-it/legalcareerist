import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Stars } from './MaterialRating'
import { checkReviewAccess, fetchReviews, reviewsWord, submitReview, type MyReview, type PublicReview } from '../lib/materialReviews'
import ConsentCheck from './ConsentCheck'
import { CONSENT_VERSION, PUBLICATION_CONSENT_VERSION, consentOf } from '../lib/consent'

const inputClass = 'w-full rounded-lg border border-ink/15 px-4 py-2.5 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none'

// Отзывы о материале: список от покупателей + форма «Оцените материал», которая открывается по ссылке
// из письма (?review=<токен покупки>). Без ссылки форму видят только те, у кого она есть, — это защита от накрутки.
export default function MaterialReviews({ slug }: { slug: string }) {
  const [params] = useSearchParams()
  const token = params.get('review') ?? ''
  const [reviews, setReviews] = useState<PublicReview[] | null>(null)
  const [access, setAccess] = useState<'none' | 'checking' | 'ok' | 'denied'>(token ? 'checking' : 'none')
  const [mine, setMine] = useState<MyReview | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    fetchReviews(slug).then((r) => active && setReviews(r))
    return () => {
      active = false
    }
  }, [slug])

  useEffect(() => {
    if (!token) return
    let active = true
    checkReviewAccess(slug, token).then((r) => {
      if (!active) return
      setAccess(r.ok ? 'ok' : 'denied')
      setMine(r.review)
    })
    return () => {
      active = false
    }
  }, [slug, token])

  // Пришли по ссылке «Оставить отзыв» — сразу показываем форму.
  useEffect(() => {
    if (token && access !== 'checking') sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [token, access])

  const avg = reviews && reviews.length ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length : null

  return (
    <section id="reviews" ref={sectionRef} className="mt-10 scroll-mt-24">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-semibold">Отзывы покупателей</h2>
        {avg !== null && reviews && (
          <span className="flex items-center gap-2 text-sm text-ink/60">
            <Stars rating={avg} />
            <span className="font-medium text-ink">{avg.toFixed(1).replace('.', ',')}</span>
            <span>· {reviews.length} {reviewsWord(reviews.length)}</span>
          </span>
        )}
      </div>

      {access === 'ok' && <ReviewForm slug={slug} token={token} initial={mine} onSaved={() => fetchReviews(slug).then(setReviews)} />}
      {access === 'denied' && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Ссылка для отзыва не подошла. Отзыв можно оставить по ссылке из письма с материалом — только после покупки.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {reviews === null && <p className="text-sm text-ink/50">Загружаем отзывы…</p>}
        {reviews && reviews.length === 0 && (
          <p className="text-sm text-ink/60">
            Отзывов пока нет{access === 'none' ? '. Купили материал? Оставить отзыв можно по ссылке из письма.' : '.'}
          </p>
        )}
        {reviews?.map((r) => (
          <article key={`${r.date}-${r.name}`} className="glass rounded-xl p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold">{r.name}</span>
              <Stars rating={r.rating} />
              <span className="text-xs text-ink/40">{new Date(r.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            {r.text && <p className="mt-3 whitespace-pre-line text-sm text-ink/80">{r.text}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

function ReviewForm({ slug, token, initial, onSaved }: { slug: string; token: string; initial: MyReview | null; onSaved: () => void }) {
  const [rating, setRating] = useState(initial?.rating ?? 0)
  const [hover, setHover] = useState(0)
  const [text, setText] = useState(initial?.text ?? '')
  const [displayName, setDisplayName] = useState(initial?.name ?? '')
  const [publishConsent, setPublishConsent] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [missing, setMissing] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const consent = consentOf(e)
    if (!rating) return setMissing('Поставьте оценку звёздами.')
    if (!displayName.trim()) return setMissing('Укажите, как подписать отзыв: только имя, без фамилии.')
    if (!publishConsent) return setMissing('Без отдельного согласия на публикацию отзыв отправить нельзя: отзывы на сайте видны всем.')
    setMissing('')
    setState('sending')
    const ok = await submitReview(slug, {
      token,
      rating,
      text,
      displayName: displayName.trim(),
      consent,
      consentVersion: CONSENT_VERSION,
      publishConsent,
      publishConsentVersion: PUBLICATION_CONSENT_VERSION,
    })
    setState(ok ? 'done' : 'error')
    if (ok) onSaved()
  }

  if (state === 'done') {
    return (
      <div className="glass mt-5 rounded-xl p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600">✓</span>
        <div className="mt-3 font-semibold">Спасибо за отзыв!</div>
        <p className="mt-1 text-sm text-ink/60">Он уже опубликован на этой странице. Если захотите что-то изменить, откройте ссылку из письма ещё раз. Чтобы снять отзыв с сайта, напишите на <a className="underline" href="mailto:rudenkov.ilia@yandex.ru">rudenkov.ilia@yandex.ru</a>.</p>
      </div>
    )
  }

  const shown = hover || rating
  return (
    <form onSubmit={handleSubmit} className="glass mt-5 grid gap-3 rounded-xl p-6">
      <div className="font-semibold">{initial ? 'Изменить отзыв' : 'Оцените материал'}</div>
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} из 5`}
            aria-pressed={rating === n}
            onClick={() => {
              setRating(n)
              setMissing('')
            }}
            onMouseEnter={() => setHover(n)}
            className="rounded p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink/40"
          >
            <svg viewBox="0 0 20 20" className={`h-9 w-9 ${n <= shown ? 'fill-gold text-gold' : 'fill-ink/10 text-ink/10'}`}>
              <path d="M10 1.5l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6L1.4 7.7l6.1-.6z" />
            </svg>
          </button>
        ))}
        {rating > 0 && <span className="ml-2 text-sm text-ink/50">{rating} из 5</span>}
      </div>
      <textarea aria-label="Ваш отзыв (необязательно): как вам материал, что было полезно" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} placeholder="Ваш отзыв (необязательно): как вам материал, что было полезно" className={inputClass} />
      <input aria-label="Как подписать отзыв — только имя, без фамилии"
        value={displayName}
        onChange={(e) => {
          setDisplayName(e.target.value)
          setMissing('')
        }}
        maxLength={40}
        placeholder="Как подписать отзыв — только имя, без фамилии"
        className={inputClass}
      />
      <div className="grid gap-3 rounded-lg border border-ink/10 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink/50">Публикация отзыва</div>
        <p className="text-xs leading-relaxed text-ink/60">
          Отзыв появится на странице материала и будет виден всем посетителям сайта. Мы публикуем только подпись выше, оценку, текст и дату — без фамилии, телефона и почты.
        </p>
        <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-ink/70">
          <input
            type="checkbox"
            name="publishConsent"
            checked={publishConsent}
            onChange={(e) => {
              setPublishConsent(e.target.checked)
              setMissing('')
            }}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gold"
          />
          <span>
            Даю{' '}
            <Link to="/legal/consent-publication" target="_blank" className="underline hover:text-ink">отдельное согласие на распространение моих персональных данных</Link>
            {' '}— подписи, оценки и текста отзыва — на странице этого материала. Согласие можно отозвать, и отзыв будет снят с сайта.
          </span>
        </label>
      </div>
      <ConsentCheck marketing={false} />
      {missing && <p className="text-sm text-red-600">{missing}</p>}
      {state === 'error' && <p className="text-sm text-red-600">Не получилось отправить отзыв. Попробуйте ещё раз через минуту или напишите в поддержку.</p>}
      <button type="submit" disabled={state === 'sending'} className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">
        {state === 'sending' ? 'Отправляем…' : initial ? 'Сохранить отзыв' : 'Отправить отзыв'}
      </button>
    </form>
  )
}

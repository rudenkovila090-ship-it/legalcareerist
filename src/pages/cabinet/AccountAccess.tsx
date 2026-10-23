import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ConsentCheck from '../../components/ConsentCheck'
import PageHero from '../../components/PageHero'
import { consentOf, type ConsentChoice } from '../../lib/consent'
import {
  activateAccount,
  changePassword,
  fetchActivation,
  fetchMe,
  isResidentAccount,
  registerAccount,
  requestPasswordReset,
  signIn,
  type AccountError,
  type ActivationInfo,
  type CabinetUser,
} from '../../lib/cabinet'
import { sections } from './sections'
import { Card } from './ui'
import { inputClass, labelClass } from './shared'

// Вход в кабинет без пароля из почты не работает: человек регистрируется по почте, на неё приходит ссылка, а пароль он задаёт сам
// на странице по этой ссылке (так никто не занимает чужой адрес). Дальше вход — почта и пароль, «Забыли пароль» шлёт новую ссылку.

const SUPPORT_EMAIL = 'info@legalcareerist.ru'

const accountError = (code: AccountError): string =>
  ({
    bad_email: 'Проверьте адрес почты: он указан не полностью.',
    consent_required: 'Отметьте две обязательные галочки внизу формы.',
    too_many_attempts: 'Слишком много попыток. Попробуйте через час.',
    mail_failed: 'Не получилось отправить письмо. Попробуйте ещё раз через минуту.',
    mail_unavailable: `Отправка писем сейчас недоступна. Напишите нам: ${SUPPORT_EMAIL}`,
    network: 'Не получилось связаться с сервером. Попробуйте ещё раз.',
    error: 'Что-то пошло не так. Попробуйте ещё раз.',
  })[code] ?? 'Что-то пошло не так. Попробуйте ещё раз.'

const passwordError = (code: string): string =>
  ({
    password_short: 'Пароль короче 10 символов. Придумайте подлиннее: подойдёт фраза из нескольких слов.',
    password_long: 'Пароль длиннее 200 символов.',
    password_weak: 'Такой пароль слишком простой: он из списка частых или совпадает с почтой. Придумайте другой.',
    bad_credentials: 'Текущий пароль указан неверно.',
    bad_token: 'Ссылка перестала действовать. Запросите новую.',
    too_many_attempts: 'Слишком много попыток. Попробуйте позже.',
    unauthorized: 'Сессия закончилась. Войдите снова.',
    network: 'Не получилось связаться с сервером. Попробуйте ещё раз.',
  })[code] ?? 'Не получилось сохранить пароль. Попробуйте ещё раз.'

/** Секунды до повторной отправки письма: сервер шлёт на один адрес не чаще раза в минуту, поэтому кнопку на это время закрываем. */
function useCooldown(seconds: number) {
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until <= Date.now()) return
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(t)
  }, [until])
  return { left: Math.max(0, Math.ceil((until - now) / 1000)), start: () => { setNow(Date.now()); setUntil(Date.now() + seconds * 1000) } }
}

function Done({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="status" className="text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-xl text-emerald-600" aria-hidden="true">✓</div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-ink/70">{children}</div>
    </div>
  )
}

/** Показать/скрыть пароль: на телефоне опечатку в скрытом поле не заметить, а повторный ввод только раздражает. */
function PasswordField({ value, onChange, label, autoComplete, hint }: { value: string; onChange: (v: string) => void; label: string; autoComplete: 'new-password' | 'current-password'; hint?: string }) {
  const [shown, setShown] = useState(false)
  return (
    <div>
      <label className={labelClass}>
        {label}
        <div className="relative mt-1.5">
          <input value={value} onChange={(e) => onChange(e.target.value)} type={shown ? 'text' : 'password'} autoComplete={autoComplete} required minLength={autoComplete === 'new-password' ? 10 : undefined} maxLength={200} className={`${inputClass} pr-24`} />
          <button type="button" onClick={() => setShown((v) => !v)} aria-pressed={shown} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-xs font-semibold text-ink/50 hover:text-ink">
            {shown ? 'Скрыть' : 'Показать'}
          </button>
        </div>
      </label>
      {hint && <p className="mt-1.5 text-xs text-ink/50">{hint}</p>}
    </div>
  )
}

const PASSWORD_HINT = 'Не короче 10 символов. Лучше фраза из нескольких слов; частые пароли и почта не подойдут.'

const submitClass = 'rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60'

type Mode = 'login' | 'register' | 'forgot'

// ---- Страница входа ----
export function Landing({ notice, onSignedIn }: { notice?: string; onSignedIn: (user: CabinetUser) => void }) {
  const [params] = useSearchParams()
  const asked = params.get('mode')
  const [mode, setMode] = useState<Mode>(asked === 'register' || asked === 'forgot' ? asked : 'login')

  const ready = sections.filter((s) => s.ready)

  return (
    <div>
      <PageHero
        eyebrow="Личный кабинет"
        title="Личный кабинет"
        description="Покупки и билеты, подписка на сообщество, профиль и документы в одном месте. Войдите по почте, которую указывали при покупке: так мы найдём ваши оплаты."
      />
      <div className="container-page grid gap-6 py-12 lg:grid-cols-[1fr_24rem]">
        <section className="glass h-fit rounded-2xl p-6">
          <h2 className="text-xl font-semibold">Что доступно сейчас</h2>
          <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm text-ink/80 sm:grid-cols-2">
            {ready.map((s) => (
              <li key={s.id} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                {s.title}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-ink/60">Остальные разделы — отклики и интервью, карьерный план, оценка рынка — подключаем по очереди.</p>
          <p className="mt-5 border-t border-ink/10 pt-4 text-xs text-ink/50">
            Пароль вы задаёте сами по ссылке из письма. Мы храним его только в зашифрованном виде и не можем его прочитать.
            Данные кабинета не попадают в Яндекс Метрику.
          </p>
        </section>

        {/* на телефоне форма выше списка: человек пришёл войти */}
        <div className="glass order-first h-fit rounded-2xl p-6 lg:order-none">
          {mode !== 'forgot' && (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-ink/[0.06] p-1" role="tablist" aria-label="Вход или регистрация">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-full py-2 text-sm font-semibold transition-colors ${mode === m ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink'}`}
                >
                  {m === 'login' ? 'Вход' : 'Регистрация'}
                </button>
              ))}
            </div>
          )}
          {mode === 'login' && <LoginForm notice={notice} onSignedIn={onSignedIn} onForgot={() => setMode('forgot')} onRegister={() => setMode('register')} />}
          {mode === 'register' && <RegisterForm onLogin={() => setMode('login')} />}
          {mode === 'forgot' && <ForgotForm onBack={() => setMode('login')} />}
        </div>
      </div>
    </div>
  )
}

function LoginForm({ notice, onSignedIn, onForgot, onRegister }: { notice?: string; onSignedIn: (user: CabinetUser) => void; onForgot: () => void; onRegister: () => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(notice ?? '')
  const [failed, setFailed] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setFailed(false)
    const r = await signIn(login.trim(), password)
    if (!r.ok) {
      setBusy(false)
      setFailed(r.error === 'bad_credentials')
      setError(
        r.error === 'too_many_attempts' ? 'Слишком много попыток. Попробуйте через 15 минут.'
        : r.error === 'not_configured' ? 'Вход пока не настроен.'
        : r.error === 'network' ? 'Не получилось связаться с сервером. Попробуйте ещё раз.'
        : 'Неверная почта или пароль.',
      )
      return
    }
    const me = await fetchMe()
    setBusy(false)
    if (me.state === 'authed') onSignedIn(me.user)
    else setError('Вход выполнен, но кабинет не открылся. Обновите страницу.')
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div>
        <label className={labelClass} htmlFor="cabinet-login">Почта</label>
        <input id="cabinet-login" value={login} onChange={(e) => setLogin(e.target.value)} type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="name@example.ru" autoComplete="username" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="cabinet-password">Пароль</label>
        <input id="cabinet-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required className={inputClass} />
      </div>
      {error && (
        <div role="alert" className="text-sm text-red-600">
          <p>{error}</p>
          {failed && (
            <p className="mt-1 text-ink/60">
              Ещё не регистрировались или не успели задать пароль по ссылке из письма?{' '}
              <button type="button" onClick={onRegister} className="font-semibold underline hover:text-ink">Зарегистрируйтесь</button>: мы вышлем новое письмо.
            </p>
          )}
        </div>
      )}
      <button type="submit" disabled={busy} className={submitClass}>{busy ? 'Входим…' : 'Войти'}</button>
      <button type="button" onClick={onForgot} className="justify-self-start text-sm font-medium text-ink/60 underline hover:text-ink">Забыли пароль?</button>
    </form>
  )
}

interface Submitted {
  email: string
  name: string
  consent: ConsentChoice
}

function RegisterForm({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<Submitted | null>(null)
  const cooldown = useCooldown(60)

  async function send(input: Submitted) {
    setBusy(true)
    setError('')
    const r = await registerAccount(input)
    setBusy(false)
    if (!r.ok) {
      setError(accountError(r.error))
      return false
    }
    setSent(input)
    cooldown.start()
    return true
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // галочки читаются до первого await: после него браузер уже не даёт обратиться к форме события
    const consent = consentOf(e)
    void send({ email: email.trim(), name: name.trim(), consent })
  }

  if (sent) {
    return (
      <Done title="Проверьте почту">
        <p>Мы отправили письмо на <b className="break-words text-ink">{sent.email}</b>. В нём ссылка, по которой вы задаёте пароль и сразу входите в кабинет. Она действует 24 часа.</p>
        <p>Письма нет? Загляните в «Спам» или подождите минуту и отправьте снова. Если для этого адреса кабинет уже создан, ссылка в письме поможет войти.</p>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button type="button" disabled={busy || cooldown.left > 0} onClick={() => void send(sent)} className="rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold text-ink/70 hover:text-ink disabled:opacity-50">
            {cooldown.left > 0 ? `Отправить снова через ${cooldown.left} с` : busy ? 'Отправляем…' : 'Отправить снова'}
          </button>
          <button type="button" onClick={() => setSent(null)} className="rounded-full px-5 py-2 text-sm font-semibold text-ink/50 hover:text-ink">Другой адрес</button>
        </div>
      </Done>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div>
        <label className={labelClass} htmlFor="reg-name">Как к вам обращаться</label>
        <input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} type="text" autoComplete="name" maxLength={80} placeholder="Имя, по желанию" className={inputClass} />
      </div>
      <div>
        <label className={labelClass} htmlFor="reg-email">Почта</label>
        <input id="reg-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="name@example.ru" className={inputClass} />
        <p className="mt-1.5 text-xs text-ink/50">Укажите ту же почту, что при покупке: по ней мы найдём билеты и подписку.</p>
      </div>
      <ConsentCheck />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={submitClass}>{busy ? 'Отправляем…' : 'Получить ссылку для входа'}</button>
      <p className="text-xs text-ink/50">
        Пароль придумаете на следующем шаге. Уже есть кабинет?{' '}
        <button type="button" onClick={onLogin} className="font-semibold underline hover:text-ink">Войти</button>
      </p>
    </form>
  )
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')
  const cooldown = useCooldown(60)

  async function send(address: string) {
    setBusy(true)
    setError('')
    const r = await requestPasswordReset(address)
    setBusy(false)
    if (!r.ok) {
      setError(accountError(r.error))
      return
    }
    setSent(address)
    cooldown.start()
  }

  if (sent) {
    return (
      <Done title="Проверьте почту">
        <p>Если для <b className="break-words text-ink">{sent}</b> есть кабинет, мы отправили ссылку для нового пароля. Она действует 2 часа.</p>
        <p>Письма нет? Загляните в «Спам». Если вы ещё не регистрировались, вернитесь ко входу и откройте вкладку «Регистрация».</p>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button type="button" disabled={busy || cooldown.left > 0} onClick={() => void send(sent)} className="rounded-full border border-ink/15 px-5 py-2 text-sm font-semibold text-ink/70 hover:text-ink disabled:opacity-50">
            {cooldown.left > 0 ? `Отправить снова через ${cooldown.left} с` : busy ? 'Отправляем…' : 'Отправить снова'}
          </button>
          <button type="button" onClick={onBack} className="rounded-full px-5 py-2 text-sm font-semibold text-ink/50 hover:text-ink">Ко входу</button>
        </div>
      </Done>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void send(email.trim())
      }}
      className="grid gap-4"
    >
      <div>
        <h2 className="text-lg font-semibold">Восстановление пароля</h2>
        <p className="mt-1 text-sm text-ink/60">Укажите почту кабинета. Мы отправим ссылку, по которой можно задать новый пароль.</p>
      </div>
      <div>
        <label className={labelClass} htmlFor="forgot-email">Почта</label>
        <input id="forgot-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="name@example.ru" className={inputClass} />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={submitClass}>{busy ? 'Отправляем…' : 'Отправить ссылку'}</button>
      <button type="button" onClick={onBack} className="justify-self-start text-sm font-medium text-ink/60 underline hover:text-ink">← Назад ко входу</button>
    </form>
  )
}

// ---- Страница по ссылке из письма: /cabinet/activate?token=… ----
export function ActivatePage({ onSignedIn }: { onSignedIn: (user: CabinetUser) => void }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [link, setLink] = useState<{ state: 'loading' } | { state: 'invalid' } | { state: 'error' } | { state: 'ok'; info: ActivationInfo }>({ state: 'loading' })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let active = true
    fetchActivation(token).then((r) => active && setLink(r))
    return () => {
      active = false
    }
  }, [token])

  const state = token ? link : { state: 'invalid' as const }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await activateAccount(token, password)
    if (!r.ok) {
      setBusy(false)
      if (r.error === 'bad_token') setLink({ state: 'invalid' })
      else setError(passwordError(r.error))
      return
    }
    const me = await fetchMe()
    setBusy(false)
    if (me.state !== 'authed') {
      setError('Пароль сохранён, но кабинет не открылся. Войдите на странице входа.')
      return
    }
    onSignedIn(me.user)
    // адрес без одноразовой ссылки: она уже использована и не должна оставаться в истории браузера
    navigate('/cabinet', { replace: true })
  }

  const info = state.state === 'ok' ? state.info : null

  return (
    <div>
      <PageHero eyebrow="Личный кабинет" title={info ? (info.purpose === 'reset' ? 'Новый пароль' : 'Задайте пароль') : 'Ссылка из письма'} />
      <div className="container-page py-12">
        <div className="glass mx-auto max-w-md rounded-2xl p-6">
          {state.state === 'loading' && <p className="text-center text-sm text-ink/50">Проверяем ссылку…</p>}
          {state.state === 'error' && <p className="text-center text-sm text-ink/60">Не получилось связаться с сервером. Обновите страницу через минуту.</p>}
          {state.state === 'invalid' && (
            <div className="space-y-3 text-sm text-ink/70">
              <h2 className="text-lg font-semibold text-ink">Ссылка не действует</h2>
              <p>Её уже использовали или срок вышел: ссылка для первого пароля живёт 24 часа, для восстановления — 2 часа.</p>
              <p>
                Если вы ещё не задавали пароль, <Link to="/cabinet?mode=register" replace className="font-semibold underline hover:text-ink">зарегистрируйтесь заново</Link>: мы вышлем новое письмо.
                Если пароль забыт, <Link to="/cabinet?mode=forgot" replace className="font-semibold underline hover:text-ink">восстановите его</Link>.
              </p>
            </div>
          )}
          {info && (
            <form onSubmit={handleSubmit} className="grid gap-4">
              <p className="text-sm text-ink/70">
                {info.purpose === 'reset' ? 'Новый пароль для ' : 'Придумайте пароль для входа. Почта: '}
                <b className="break-words text-ink">{info.email}</b>
                {info.purpose === 'reset' ? '. После сохранения вы войдёте в кабинет, а на других устройствах вход закроется.' : '. После сохранения вы сразу окажетесь в кабинете.'}
              </p>
              {/* Скрытое поле с почтой: менеджеры паролей сохраняют пароль вместе с логином. */}
              <input type="text" name="username" value={info.email} autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
              <PasswordField value={password} onChange={setPassword} label="Пароль" autoComplete="new-password" hint={PASSWORD_HINT} />
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={busy} className={submitClass}>{busy ? 'Сохраняем…' : 'Сохранить пароль и войти'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Раздел «Вход и пароль» ----
export function PasswordSection({ user }: { user: CabinetUser }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  if (!isResidentAccount(user)) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Вход администратора</h2>
        <p className="mt-2 text-sm text-ink/70">Вы вошли как администратор проекта. Логин и пароль администратора задаются в настройках сервера, а не здесь.</p>
      </Card>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    const r = await changePassword(current, next)
    setBusy(false)
    if (!r.ok) {
      setError(passwordError(r.error))
      return
    }
    setCurrent('')
    setNext('')
    setSaved(true)
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">Как вы входите</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
            <dt className="text-ink/70">Почта для входа</dt>
            <dd className="break-words font-medium">{user.email}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-ink/50">Подписка и билеты находятся по этой почте. Если вы покупали с другого адреса, напишите нам: {SUPPORT_EMAIL}.</p>
      </Card>

      <form onSubmit={handleSubmit} className="glass space-y-4 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Сменить пароль</h2>
        <input type="text" name="username" value={user.email ?? ''} autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
        <PasswordField value={current} onChange={setCurrent} label="Текущий пароль" autoComplete="current-password" />
        <PasswordField value={next} onChange={setNext} label="Новый пароль" autoComplete="new-password" hint={PASSWORD_HINT} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy} className={submitClass}>{busy ? 'Сохраняем…' : 'Сменить пароль'}</button>
          {saved && <span role="status" className="text-sm font-medium text-emerald-700">Пароль изменён. На других устройствах вход закрыт.</span>}
        </div>
        <p className="text-xs text-ink/50">Не помните текущий? Выйдите и нажмите «Забыли пароль» на странице входа: мы пришлём ссылку на почту.</p>
      </form>
    </div>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { fetchActivity, setMarketing, updateContact, isResidentAccount, type ActivityEntry, type CabinetUser } from '../../lib/cabinet'
import { icon } from './sections'
import { Avatar, Card, Chip, IconBubble, Switch } from './ui'
import { dayTitle, fieldClass, labelClass, longDate, roleOf, timeOfDay } from './shared'
import { activityIcon, activityLabel } from './activityInfo'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40'
const primaryButton = 'rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60'

// ---- Личные данные и контакты ----
export function ProfileInfoSection({ user, onSaved }: { user: CabinetUser; onSaved: () => Promise<void> }) {
  const resident = isResidentAccount(user)
  const role = roleOf(user)
  const [name, setName] = useState(user.contact.name)
  const [phone, setPhone] = useState(user.contact.phone)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    const r = await updateContact(name, phone)
    if (!r.ok) {
      setBusy(false)
      setError(r.error === 'bad_phone' ? 'Телефон указан неверно: нужны цифры, можно с +, пробелами и скобками (7–15 цифр).' : r.error === 'network' ? 'Не получилось связаться с сервером. Попробуйте ещё раз.' : 'Не получилось сохранить. Попробуйте ещё раз.')
      return
    }
    setName(r.data.contact.name)
    setPhone(r.data.contact.phone)
    await onSaved()
    setBusy(false)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <Avatar name={user.contact.name || user.name} email={user.contact.email} size="lg" />
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold">{user.contact.name || user.name}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip tone={role.tone === 'gold' ? 'good' : 'muted'}>{role.label}</Chip>
            {user.memberSince && <Chip>В кабинете с {longDate(user.memberSince)}</Chip>}
          </div>
          <p className="mt-3 text-sm text-ink/60">Аватар строится из ваших инициалов. Загрузку фото мы добавим позже.</p>
        </div>
      </Card>

      {resident ? (
        <form onSubmit={handleSubmit} className="glass space-y-5 rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Личные данные</h2>
          <div>
            <label htmlFor="pi-name" className={labelClass}>Как к вам обращаться</label>
            <input id="pi-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Имя и фамилия" className={fieldClass} />
            <p className="mt-1.5 text-xs text-ink/50">Имя видите только вы и мы; оно попадает в письма и на билеты.</p>
          </div>
          <div>
            <label htmlFor="pi-phone" className={labelClass}>Телефон для связи</label>
            <input id="pi-phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" maxLength={25} autoComplete="tel" placeholder="+7 900 000-00-00" className={fieldClass} />
            <p className="mt-1.5 text-xs text-ink/50">Необязательно. Нужен только для связи с вами; по телефону подписка и билеты не ищутся.</p>
          </div>
          <div>
            <label htmlFor="pi-email" className={labelClass}>Почта (она же логин)</label>
            <div className="relative">
              <input id="pi-email" value={user.contact.email} readOnly className={`${fieldClass} bg-ink/[0.04] pr-28 text-ink/70`} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2"><Chip tone="good">Подтверждена</Chip></span>
            </div>
            <p className="mt-1.5 text-xs text-ink/50">Чтобы сменить почту, напишите в <Link to="/cabinet/support" className="underline hover:text-ink">чат поддержки</Link>: мы проверим новый адрес письмом.</p>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy} className={primaryButton}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
            {saved && <span role="status" className="text-sm font-medium text-emerald-700">Сохранено</span>}
          </div>
        </form>
      ) : (
        <Card>
          <h2 className="text-lg font-semibold">Личные данные администратора</h2>
          <p className="mt-2 text-sm text-ink/70">Имя, почта и телефон администратора задаются в настройках сервера, поэтому здесь они только для просмотра.</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <ReadRow label="Имя" value={user.contact.name || user.name} />
            <ReadRow label="Почта" value={user.contact.email} />
            <ReadRow label="Телефон" value={user.contact.phone} />
          </dl>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-semibold">Контактная информация</h2>
        <ul className="mt-4 space-y-3">
          <ContactRow icon={icon.mail} label="Почта" value={user.contact.email || '—'} note="сюда приходят билеты, чеки и ответы поддержки" />
          <ContactRow icon={icon.phone} label="Телефон" value={user.contact.phone || 'Не указан'} />
          <ContactRow icon={icon.telegram} label="Telegram" value={user.telegram.linked ? user.telegram.name || 'Привязан' : 'Не привязан'} to="/cabinet/telegram" linkText={user.telegram.linked ? 'Управлять' : user.telegram.canLink ? 'Привязать' : undefined} />
        </ul>
      </Card>
    </div>
  )
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink/50">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  )
}

function ContactRow({ icon: ic, label, value, note, to, linkText }: { icon: React.ReactNode; label: string; value: string; note?: string; to?: string; linkText?: string }) {
  return (
    <li className="flex items-center gap-3">
      <IconBubble tone="soft">{ic}</IconBubble>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-ink/50">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
        {note && <div className="text-xs text-ink/50">{note}</div>}
      </div>
      {to && linkText && <Link to={to} className={`shrink-0 rounded text-sm font-medium text-gold hover:text-ink ${focusRing}`}>{linkText}</Link>}
    </li>
  )
}

// ---- История действий ----
export function ActivitySection() {
  const [items, setItems] = useState<ActivityEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    fetchActivity().then((r) => {
      if (!active) return
      if (r.ok) setItems(r.data.activity)
      else setFailed(true)
    })
    return () => {
      active = false
    }
  }, [])

  if (failed) return <Card><p className="text-sm text-ink/60">Не получилось загрузить журнал. Обновите страницу через минуту.</p></Card>
  if (!items) return <Card><p className="text-sm text-ink/50">Загружаем…</p></Card>

  // Группируем по дням: «Сегодня», «Вчера», дата.
  const days: { title: string; entries: ActivityEntry[] }[] = []
  for (const entry of items) {
    const title = dayTitle(entry.at)
    const last = days.at(-1)
    if (last?.title === title) last.entries.push(entry)
    else days.push({ title, entries: [entry] })
  }

  return (
    <div className="space-y-6">
      {days.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <IconBubble tone="soft">{icon.history}</IconBubble>
          <p className="text-sm text-ink/60">Здесь появятся ваши действия: входы, смена пароля, загрузка документов.</p>
        </Card>
      )}
      {days.map((day) => (
        <section key={day.title} aria-label={day.title}>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink/40">{day.title}</h2>
          <ul className="glass divide-y divide-ink/10 rounded-2xl">
            {day.entries.map((e) => (
              <li key={`${e.at}-${e.kind}`} className="flex items-center gap-3 px-4 py-3.5">
                <IconBubble tone="soft">{activityIcon(e.kind)}</IconBubble>
                <span className="min-w-0 flex-1 text-sm font-medium">{activityLabel(e)}</span>
                <time className="shrink-0 text-xs tabular-nums text-ink/50" dateTime={new Date(e.at).toISOString()}>{timeOfDay(e.at)}</time>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="px-1 text-xs text-ink/50">Журнал виден только вам и хранится год, потом записи удаляются. Мы не записываем адреса, с которых вы заходили, и данные браузера. Если среди записей есть то, чего вы не делали, <Link to="/cabinet/password" className="underline hover:text-ink">смените пароль</Link>.</p>
    </div>
  )
}

// ---- Настройки ----
export function SettingsSection({ user, onRefresh }: { user: CabinetUser; onRefresh: () => Promise<void> }) {
  const resident = isResidentAccount(user)
  const marketing = user.consents.marketing
  const [pending, setPending] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const on = pending ?? marketing === true

  async function toggle(value: boolean) {
    setBusy(true)
    setPending(value)
    setNote('')
    const r = await setMarketing(value)
    if (!r.ok) setNote('Не получилось сохранить. Попробуйте ещё раз.')
    await onRefresh()
    setPending(null)
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <Group title="Уведомления">
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Рекламные и информационные сообщения</div>
            <p className="mt-1 max-w-md text-xs text-ink/60">О мероприятиях, материалах и сообществе. Служебные сообщения (оплата, билет, напоминание о мероприятии) приходят всегда.</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`text-sm font-medium ${on ? 'text-emerald-700' : 'text-ink/50'}`}>{on ? 'Включены' : 'Выключены'}</span>
            <Switch checked={on} onChange={toggle} label="Рекламные и информационные сообщения" disabled={busy} />
          </div>
        </div>
        {note && <p role="status" className="px-4 pb-3 text-sm text-red-600">{note}</p>}
      </Group>

      <Group title="Конфиденциальность">
        <NavRow to="/cabinet/privacy" icon={icon.lock} title="Скрытый поиск" note="Резюме не видно работодателям, пока вы не откликнулись" value={user.privacy.hidden ? 'Включён' : 'Выключен'} good={user.privacy.hidden} />
        <NavRow to="/cabinet/visibility" icon={icon.eye} title="Что видит работодатель" note="Какие данные видны, а какие остаются только у вас" />
      </Group>

      <Group title="Безопасность">
        {resident && <NavRow to="/cabinet/password" icon={icon.lock} title="Пароль" note="Сменить пароль для входа" />}
        <NavRow to="/cabinet/telegram" icon={icon.telegram} title="Telegram" note="Код из бота, привязка и отвязка" value={user.telegram.linked ? 'Привязан' : 'Не привязан'} good={user.telegram.linked} />
        <NavRow to="/cabinet/activity" icon={icon.history} title="История действий" note="Входы и изменения в вашем кабинете" />
      </Group>

      <Group title="Данные">
        <NavRow to="/cabinet/mydata" icon={icon.download} title="Скачать мои данные" note="Всё, что мы о вас храним, одним файлом" />
        <NavRow to="/cabinet/mydata" icon={icon.shield} title="Запросить удаление данных" note="Платёжные сведения обезличиваются, а не удаляются" />
        <NavRow to="/cabinet/consents" icon={icon.check} title="Согласия" note="Что и когда вы подтвердили" />
      </Group>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink/40">{title}</h2>
      <div className="glass divide-y divide-ink/10 rounded-2xl">{children}</div>
    </section>
  )
}

function NavRow({ to, icon: ic, title, note, value, good }: { to: string; icon: React.ReactNode; title: string; note: string; value?: string; good?: boolean }) {
  return (
    <Link to={to} className={`flex items-center gap-3 px-4 py-3.5 first:rounded-t-2xl last:rounded-b-2xl hover:bg-ink/[0.04] ${focusRing}`}>
      <IconBubble tone="soft">{ic}</IconBubble>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="truncate text-xs text-ink/50">{note}</div>
      </div>
      {value && <Chip tone={good ? 'good' : 'muted'}>{value}</Chip>}
      <span className="shrink-0 text-ink/30" aria-hidden="true">›</span>
    </Link>
  )
}

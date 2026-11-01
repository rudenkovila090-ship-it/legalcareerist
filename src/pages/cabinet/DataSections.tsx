import { useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadMyData, requestDeletion, setMarketing, type CabinetUser } from '../../lib/cabinet'
import { Card, Switch } from './ui'
import { longDate } from './shared'

// ---- Согласия и рассылки ----
export function ConsentsSection({ user, onRefresh }: { user: CabinetUser; onRefresh: () => Promise<void> }) {
  const c = user.consents
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // Переключатель двигается сразу, не дожидаясь ответа сервера; при ошибке возвращается назад.
  const [pending, setPending] = useState<boolean | null>(null)
  const on = pending ?? c.marketing === true

  async function change(value: boolean) {
    setBusy(true)
    setPending(value)
    setNote('')
    const r = await setMarketing(value)
    if (!r.ok) setNote('Не получилось сохранить. Попробуйте ещё раз.')
    else if (!r.data.applied) setNote('Решение записано. Рассылки идут через Telegram-бота: откройте его и нажмите Start, чтобы сообщения доходили.')
    await onRefresh()
    setPending(null)
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">Обязательные согласия</h2>
        <p className="mt-1 text-sm text-ink/60">Без них сервис не может работать с вашими данными.</p>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Ознакомление с Политикой и согласие на обработку данных в Telegram-боте" value={c.processingAt ? `Дано ${longDate(c.processingAt)}` : 'Не давали'} ok={Boolean(c.processingAt)} />
          <Row label="То же при сохранении профиля в кабинете" value={c.profileAt ? `Дано ${longDate(c.profileAt)}` : 'Профиль ещё не сохраняли'} ok={Boolean(c.profileAt)} />
        </dl>
        <p className="mt-4 text-xs text-ink/50">
          Документы: <Link to="/legal/privacy" className="underline" target="_blank">Политика</Link>, <Link to="/legal/consent" className="underline" target="_blank">Согласие на обработку</Link>.
          Отозвать согласие на обработку можно, запросив удаление данных в разделе <Link to="/cabinet/mydata" className="underline">«Мои данные»</Link>.
        </p>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Реклама и информационные сообщения</h2>
            <p className="mt-1 max-w-xl text-sm text-ink/60">О мероприятиях, материалах и сообществе — в Telegram-боте. Согласие по желанию, его можно отозвать в любой момент.</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`text-sm font-medium ${on ? 'text-emerald-700' : 'text-ink/50'}`}>{on ? 'Включено' : 'Выключено'}</span>
            <Switch checked={on} onChange={change} label="Рекламные и информационные сообщения" disabled={busy} />
          </div>
        </div>
        <p className="mt-3 text-sm text-ink/60">
          {c.marketing === null ? 'Вы пока не отвечали на этот вопрос — по умолчанию рассылки выключены.' : c.marketingAt ? `Решение принято ${longDate(c.marketingAt)}` : ''}
        </p>
        {note && <p role="status" className="mt-2 text-sm text-ink/70">{note}</p>}
        <p className="mt-4 text-xs text-ink/50">
          Текст согласия: <Link to="/legal/marketing-consent" className="underline" target="_blank">условия рассылки</Link>. Служебные сообщения (оплата, билет, напоминание о мероприятии) приходят независимо от этого выключателя: это не реклама.
        </p>
      </Card>
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
      <dt className="max-w-md text-ink/70">{label}</dt>
      <dd className={`font-medium ${ok ? 'text-emerald-700' : 'text-ink/50'}`}>{value}</dd>
    </div>
  )
}

// ---- Мои данные ----
export function MyDataSection() {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function download() {
    setDownloading(true)
    setDownloadError(false)
    setDownloadError(!(await downloadMyData()))
    setDownloading(false)
  }

  async function sendRequest() {
    setSending(true)
    setError('')
    const r = await requestDeletion()
    setSending(false)
    if (!r.ok) return setError('Не получилось отправить запрос. Попробуйте ещё раз.')
    setSentAt(r.data.at)
    setConfirm(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">Скачать мои данные</h2>
        <p className="mt-1 max-w-xl text-sm text-ink/60">Один файл со всем, что мы о вас храним: карточка в Telegram-боте, подписка, регистрации на мероприятия, профиль кабинета и журнал ваших согласий.</p>
        <button type="button" onClick={download} disabled={downloading} className="mt-4 rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">
          {downloading ? 'Готовим файл…' : 'Скачать файл (JSON)'}
        </button>
        {downloadError && <p role="alert" className="mt-2 text-sm text-red-600">Не получилось подготовить файл. Попробуйте ещё раз.</p>}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Удалить мои данные</h2>
        <p className="mt-1 max-w-xl text-sm text-ink/60">
          Мы удалим карточку в боте, профиль и заявки. Сведения об оплатах закон велит хранить дольше: мы оставим только сумму и дату, стерев имя и контакты.
          Подписка и доступ к сообществу после удаления пропадут.
        </p>
        {sentAt ? (
          <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Запрос отправлен {longDate(sentAt)} Администратор подтвердит удаление.</p>
        ) : confirm ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50/50 p-4">
            <p className="text-sm font-medium text-red-700">Вы точно хотите удалить свои данные?</p>
            <div className="mt-3 flex gap-3">
              <button type="button" onClick={sendRequest} disabled={sending} className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">{sending ? 'Отправляем…' : 'Да, удалить'}</button>
              <button type="button" onClick={() => setConfirm(false)} className="rounded-full border border-ink/20 px-5 py-2 text-sm font-semibold text-ink/70 hover:text-ink">Отмена</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="mt-4 rounded-full border border-red-300 px-6 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">Запросить удаление</button>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>
    </div>
  )
}

// ---- Что видит работодатель ----
export function VisibilitySection() {
  return (
    <div className="space-y-6">
      <Card>
        <span className="inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Правила уточняются</span>
        <p className="mt-3 max-w-2xl text-sm text-ink/70">
          Сейчас работодатели не видят ничего из кабинета: у них нет доступа. Ниже — правила, по которым мы будем открывать данные, когда он появится.
        </p>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-emerald-700">Работодатель видит</h2>
          <p className="mt-1 text-xs text-ink/50">Только после вашего отклика на его вакансию.</p>
          <ul className="mt-4 space-y-2 text-sm text-ink/80">
            <li>Имя и практики</li>
            <li>Опыт: уровень, стаж, судебная практика, сделки, проекты, языки</li>
            <li>Резюме — версия, которую вы выбрали для этого отклика</li>
            <li>Город и формат работы</li>
          </ul>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-ink">Остаётся только у вас</h2>
          <ul className="mt-4 space-y-2 text-sm text-ink/80">
            <li>Контакты (телефон, почта, Telegram) — пока вы сами не отправите их в отклике или чате</li>
            <li>Зарплатная вилка — пока вы сами не решите её раскрыть</li>
            <li>Режим конфиденциальности и список компаний, от которых вы скрылись</li>
            <li>Другие ваши отклики и вся история переписки с другими компаниями</li>
            <li>Подписка, оплаты, согласия и данные для сообщества</li>
            <li>Достижения, профессиональный капитал и карьерный план</li>
          </ul>
        </Card>
      </div>
      <p className="text-xs text-ink/50">Режим скрытого поиска и список компаний — в разделе <Link to="/cabinet/privacy" className="underline">«Конфиденциальность»</Link>.</p>
    </div>
  )
}

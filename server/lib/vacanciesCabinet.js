// Вкладка «Вакансии» личного кабинета: мои отклики, чат с рекрутером по каждой вакансии, уведомления и кадровый резерв.
// Маршруты /api/account/applications, /recruiter, /notifications, /reserve. Всё, что умеет Telegram и почта (отправка, ответы
// админа), приходит из server/index.js через deps, чтобы модуль не зависел от бота и проверялся отдельно.
//
// Как это связано с ботом:
//  • сообщение человека в чате вакансии уходит админу в бота; админ отвечает «Ответить» (Reply), ответ попадает в чат
//    (deliverRecruiterReply) и приходит человеком уведомлением в кабинет и в Telegram;
//  • статус отклика админ меняет кнопками в карточке отклика (notifyApplicationStatus), человек получает уведомление;
//  • отзыв отклика и вступление в кадровый резерв из кабинета приходят админу в бота.
import { accountApplications, accountKeys, accountReserve } from './accountData.js'
import { APPLICATION_STATUSES, getApplication, setApplicationStatus, statusOf } from './candidateApplications.js'
import { addNotification, getNotificationSettings, listNotifications, markNotificationsRead, setNotificationSettings, unreadNotifications } from './accountNotifications.js'
import { addRecruiterReply, addUserMessage, getThread, linkAdminMessage, listThreads, markSeen, MAX_TEXT } from './recruiterChat.js'
import { createReserveCandidate, deleteReserveCandidate, getReserveCandidate, listReserve, renewReserveCandidate, updateReserveCandidate } from './reserve.js'
import { getProfile } from './accountStore.js'
import { contextOf, getAccount, listAccounts } from './accountUsers.js'
import { personKeys } from './consentLog.js'
import { composeCabinetNoticeMail } from './accountMail.js'

const HOUR_MS = 3600 * 1000
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const intersects = (a, b) => [...a].some((k) => b.has(k))

const STATUS_NOTICE = {
  forwarded: (t) => ({ title: 'Отклик передан работодателю', text: `Ваш отклик на вакансию «${t}» передан работодателю.` }),
  interview: (t) => ({ title: 'Приглашение на собеседование', text: `По вакансии «${t}» работодатель приглашает на собеседование. Детали уточнит рекрутер: загляните в чат по этой вакансии.` }),
  offer: (t) => ({ title: 'Оффер', text: `Поздравляем! По вакансии «${t}» вам сделали предложение о работе.` }),
  rejected: (t) => ({ title: 'Ответ по отклику', text: `По вакансии «${t}» работодатель пока не готов двигаться дальше. Загляните в другие вакансии или вступите в кадровый резерв.` }),
}

export function registerVacanciesCabinet(app, deps) {
  const { requireAccount, hitLimit, readVacancyCatalog, sendTelegram, sendTelegramMessage, mailConfigured, sendMail, accountIdentity, logActivity, recordConsent, consentVersion, siteUrl, botReady, adminChatId } = deps
  const chatAttempts = new Map()
  const withdrawAttempts = new Map()
  const reserveAttempts = new Map()

  const catalog = () => readVacancyCatalog().filter((v) => v.slug && !v.technicalExample)
  const vacancyBySlug = (slug) => catalog().find((v) => v.slug === slug) ?? null

  /** Уведомление в ленту кабинета и, если нужно, копия в Telegram (или на почту, когда Telegram не привязан). */
  async function notifyAccount(login, note, { telegram = true, email = false } = {}) {
    const item = addNotification(login, note)
    const account = String(login).startsWith('u:') ? getAccount(String(login).slice(2)) : null
    const url = `${siteUrl}${item.link}`
    let sentTelegram = false
    let sentEmail = false
    if (account && telegram && account.tgUserId && getNotificationSettings(login).telegram) {
      sentTelegram = await sendTelegramMessage(account.tgUserId, `🔔 ${item.title}\n\n${item.text}`, [[{ text: 'Открыть в кабинете', url }]]).catch(() => false)
    }
    if (account && email && !sentTelegram && mailConfigured()) {
      const mail = composeCabinetNoticeMail({ name: account.name, title: item.title, text: item.text, link: url })
      sentEmail = (await sendMail({ to: account.email, subject: mail.subject, text: mail.text, html: mail.html }).catch(() => ({ ok: false }))).ok === true
    }
    return { item, telegram: sentTelegram, email: sentEmail }
  }

  /** Аккаунты, чья почта или Telegram совпали с контактами записи (отклик, заявка): им придёт уведомление. */
  function loginsFor({ email, phone, telegram }) {
    const wanted = personKeys({ email, phone, telegram })
    return listAccounts().filter((a) => a.passwordHash && !a.deletedAt && intersects(accountKeys(contextOf(a)), wanted)).map((a) => `u:${a.id}`)
  }

  /** Админ сменил статус отклика: записываем и сообщаем человеку. Возвращает обновлённый отклик или null. */
  async function notifyApplicationStatus(number, status) {
    const before = getApplication(number)
    if (!before || statusOf(before) === status) return setApplicationStatus(number, status) ?? null
    const updated = setApplicationStatus(number, status)
    if (!updated) return null
    const make = STATUS_NOTICE[status]
    if (make) {
      const note = make(updated.vacancyTitle || updated.vacancySlug || 'вакансия')
      for (const login of loginsFor(updated)) await notifyAccount(login, { kind: 'application_status', ...note, link: '/cabinet/applications' }, { email: true })
    }
    return updated
  }

  /** Ответ админа (Reply в боте) на сообщение из чата вакансии: ложится в чат, человек получает уведомление. */
  async function deliverRecruiterReply(adminChatIdNow, thread, text) {
    const r = addRecruiterReply(thread.login, thread.slug, text)
    if (r.error) {
      await sendTelegramMessage(adminChatIdNow, 'Пустой ответ не отправлен.')
      return
    }
    logActivity(thread.login, 'recruiter_reply')
    const sent = await notifyAccount(thread.login, { kind: 'chat_reply', title: `Рекрутер ответил: ${clip(thread.title, 60)}`, text: r.message.text, link: `/cabinet/chat?v=${thread.slug}` }, { email: true })
    const notes = [sent.telegram ? 'сообщение в Telegram отправлено' : null, sent.email ? 'письмо отправлено' : null].filter(Boolean)
    await sendTelegramMessage(adminChatIdNow, `✅ Ответ добавлен в чат вакансии «${thread.title}»${notes.length ? ` (${notes.join(', ')})` : ''}.`)
  }

  // ---- Мои отклики ----
  app.get('/api/account/applications', (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    const open = new Set(catalog().filter((v) => v.status === 'open').map((v) => v.slug))
    res.json({ ok: true, applications: accountApplications(cfg).map((a) => ({ ...a, vacancyOpen: open.has(a.vacancySlug) })), statuses: APPLICATION_STATUSES })
  })

  // Человек отзывает отклик: статус «Отозван», админу уходит сообщение в бота.
  app.post('/api/account/applications/:number/withdraw', async (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    if (hitLimit(withdrawAttempts, cfg.login, 20, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const number = Number(req.params.number)
    const mine = accountApplications(cfg).find((a) => a.number === number)
    if (!mine) return res.status(404).json({ ok: false, error: 'not_found' })
    if (['withdrawn', 'rejected', 'offer'].includes(mine.status)) return res.status(409).json({ ok: false, error: 'closed' })
    setApplicationStatus(number, 'withdrawn')
    logActivity(cfg.login, 'application_withdrawn')
    const reason = clip(req.body?.reason, 300)
    if (botReady()) {
      const who = accountIdentity(cfg)
      void sendTelegram(adminChatId, `↩️ Отклик №${number} отозван кандидатом\n\nВакансия: ${mine.vacancyTitle}\nКандидат: ${who.name}${reason ? `\nПричина: ${reason}` : ''}`).catch(() => {})
    }
    res.json({ ok: true })
  })

  // ---- Чат с рекрутером по вакансиям ----
  app.get('/api/account/recruiter', (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    res.json({
      ok: true,
      threads: listThreads(cfg.login),
      vacancies: catalog().filter((v) => v.status === 'open').map((v) => ({ slug: v.slug, title: v.title, company: v.company })),
      maxLength: MAX_TEXT,
    })
  })

  app.get('/api/account/recruiter/:slug', (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    const slug = String(req.params.slug)
    if (!SLUG.test(slug)) return res.status(404).json({ ok: false, error: 'not_found' })
    const v = vacancyBySlug(slug)
    const thread = getThread(cfg.login, slug)
    if (!v && !thread.messages.length) return res.status(404).json({ ok: false, error: 'not_found' })
    markSeen(cfg.login, slug)
    res.json({ ok: true, slug, title: thread.title || v?.title || slug, company: v?.company ?? '', open: v?.status === 'open', messages: thread.messages, unread: thread.unread, maxLength: MAX_TEXT })
  })

  app.post('/api/account/recruiter/:slug', async (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    const slug = String(req.params.slug)
    const v = SLUG.test(slug) ? vacancyBySlug(slug) : null
    if (!v) return res.status(404).json({ ok: false, error: 'not_found' })
    if (hitLimit(chatAttempts, cfg.login, 20, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const r = addUserMessage(cfg.login, slug, v.title, req.body?.text)
    if (r.error) return res.status(r.error === 'too_many_threads' ? 409 : 400).json({ ok: false, error: r.error })
    logActivity(cfg.login, 'recruiter_message')
    let notified = false
    if (botReady()) {
      try {
        const who = accountIdentity(cfg)
        const mineApp = accountApplications(cfg).find((a) => a.vacancySlug === slug)
        const sent = await sendTelegram(
          adminChatId,
          `💬 Чат по вакансии «${v.title}»${v.company ? ` · ${v.company}` : ''}\n\nОт: ${who.name} (${cfg.email ? `почта ${cfg.email}` : `логин ${cfg.login}`}${cfg.tgId ? `, Telegram id ${cfg.tgId}` : ''})${mineApp ? `\nОтклик №${mineApp.number}: ${mineApp.statusLabel}` : '\nОтклика на эту вакансию нет'}\n\n${r.message.text}\n\n↩️ Чтобы ответить, нажмите «Ответить» (Reply) на это сообщение: ответ появится в чате этой вакансии.`,
        )
        if (sent.ok && sent.messageId) linkAdminMessage(cfg.login, slug, sent.messageId)
        notified = sent.ok
      } catch (err) {
        console.error('[recruiter] не удалось передать сообщение админу:', err?.message ?? err)
      }
    }
    res.json({ ok: true, message: r.message, notified })
  })

  // ---- Уведомления ----
  app.get('/api/account/notifications', (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    res.json({ ok: true, items: listNotifications(cfg.login), unread: unreadNotifications(cfg.login), settings: getNotificationSettings(cfg.login), telegramLinked: Boolean(cfg.tgId) })
  })

  app.post('/api/account/notifications/read', (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 200) : null
    markNotificationsRead(cfg.login, ids)
    res.json({ ok: true, unread: unreadNotifications(cfg.login) })
  })

  app.put('/api/account/notifications/settings', (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    if (typeof req.body?.telegram !== 'boolean') return res.status(400).json({ ok: false, error: 'bad_request' })
    res.json({ ok: true, settings: setNotificationSettings(cfg.login, { telegram: req.body.telegram }) })
  })

  // ---- Кадровый резерв ----
  const reserveView = (cfg) => {
    const profile = getProfile(cfg.login)
    return {
      ok: true,
      reserve: accountReserve(cfg),
      prefill: { name: cfg.contactName || cfg.name || '', city: profile.expectations?.city ?? '', position: '' },
      hasContact: Boolean(cfg.email || accountIdentity(cfg).telegram),
    }
  }

  app.get('/api/account/reserve', (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    res.json(reserveView(cfg))
  })

  const consentOk = (body) => body?.consent?.policy === true && body?.consent?.processing === true

  async function tellAdminReserve(text, number) {
    if (!botReady()) return
    await sendTelegram(adminChatId, text, number ? [[{ text: `📂 Открыть кандидата №${number}`, callback_data: `a:s:rcard:${number}` }]] : undefined).catch(() => {})
  }

  // Вступить в резерв (нужны согласие на обработку данных и хотя бы один способ связи) или обновить свои данные в нём.
  app.post('/api/account/reserve', async (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    if (hitLimit(reserveAttempts, cfg.login, 20, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const city = clip(req.body?.city, 80)
    const university = clip(req.body?.university, 120)
    const position = clip(req.body?.position, 120)
    const existing = accountReserve(cfg)
    if (existing) {
      updateReserveCandidate(existing.number, { city, university, position })
      return res.json(reserveView(cfg))
    }
    const who = accountIdentity(cfg)
    // запись находится по почте аккаунта или нику в Telegram: без них человек потом не увидит её в кабинете
    if (!cfg.email && !who.telegram) return res.status(400).json({ ok: false, error: 'no_contact' })
    if (!consentOk(req.body)) return res.status(400).json({ ok: false, error: 'consent_required' })
    if (!position) return res.status(400).json({ ok: false, error: 'position_required' })
    const now = Date.now()
    recordConsent({ form: 'cabinet_reserve', version: consentVersion(req.body), given: true, marketing: false, ...who })
    const candidate = createReserveCandidate({ name: cfg.contactName || cfg.name, city, university, position, telegram: who.telegram ? `@${who.telegram}` : '', phone: cfg.contactPhone || '', email: cfg.email || '', source: 'cabinet', utm: 'кабинет', login: cfg.login, consentAt: now })
    logActivity(cfg.login, 'reserve_joined')
    await tellAdminReserve(`🗃 Кадровый резерв: кандидат №${candidate.number} вступил из кабинета (всего в резерве: ${listReserve().length})\n\n${candidate.name || who.name}${position ? ` · ${position}` : ''}${city ? ` · ${city}` : ''}\nПрикрепите ссылку на резюме в карточке.`, candidate.number)
    await notifyAccount(cfg.login, { kind: 'reserve', title: 'Вы в кадровом резерве', text: `Мы будем предлагать вам подходящие вакансии. Данные хранятся год, продлить согласие можно во вкладке «Кадровый резерв».`, link: '/cabinet/reserve' }, { telegram: false })
    res.json(reserveView(cfg))
  })

  // Продлить: человек заново подтверждает согласие, срок хранения считается заново.
  app.post('/api/account/reserve/renew', (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    const existing = accountReserve(cfg)
    if (!existing) return res.status(404).json({ ok: false, error: 'not_found' })
    if (!consentOk(req.body)) return res.status(400).json({ ok: false, error: 'consent_required' })
    recordConsent({ form: 'cabinet_reserve', version: consentVersion(req.body), given: true, marketing: false, ...accountIdentity(cfg) })
    renewReserveCandidate(existing.number)
    logActivity(cfg.login, 'reserve_renewed')
    res.json(reserveView(cfg))
  })

  // Выйти из резерва: запись удаляется сразу.
  app.delete('/api/account/reserve', async (req, res) => {
    const cfg = requireAccount(req, res)
    if (!cfg) return
    const existing = accountReserve(cfg)
    if (!existing) return res.json(reserveView(cfg))
    const was = getReserveCandidate(existing.number)
    deleteReserveCandidate(existing.number)
    logActivity(cfg.login, 'reserve_left')
    await tellAdminReserve(`🗃 Кадровый резерв: кандидат №${existing.number} (${was?.name || 'без имени'}) вышел из резерва сам, запись удалена (осталось: ${listReserve().length}).`)
    res.json(reserveView(cfg))
  })

  return { notifyAccount, notifyApplicationStatus, deliverRecruiterReply, loginsFor }
}

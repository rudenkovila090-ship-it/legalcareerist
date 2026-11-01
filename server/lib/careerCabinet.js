// Раздел «Построение карьеры» личного кабинета: карьерный план, подготовка к интервью (вопрос-ответ), шаблоны, запрос рекомендации,
// заявка на подкаст, портфолио (достижения, профессиональный капитал, медиакит). Маршруты /api/account/career/*.
// Всё только для резидентов сообщества и администратора (requireMember из index.js). Что умеет Telegram и уведомления
// (отправка админу, ответы админа, уведомления человеку) приходит из server/index.js через deps, чтобы модуль проверялся отдельно.
//
// Как это связано с ботом:
//  • заявка на подкаст приходит админу в бота сообщением с контактами и темами;
//  • запрос рекомендации приходит админу с кнопками «Взять в работу» / «Отклонить»; админ отвечает «Ответить» (Reply) текстом
//    рекомендации — он ложится в кабинет человека, статус становится «Готово», человек получает уведомление (кабинет, Telegram, почта).
import {
  ACHIEVEMENT_CATEGORIES, RECOMMENDATION_STATUSES, addAchievement, addCustomStep, cancelRecommendation, clip, clipText, createRecommendation, deleteAchievement, deletePlan,
  deletePodcast, getPodcast, getRecommendation, getWorkspace, linkRecommendationMessage, listRecommendations, removeStep, saveCapital, saveMediakit, savePlan, savePodcast,
  setInterviewDone, setRecommendationResult, setRecommendationStatus, setStepDone, updateAchievement,
} from './careerData.js'
import { capitalFieldIds, capitalSchema, interviewBlocks, interviewQuestionIds, planSteps, routeBook, templateCatalog, templateFile } from './careerContent.js'

const HOUR_MS = 3600 * 1000
const STEP_ID = /^[\w-]{1,60}$/
const ITEM_ID = /^[a-f0-9]{10}$/
const isUrl = (v) => /^https?:\/\/[^\s]{3,}$/i.test(v)
const cleanUrl = (v) => {
  const s = clip(v, 300)
  return isUrl(s) ? s : ''
}
const cleanEmail = (v) => {
  const s = clip(v, 120)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''
}
const cleanTelegram = (v) => clip(v, 60).replace(/^https?:\/\/t\.me\//i, '').replace(/^@+/, '')
const cleanPhone = (v) => {
  const s = clip(v, 30)
  return s.replace(/\D/g, '').length >= 10 ? s : ''
}

export function registerCareerCabinet(app, deps) {
  const { requireMember, hitLimit, sendTelegram, sendTelegramMessage, accountIdentity, logActivity, recordConsent, consentVersion, notifyAccount, botReady, adminChatId } = deps
  const attempts = { podcast: new Map(), recommendation: new Map(), edit: new Map() }
  const consentOk = (body) => body?.consent?.policy === true && body?.consent?.processing === true

  const contactOf = (cfg) => {
    const who = accountIdentity(cfg)
    return { name: cfg.contactName || cfg.name || who.name || '', email: cfg.email || '', phone: cfg.contactPhone || '', telegram: who.telegram || '' }
  }
  const whoLine = (cfg) => {
    const who = accountIdentity(cfg)
    return `${who.name} (${cfg.email ? `почта ${cfg.email}` : `логин ${cfg.login}`}${cfg.tgId ? `, Telegram id ${cfg.tgId}` : ''})`
  }

  // ---- Сводка и справочники ----
  const recSummary = (login) => {
    const list = listRecommendations(login)
    return { active: list.filter((r) => r.status === 'new' || r.status === 'work').length, ready: list.filter((r) => r.status === 'ready').length }
  }
  const interviewSummary = (ws) => {
    const ids = interviewQuestionIds()
    return { total: ids.size, done: ws.interviewDone.filter((id) => ids.has(id)).length }
  }
  const capitalView = (ws) => ({ schema: capitalSchema(), values: ws.capital?.values ?? {}, updatedAt: ws.capital?.updatedAt ?? null })

  app.get('/api/account/career', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const { cfg } = who
    const ws = getWorkspace(cfg.login)
    const podcast = getPodcast(cfg.login)
    res.json({
      ok: true,
      meta: (({ stages, areas, terms, groups }) => ({ stages, areas, terms, groups }))(routeBook()),
      categories: ACHIEVEMENT_CATEGORIES,
      contact: contactOf(cfg),
      plan: ws.plan,
      achievements: ws.achievements,
      capital: capitalView(ws),
      mediakit: ws.mediakit,
      interview: interviewSummary(ws),
      templates: templateCatalog().items.length,
      podcast: podcast ? { status: podcast.status, updatedAt: podcast.updatedAt } : null,
      recommendations: recSummary(cfg.login),
    })
  })

  // ---- Карьерный план ----
  const buildPlan = (login, input) => {
    const book = routeBook()
    const has = (list, id) => list.some((x) => x.id === id)
    const from = String(input?.from ?? '')
    const to = String(input?.to ?? '')
    const area = String(input?.area ?? '')
    const term = String(input?.term ?? '')
    if (!has(book.stages, from) || !has(book.stages, to) || !has(book.areas, area) || !has(book.terms, term)) return { error: 'bad_request' }
    const steps = planSteps({ from, to, area })
    if (!steps) return { error: 'bad_path' }
    const prev = getWorkspace(login).plan
    const done = new Map((prev?.steps ?? []).map((s) => [s.id, s]))
    const now = Date.now()
    const fresh = steps.map((s) => ({ id: s.id, title: s.title, text: s.text, group: s.group, link: s.link, done: done.get(s.id)?.done ?? false, doneAt: done.get(s.id)?.doneAt ?? null }))
    const own = (prev?.steps ?? []).filter((s) => s.custom)
    return { plan: { from, to, area, term, goal: clip(input?.goal, 300), createdAt: prev?.createdAt ?? now, updatedAt: now, steps: [...fresh, ...own] } }
  }

  app.put('/api/account/career/plan', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const { cfg } = who
    if (hitLimit(attempts.edit, cfg.login, 120, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const r = buildPlan(cfg.login, req.body)
    if (r.error) return res.status(400).json({ ok: false, error: r.error })
    const first = !getWorkspace(cfg.login).plan
    savePlan(cfg.login, r.plan)
    if (first) logActivity(cfg.login, 'career_plan_saved')
    res.json({ ok: true, plan: r.plan })
  })

  app.post('/api/account/career/plan/steps', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    if (hitLimit(attempts.edit, who.cfg.login, 120, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const r = addCustomStep(who.cfg.login, req.body?.title)
    if (r.error) return res.status(r.error === 'too_many' ? 409 : 400).json({ ok: false, error: r.error })
    res.json({ ok: true, plan: r.plan })
  })

  app.patch('/api/account/career/plan/steps/:id', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    if (!STEP_ID.test(req.params.id) || typeof req.body?.done !== 'boolean') return res.status(400).json({ ok: false, error: 'bad_request' })
    const plan = setStepDone(who.cfg.login, req.params.id, req.body.done)
    if (!plan) return res.status(404).json({ ok: false, error: 'not_found' })
    res.json({ ok: true, plan })
  })

  app.delete('/api/account/career/plan/steps/:id', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const plan = STEP_ID.test(req.params.id) ? removeStep(who.cfg.login, req.params.id) : null
    if (!plan) return res.status(404).json({ ok: false, error: 'not_found' })
    res.json({ ok: true, plan })
  })

  app.delete('/api/account/career/plan', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    deletePlan(who.cfg.login)
    res.json({ ok: true })
  })

  // ---- Подготовка к интервью (вопрос-ответ) ----
  app.get('/api/account/career/interview', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const done = new Set(getWorkspace(who.cfg.login).interviewDone)
    res.json({ ok: true, blocks: interviewBlocks().map((b) => ({ id: b.id, title: b.title, summary: b.summary, icon: b.icon, count: b.questions.length, done: b.questions.filter((q) => done.has(q.id)).length })) })
  })

  app.get('/api/account/career/interview/:block', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const block = interviewBlocks().find((b) => b.id === req.params.block)
    if (!block) return res.status(404).json({ ok: false, error: 'not_found' })
    const done = new Set(getWorkspace(who.cfg.login).interviewDone)
    res.json({ ok: true, id: block.id, title: block.title, summary: block.summary, lead: block.lead, questions: block.questions.map((q) => ({ id: q.id, q: q.q, a: q.a, done: done.has(q.id) })) })
  })

  app.put('/api/account/career/interview/done', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const id = String(req.body?.id ?? '')
    if (typeof req.body?.done !== 'boolean' || !interviewQuestionIds().has(id)) return res.status(400).json({ ok: false, error: 'bad_request' })
    if (hitLimit(attempts.edit, who.cfg.login, 240, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    setInterviewDone(who.cfg.login, id, req.body.done)
    res.json({ ok: true })
  })

  // ---- Шаблоны ----
  app.get('/api/account/career/templates', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const { categories, items } = templateCatalog()
    res.json({ ok: true, categories, items: items.map(({ file: _file, ...t }) => t) })
  })

  app.get('/api/account/career/templates/:slug/file', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const item = templateFile(String(req.params.slug))
    if (!item) return res.status(404).json({ ok: false, error: 'not_found' })
    res.download(item.path, item.file)
  })

  // ---- Рекомендация ----
  const recView = (r) => ({ id: r.id, number: r.number, target: r.target, company: r.company, link: r.link, deadline: r.deadline, focus: r.focus, status: r.status, statusLabel: RECOMMENDATION_STATUSES[r.status], result: r.result, createdAt: r.createdAt, updatedAt: r.updatedAt, readyAt: r.readyAt ?? null })

  app.get('/api/account/career/recommendations', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    res.json({ ok: true, items: listRecommendations(who.cfg.login).map(recView) })
  })

  app.post('/api/account/career/recommendations', async (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const { cfg } = who
    if (hitLimit(attempts.recommendation, cfg.login, 10, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const target = clip(req.body?.target, 140)
    if (!target) return res.status(400).json({ ok: false, error: 'target_required' })
    if (!consentOk(req.body)) return res.status(400).json({ ok: false, error: 'consent_required' })
    const fields = { target, company: clip(req.body?.company, 120), link: cleanUrl(req.body?.link), deadline: clip(req.body?.deadline, 60), focus: clipText(req.body?.focus, 1200) }
    const r = createRecommendation(cfg.login, fields)
    if (r.error) return res.status(409).json({ ok: false, error: r.error })
    recordConsent({ form: 'cabinet_recommendation', version: consentVersion(req.body), given: true, marketing: false, ...accountIdentity(cfg) })
    logActivity(cfg.login, 'recommendation_requested')
    const item = r.item
    if (botReady()) {
      try {
        const sent = await sendTelegram(
          adminChatId,
          `⭐ Запрос рекомендации №${item.number}\n\nОт: ${whoLine(cfg)}\nКуда: ${item.target}${item.company ? ` · ${item.company}` : ''}${item.link ? `\nСсылка: ${item.link}` : ''}${item.deadline ? `\nКогда нужна: ${item.deadline}` : ''}${item.focus ? `\n\nЧто подчеркнуть:\n${item.focus}` : ''}\n\n↩️ Ответьте (Reply) на это сообщение текстом рекомендации: он появится в кабинете человека, статус станет «Готово», а человек получит уведомление.`,
          [[{ text: '🛠 Взять в работу', callback_data: `a:s:recst:${item.number}:work` }, { text: '🚫 Отклонить', callback_data: `a:s:recst:${item.number}:declined` }]],
        )
        if (sent.ok && sent.messageId) linkRecommendationMessage(item.number, sent.messageId)
      } catch (err) {
        console.error('[career] не удалось передать запрос рекомендации админу:', err?.message ?? err)
      }
    }
    await notifyAccount(cfg.login, { kind: 'career', title: `Запрос рекомендации №${item.number} принят`, text: `Мы подготовим рекомендацию «${item.target}» и сообщим, когда она будет готова.`, link: '/cabinet/recommendations' }, { telegram: false })
    res.json({ ok: true, item: recView(item) })
  })

  app.delete('/api/account/career/recommendations/:id', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const r = ITEM_ID.test(req.params.id) ? cancelRecommendation(who.cfg.login, req.params.id) : { error: 'not_found' }
    if (r.error) return res.status(r.error === 'closed' ? 409 : 404).json({ ok: false, error: r.error })
    if (botReady()) void sendTelegramMessage(adminChatId, `↩️ Запрос рекомендации №${r.item.number} отменён самим человеком (${r.item.target}).`).catch(() => {})
    res.json({ ok: true })
  })

  const RECOMMENDATION_NOTICE = {
    work: (r) => ({ title: `Рекомендация №${r.number} в работе`, text: `Начали готовить рекомендацию «${r.target}». Сообщим, когда она будет готова.` }),
    declined: (r) => ({ title: `Запрос рекомендации №${r.number}`, text: `Рекомендацию «${r.target}» подготовить не получилось. Подробности можно уточнить в поддержке: раздел «Аккаунт → Поддержка».` }),
  }

  /** Админ сменил статус запроса в боте (кнопки): записываем и сообщаем человеку. Возвращает обновлённый запрос или null. */
  async function changeRecommendationStatus(number, status) {
    const before = getRecommendation(number)
    if (!before) return null
    if (before.status === status || before.status === 'ready') return before
    const hit = setRecommendationStatus(number, status)
    if (!hit) return null
    const make = RECOMMENDATION_NOTICE[status]
    if (make) await notifyAccount(hit.login, { kind: 'career', ...make(hit.item), link: '/cabinet/recommendations' }, { telegram: true })
    return { login: hit.login, ...hit.item }
  }

  /** Ответ админа (Reply в боте) на запрос: это текст рекомендации. Ложится в кабинет, человек получает уведомление. */
  async function deliverRecommendation(adminChatIdNow, request, text) {
    const r = setRecommendationResult(request.number, text)
    if (r.error) {
      await sendTelegramMessage(adminChatIdNow, r.error === 'empty' ? 'Пустой текст не отправлен.' : `Запрос №${request.number} не найден.`)
      return
    }
    logActivity(r.login, 'recommendation_ready')
    const sent = await notifyAccount(r.login, { kind: 'career', title: `Рекомендация №${r.item.number} готова`, text: `Рекомендация «${r.item.target}» ждёт вас в кабинете: её можно скопировать и приложить к отклику.`, link: '/cabinet/recommendations' }, { email: true })
    const notes = [sent.telegram ? 'сообщение в Telegram отправлено' : null, sent.email ? 'письмо отправлено' : null].filter(Boolean)
    await sendTelegramMessage(adminChatIdNow, `✅ Рекомендация №${r.item.number} добавлена в кабинет${notes.length ? ` (${notes.join(', ')})` : ''}.`)
  }

  // ---- Подкаст: заявка на участие ----
  const podcastView = (r) => (r ? { name: r.name, email: r.email, phone: r.phone, telegram: r.telegram, about: r.about, topics: r.topics, link: r.link, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt } : null)

  app.get('/api/account/career/podcast', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    res.json({ ok: true, application: podcastView(getPodcast(who.cfg.login)), prefill: contactOf(who.cfg) })
  })

  app.put('/api/account/career/podcast', async (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const { cfg } = who
    if (hitLimit(attempts.podcast, cfg.login, 10, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const fields = {
      name: clip(req.body?.name, 80),
      email: cleanEmail(req.body?.email),
      phone: cleanPhone(req.body?.phone),
      telegram: cleanTelegram(req.body?.telegram),
      about: clipText(req.body?.about, 600),
      topics: clipText(req.body?.topics, 1500),
      link: cleanUrl(req.body?.link),
    }
    if (!fields.name) return res.status(400).json({ ok: false, error: 'name_required' })
    if (!fields.email && !fields.phone && !fields.telegram) return res.status(400).json({ ok: false, error: 'contact_required' })
    if (fields.topics.length < 5) return res.status(400).json({ ok: false, error: 'topics_required' })
    const existing = getPodcast(cfg.login)
    if (!existing) {
      if (!consentOk(req.body)) return res.status(400).json({ ok: false, error: 'consent_required' })
      recordConsent({ form: 'cabinet_podcast', version: consentVersion(req.body), given: true, marketing: false, ...accountIdentity(cfg) })
    }
    const { record, created } = savePodcast(cfg.login, { ...fields, consentAt: existing?.consentAt ?? Date.now() })
    logActivity(cfg.login, 'podcast_applied')
    if (botReady()) {
      void sendTelegram(
        adminChatId,
        `🎙 Подкаст: заявка ${created ? 'новая' : 'обновлена'}\n\nИмя: ${record.name}${record.email ? `\nПочта: ${record.email}` : ''}${record.phone ? `\nТелефон: ${record.phone}` : ''}${record.telegram ? `\nTelegram: @${record.telegram}` : ''}${record.link ? `\nСсылка: ${record.link}` : ''}${record.about ? `\n\nО себе: ${record.about}` : ''}\n\nТемы:\n${record.topics}\n\nАккаунт: ${whoLine(cfg)}`,
      ).catch(() => {})
    }
    if (created) await notifyAccount(cfg.login, { kind: 'career', title: 'Заявка на подкаст принята', text: 'Мы свяжемся с вами по указанным контактам, когда будем собирать гостей на новые эпизоды.', link: '/cabinet/podcast' }, { telegram: false })
    res.json({ ok: true, application: podcastView(record) })
  })

  app.delete('/api/account/career/podcast', async (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const was = getPodcast(who.cfg.login)
    if (was && deletePodcast(who.cfg.login)) {
      logActivity(who.cfg.login, 'podcast_withdrawn')
      if (botReady()) void sendTelegramMessage(adminChatId, `↩️ Подкаст: ${was.name} отозвал(а) заявку на участие, запись удалена.`).catch(() => {})
    }
    res.json({ ok: true })
  })

  // ---- Портфолио: достижения ----
  const achievementFields = (body) => {
    const title = clip(body?.title, 140)
    if (!title) return { error: 'title_required' }
    const year = Number(body?.year)
    const thisYear = new Date().getFullYear()
    return {
      fields: {
        title,
        category: ACHIEVEMENT_CATEGORIES[body?.category] ? body.category : 'other',
        year: Number.isInteger(year) && year >= 1980 && year <= thisYear + 1 ? year : null,
        description: clipText(body?.description, 600),
        link: cleanUrl(body?.link),
      },
    }
  }

  app.post('/api/account/career/achievements', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    if (hitLimit(attempts.edit, who.cfg.login, 120, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const f = achievementFields(req.body)
    if (f.error) return res.status(400).json({ ok: false, error: f.error })
    const r = addAchievement(who.cfg.login, f.fields)
    if (r.error) return res.status(409).json({ ok: false, error: r.error })
    res.json({ ok: true, item: r.item })
  })

  app.put('/api/account/career/achievements/:id', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    const f = achievementFields(req.body)
    if (f.error) return res.status(400).json({ ok: false, error: f.error })
    const item = ITEM_ID.test(req.params.id) ? updateAchievement(who.cfg.login, req.params.id, f.fields) : null
    if (!item) return res.status(404).json({ ok: false, error: 'not_found' })
    res.json({ ok: true, item })
  })

  app.delete('/api/account/career/achievements/:id', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    if (!ITEM_ID.test(req.params.id) || !deleteAchievement(who.cfg.login, req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' })
    res.json({ ok: true })
  })

  // ---- Портфолио: профессиональный капитал и медиакит ----
  app.put('/api/account/career/capital', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    if (hitLimit(attempts.edit, who.cfg.login, 120, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const allowed = capitalFieldIds()
    const values = {}
    for (const [key, v] of Object.entries(req.body?.values ?? {})) {
      const text = allowed.has(key) ? clipText(v, 1500) : ''
      if (text) values[key] = text
    }
    res.json({ ok: true, capital: capitalView({ capital: saveCapital(who.cfg.login, values) }) })
  })

  app.put('/api/account/career/mediakit', (req, res) => {
    const who = requireMember(req, res)
    if (!who) return
    if (hitLimit(attempts.edit, who.cfg.login, 120, HOUR_MS)) return res.status(429).json({ ok: false, error: 'too_many_attempts' })
    const b = req.body ?? {}
    const saved = saveMediakit(who.cfg.login, {
      headline: clip(b.headline, 120),
      about: clipText(b.about, 1200),
      topics: clipText(b.topics, 600),
      showEmail: b.showEmail === true,
      showTelegram: b.showTelegram === true,
      showPhone: b.showPhone === true,
      includeAchievements: b.includeAchievements !== false,
      includeCapital: b.includeCapital !== false,
    })
    res.json({ ok: true, mediakit: saved })
  })

  return { changeRecommendationStatus, deliverRecommendation }
}

// Отзывы резидентов о сообществе и бонус за них. Через REVIEW_ASK_AFTER_DAYS дней после первой оплаты бот просит написать отзыв
// прямо в чате (никуда переходить не нужно). Текст приходит админу, и бонус начисляется только после его решения кнопкой «Одобряем».
// Одобренный текст админ использует сам (сайт, соцсети): поэтому перед отправкой человек даёт согласие на публикацию.
// Записи: id → { joinToken, tgUserId, name, telegram, text, status, consentAt, consentVersion, createdAt, decidedAt }.
import { createJsonStore } from './jsonStore.js'

const store = createJsonStore('community-reviews.json')

export const REVIEW_BONUS_DAYS = 2
export const REVIEW_ASK_AFTER_DAYS = 25
export const REVIEW_ASK_UNTIL_DAYS = 55 // позже просьбу не шлём: человек уже давно в сообществе, момент упущен
export const REVIEW_MIN_LENGTH = 20
/** Редакция согласия на публикацию отзыва о сообществе: раздел на /legal/consent-publication (COMMUNITY_REVIEW_CONSENT_VERSION в src/lib/consent.ts). */
export const REVIEW_CONSENT_VERSION = '2026-10-24'

const MSK = 'Europe/Moscow'
const ruDate = (ts) => new Intl.DateTimeFormat('ru-RU', { timeZone: MSK, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts))
const clip = (text, max) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text)

export function addCommunityReview({ joinToken, tgUserId, name, telegram, text }) {
  return store.create({ joinToken, tgUserId: String(tgUserId), name: name || '', telegram: telegram || '', text: String(text ?? '').trim(), status: 'new', consentAt: Date.now(), consentVersion: REVIEW_CONSENT_VERSION })
}

export function getCommunityReview(id) {
  const rec = store.get(id)
  return rec ? { id, ...rec } : null
}

export function listCommunityReviews() {
  return store.all().map(({ token, ...rec }) => ({ id: token, ...rec }))
}

/** Решение админа. Меняет только запись, ждущую решения: повторное нажатие кнопки ничего не делает (null). */
export function decideCommunityReview(id, status) {
  let result = null
  store.update(id, (rec) => {
    if (rec.status !== 'new') return rec
    result = { id, ...rec, status, decidedAt: Date.now() }
    return { ...rec, status, decidedAt: result.decidedAt }
  })
  return result
}

const DAY = 24 * 3600 * 1000

/**
 * Пора ли просить отзыв: активный платящий резидент, у которого настоящая первая оплата подписки была 25–55 дней назад
 * (у перенесённых из BotHelp приблизительная первая оплата не в счёт), без бонуса за отзыв, без присланного отзыва и без уже доставленной
 * просьбы. Если просьба не дошла (человек не запускал бота), повторяем не чаще раза в сутки.
 */
export function reviewRequestDue(join, reviews, now) {
  if (!join.paid || !join.tgUserId || join.status !== 'active' || join.lifetime || join.reviewRequestedAt || join.reviewThankedAt) return false
  if (reviews.some((r) => r.joinToken === join.token)) return false
  if (join.reviewTriedAt && now - join.reviewTriedAt < DAY) return false
  const first = (join.payments ?? []).filter((p) => !p.estimated && p.kind === 'first' && p.at).sort((a, b) => a.at - b.at)[0]
  if (!first) return false
  const age = now - first.at
  return age >= REVIEW_ASK_AFTER_DAYS * DAY && age <= REVIEW_ASK_UNTIL_DAYS * DAY
}

/** Подпись под отзывом: имя и первая буква фамилии, как обещано в согласии. Нет имени — «Резидент сообщества». */
export function reviewSignature(name) {
  const parts = String(name ?? '').replace(/—/g, '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Резидент сообщества'
  return parts.length > 1 ? `${parts[0]} ${parts[1][0].toUpperCase()}.` : parts[0]
}

const nameOf = (r) => [r.name && r.name !== '—' ? r.name : null, r.telegram || null, r.tgUserId ? `…${String(r.tgUserId).slice(-4)}` : null].filter(Boolean).join(', ') || 'без имени'
const joinName = (j) => [j.name && j.name !== '—' ? j.name : null, j.telegram || null, j.tgUserId ? `…${String(j.tgUserId).slice(-4)}` : null].filter(Boolean).join(', ') || 'без имени'

const backRow = [{ text: '⬅️ Сообщество', callback_data: 'a:sec:community' }, { text: '🏠 Меню', callback_data: 'a:menu' }]
const reviewsBackRow = [{ text: '⬅️ Отзывы и бонусы', callback_data: 'a:x:rvs' }, { text: '🏠 Меню', callback_data: 'a:menu' }]

/** Кому и за что начислены дни: ждут решения, решения админа и бонусы, выданные автоматически до проверки отзывов. */
export function communityReviewsScreen(joins, reviews) {
  const byJoin = new Set(reviews.filter((r) => r.status === 'approved').map((r) => r.joinToken))
  const pending = reviews.filter((r) => r.status === 'new').sort((a, b) => a.createdAt - b.createdAt)
  const approved = reviews.filter((r) => r.status === 'approved').sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))
  const rejected = reviews.filter((r) => r.status === 'rejected').sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))
  // До проверки отзывов бонус начислялся сам через 5 часов после просьбы (которая многим даже не доходила), текст не сохранялся.
  const legacy = joins.filter((j) => j.reviewThankedAt && !byJoin.has(j.token)).sort((a, b) => (a.reviewThankedAt ?? 0) - (b.reviewThankedAt ?? 0))
  const requested = joins.filter((j) => j.reviewRequestedAt && !reviews.some((r) => r.joinToken === j.token))

  const lines = ['⭐ Отзывы и бонусы за отзыв', '']
  lines.push(`Ждут вашего решения: ${pending.length}`)
  for (const r of pending) lines.push(`• ${nameOf(r)} · ${ruDate(r.createdAt)}`, `   «${clip(r.text.replace(/\s+/g, ' '), 500)}»`)
  if (approved.length) {
    lines.push('', `✅ Одобрено: ${approved.length} (полные тексты — кнопка «Одобренные отзывы»)`)
    for (const r of approved) lines.push(`• ${nameOf(r)} · ${ruDate(r.decidedAt ?? r.createdAt)}`, `   «${clip(r.text.replace(/\s+/g, ' '), 200)}»`)
  }
  if (rejected.length) {
    lines.push('', `❌ Отклонено: ${rejected.length}`)
    for (const r of rejected) lines.push(`• ${nameOf(r)} · ${ruDate(r.decidedAt ?? r.createdAt)}`, `   «${clip(r.text.replace(/\s+/g, ' '), 200)}»`)
  }
  if (requested.length) lines.push('', `Просьба отправлена, ответа пока нет: ${requested.length}`)
  if (legacy.length) {
    lines.push('', `🎁 Начислено автоматически, без отзыва (так работал бот до 24.10): ${legacy.length}`, 'Отзыва за этим не было, просьба многим даже не доходила:')
    for (const j of legacy) lines.push(`• ${joinName(j)} · начислено ${ruDate(j.reviewThankedAt)}${j.bonusDays ? ` · бонус +${j.bonusDays} дн.` : ''}`)
  }
  if (!reviews.length && !legacy.length && !requested.length) lines.push('', 'Пока никто не присылал отзыв. Просьба уходит через 25 дней после первой оплаты.')

  const keyboard = pending.slice(0, 8).map((r) => [
    { text: `✅ Одобряем: ${nameOf(r)}`.slice(0, 40), callback_data: `a:x:rvok:${r.id}` },
    { text: '❌ Нет', callback_data: `a:x:rvno:${r.id}` },
  ])
  if (approved.length) keyboard.push([{ text: '📄 Одобренные отзывы (тексты)', callback_data: 'a:x:rvapp' }])
  return { text: lines.join('\n'), keyboard: [...keyboard, backRow] }
}

/** Одобренные отзывы полностью, с подписью «Имя Ф.»: чтобы взять текст и использовать на сайте и в соцсетях. */
export function approvedReviewsScreen(reviews) {
  const approved = reviews.filter((r) => r.status === 'approved').sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))
  if (!approved.length) return { text: '📄 Одобренных отзывов пока нет.', keyboard: [reviewsBackRow] }
  const lines = [`📄 Одобренные отзывы: ${approved.length}`, 'Согласие на публикацию получено у каждого (имя и первая буква фамилии).', '']
  for (const r of approved) lines.push(`«${r.text}»`, `— ${reviewSignature(r.name)}, ${ruDate(r.decidedAt ?? r.createdAt)}`, '')
  return { text: lines.join('\n').trimEnd(), keyboard: [reviewsBackRow] }
}

/** Сообщение админу о присланном отзыве: кто, согласие на публикацию, сам текст и кнопки решения. */
export function reviewForAdmin({ review, join }) {
  const lines = [
    '⭐ Новый отзыв о сообществе',
    '',
    `👤 ${nameOf(review)}`,
    join?.nextPaymentAt ? `📋 Подписка: ${join.oneTime ? 'разовая' : 'с автопродлением'}, следующее списание ${ruDate(join.nextPaymentAt)}` : null,
    join?.reviewThankedAt ? `⚠️ Бонус за отзыв этому человеку уже начислялся ${ruDate(join.reviewThankedAt)}: повторно дни не добавятся, текст сохранится.` : null,
    `✅ Согласие на публикацию дано ${ruDate(review.consentAt ?? Date.now())} (редакция ${review.consentVersion ?? REVIEW_CONSENT_VERSION})`,
    '',
    `«${review.text}»`,
    '',
    `Если отзыв подходит и в нём нет ничего, что может повредить репутации и бренду, нажмите «Одобряем»: текст сохранится в «Одобренных отзывах», человеку добавится +${REVIEW_BONUS_DAYS} дня.`,
  ].filter((l) => l !== null)
  return {
    text: lines.join('\n'),
    keyboard: [
      [{ text: '✅ Одобряем', callback_data: `a:x:rvok:${review.id}` }, { text: '❌ Отклонить', callback_data: `a:x:rvno:${review.id}` }],
      [{ text: '👤 Карточка человека', callback_data: `a:x:pc:${review.tgUserId}` }],
    ],
  }
}

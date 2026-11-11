// Evidence reconciliation: source rows are never discarded and names never join identities.
import crypto from 'node:crypto'
export const phoneKey = v => String(v || '').replace(/\D/g, '').replace(/^8(?=\d{10}$)/, '7')
export const usernameKey = v => {
  const s = String(v || '').trim().replace(/^@/, '')
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(s) ? s.toLowerCase() : null
}
export const isInside = m => ['member', 'administrator', 'creator'].includes(m?.status) || (m?.status === 'restricted' && m.is_member === true)
export function moscowDate(value) {
  const s = String(value || '')
  let iso
  if (/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/.test(s)) {
    const [d, t] = s.split(' '), [day, month, year] = d.split('.')
    iso = `${year}-${month}-${day}T${t}:00+03:00`
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) iso = s.replace(' ', 'T') + '+03:00'
  else return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t) || new Date(t + 3*3600000).toISOString().slice(0,19) !== iso.slice(0,19)) throw Error('invalid_source_date')
  return t
}
const digest = s => crypto.createHash('sha256').update(s).digest('hex')
export function reconcileResidents(input, {cards = [], users = [], memberships = {}, now = Date.now()} = {}) {
  if (input.version !== 1 || !Array.isArray(input.csvRows) || !Array.isArray(input.screenshotRows) || !Array.isArray(input.ownerRows)) throw Error('invalid_evidence_bundle')
  const evidence = [...input.csvRows, ...input.screenshotRows, ...input.ownerRows]
  if (new Set(evidence.map(r => r.key)).size !== evidence.length) throw Error('duplicate_source_key')
  const entities = new Map(), assignments = new Map()
  const entity = key => {
    if (!entities.has(key)) entities.set(key, {key, telegramId: key.startsWith('tg:') ? key.slice(3) : null, evidence: [], cards: [], issues: []})
    return entities.get(key)
  }
  const attach = (e, row) => { if (assignments.has(row.key)) throw Error('source_row_assigned_twice'); e.evidence.push(row); assignments.set(row.key, e.key) }
  const csvPhones = new Map(), screenshotPhones = new Map()
  for (const row of input.csvRows) {
    const id = String(row['TG ID'] || '')
    if (!/^\d{5,16}$/.test(id) || !/^\d+$/.test(String(row.ID)) || !(Number(row['Стоимость']) > 0)) throw Error('invalid_csv_identity_or_amount:' + row.key)
    if (!['активна','деактивирована'].includes(row['Активность (пользователь)']) || !['активна','деактивирована'].includes(row['Активность (менеджер)'])) throw Error('invalid_csv_activity:' + row.key)
    moscowDate(row['Дата подписки'])
    if (row['Будущий платеж'] !== '—' && !moscowDate(row['Будущий платеж'])) throw Error('invalid_future_charge:' + row.key)
    attach(entity('tg:' + id), row)
    const phone = phoneKey(row['Телефон'])
    if (phone) { if (!csvPhones.has(phone)) csvPhones.set(phone, new Set()); csvPhones.get(phone).add(id) }
  }
  for (const row of input.screenshotRows) if (row.phone) {
    const p = phoneKey(row.phone)
    if (!screenshotPhones.has(p)) screenshotPhones.set(p, [])
    screenshotPhones.get(p).push(row.key)
  }
  const knownUsernameIds = new Map()
  for (const u of [...users.map(u => ({id:u.id, username:u.username})), ...cards.map(c => ({id:c.tgUserId,username:c.telegram}))]) {
    const name = usernameKey(u.username), id = String(u.id || '')
    if (!name || !/^\d{5,16}$/.test(id)) continue
    if (!knownUsernameIds.has(name)) knownUsernameIds.set(name, new Set())
    knownUsernameIds.get(name).add(id)
  }
  // An owner-confirmed exact username/ID is evidence, not a name-based inference.
  for (const row of input.ownerRows) if (row.telegramId && usernameKey(row.usernameRaw)) {
    const n = usernameKey(row.usernameRaw)
    if (!knownUsernameIds.has(n)) knownUsernameIds.set(n, new Set())
    knownUsernameIds.get(n).add(row.telegramId)
  }
  function identity(row) {
    if (row.telegramId) return 'tg:' + row.telegramId
    const nick = usernameKey(row.usernameRaw), candidates = nick ? [...knownUsernameIds.get(nick) || []] : []
    // Contacts alone can be stale: only a fresh matching Telegram username resolves a new ID.
    const verified = candidates.filter(id => memberships[id]?.ok && usernameKey(memberships[id].result?.user?.username) === nick)
    if (candidates.length === 1 && verified.length === 1) return 'tg:' + verified[0]
    const p = phoneKey(row.phone), csvIds = [...csvPhones.get(p) || []]
    if (p && csvIds.length === 1 && screenshotPhones.get(p)?.length === 1) return 'tg:' + csvIds[0]
    return nick ? 'username:' + nick : 'source:' + row.key
  }
  for (const row of input.screenshotRows) attach(entity(identity(row)), row)
  for (const row of input.ownerRows) attach(entity(identity(row)), row)
  for (const c of cards) {
    // All cards remain accounted for; unbound cards are not merged into people by a phone or name.
    const key = c.tgUserId ? 'tg:' + c.tgUserId : 'card:' + digest(c.token || JSON.stringify(c)).slice(0,16)
    entity(key).cards.push(c)
  }
  for (const conflict of input.declaredConflicts || []) for (const key of conflict.keys) {
    const e = entities.get(assignments.get(key)); if (e) e.issues.push(conflict.code)
  }
  const registry = {version:1,source:'owner_roster_20261111',sourceDate:input.sourceDate,inputHash:digest(JSON.stringify(input)),createdAt:now,authorizations:{}}
  const rows = []
  for (const e of entities.values()) {
    const csv = e.evidence.filter(r => r.key.startsWith('csv:')), image = e.evidence.filter(r => r.key.startsWith('image')), owner = e.evidence.filter(r => r.key.startsWith('owner:'))
    const active = csv.filter(r => r['Активность (пользователь)'] === 'активна' && r['Активность (менеджер)'] === 'активна')
    const member = memberships[e.telegramId], freshUser = member?.ok ? member.result?.user : null
    const nicks = [...new Set(e.evidence.map(r => usernameKey(r.usernameRaw)).filter(Boolean))]
    if (e.evidence.some(r => r.usernameRaw && !usernameKey(r.usernameRaw))) e.issues.push('invalid_screenshot_username')
    if (image.some(r => r.kind === 'paid') && active.length && image.some(r => !active.some(a => Number(a['Стоимость']) === r.amount))) e.issues.push('tariff_conflict')
    if (active.length > 1) e.issues.push('multiple_active_contracts')
    if (member?.ok && nicks.length && !nicks.includes(usernameKey(freshUser?.username))) e.issues.push('live_username_differs_from_source')
    if (!e.telegramId && image.some(r => r.kind !== 'service')) e.issues.push('telegram_id_unresolved')
    const service = image.length > 0 && image.every(r => r.kind === 'service') && !csv.length && !owner.length
    const former = owner.some(r => r.kind === 'former')
    const livePresence = member?.ok ? isInside(member.result) ? 'in' : ['left','kicked'].includes(member.result?.status) ? 'out' : 'unknown' : 'unknown'
    const demoCards=e.cards.filter(c=>c.demo===true||c.test===true||(c.payments||[]).some(p=>String(p.orderKey||'').startsWith('DEMO-')))
    if(demoCards.length)e.issues.push('test_or_demo_cards_excluded_from_money_and_access')
    const payments = e.cards.filter(c=>!demoCards.includes(c)).flatMap(c => (c.payments || []).filter(p => !p.estimated).map(p => ({...p,cardRef:digest(c.token||'').slice(0,12)})))
    const last = [...payments].sort((a,b)=>Number(a.at)-Number(b.at)).at(-1) || null
    const category = service ? 'service' : former ? 'previously_absent' : image.length || owner.length || active.length ? 'owner_or_provider_snapshot' : demoCards.length===e.cards.length&&demoCards.length ? 'test_or_demo' : e.cards.some(c=>c.paid||c.lifetime||c.ownerAccess?.active) ? 'live_card_review' : 'inactive_contract_or_pending_card'
    const accessType=service?'служебная запись':former?'бывший / ранее отсутствовал':owner.some(r=>r.key==='owner:diana')?'особое разрешение':image.some(r=>r.kind==='ambassador')?'бесплатный — амбассадор':[...image,...owner].some(r=>r.kind==='free')?'бесплатный':[...image,...owner].some(r=>['paid','special'].includes(r.kind))||active.length?'платный (банковский период проверяется отдельно)':category==='test_or_demo'?'тестовая / демо':category==='live_card_review'?'доступ по карточке требует проверки':'неактивный договор / доступ не установлен'
    let authorization = null
    if (!former && !service && e.telegramId) {
      const special = owner.find(r=>['free','special'].includes(r.kind))
      const free = image.find(r=>['free','ambassador'].includes(r.kind))
      // These are owner permissions, not bank receipts. No money fields are synthesized.
      if (special) authorization = {kind:special.kind,until:null,basis:special.basis,sourceKeys:owner.map(r=>r.key)}
      else if (free && freshUser && nicks.includes(usernameKey(freshUser.username))) authorization = {kind:free.kind,until:null,basis:'Бесплатный доступ / амбассадор по активному списку владельца; ID подтверждён Telegram',sourceKeys:image.map(r=>r.key)}
      else if (active.length) {
        const until = Math.max(...active.map(r=>moscowDate(r['Будущий платеж']) || 0))
        if (until > now) authorization = {kind:'provider_snapshot_access',until,basis:'Доступ по актуальной выгрузке владельца до следующего списания; банковская оплата проверяется отдельно',sourceKeys:active.map(r=>r.key)}
        else e.issues.push('active_contract_without_future_date')
      }
      else if(image.some(r=>r.kind==='paid')) {
        // The owner explicitly lists this resident as active. A disabled banking
        // agreement is not a revocation of that permission or evidence of nonpayment.
        authorization={kind:'owner_roster_pending_payment_review',until:null,basis:'Доступ по активному списку владельца до сверки оплаченного периода; не создаёт оплату и не включает списания',sourceKeys:image.map(r=>r.key)}
        e.issues.push('owner_access_without_current_bank_period')
      }
      if (authorization) registry.authorizations[e.telegramId] = {...authorization,active:true}
    }
    rows.push({...e,cards:undefined,cardRefs:e.cards.map(c=>digest(c.token||'').slice(0,12)),name:[...new Set([...owner,...image].map(r=>r.name).filter(Boolean))].join(' / ') || e.cards.find(c=>c.name)?.name || 'Имя не установлено',username:freshUser ? (freshUser.username ? '@'+freshUser.username : 'username отсутствует в ответе Telegram') : nicks.length ? nicks.map(n=>'@'+n).join(' / ') : 'не найден',usernameSource:freshUser?'live_telegram':'source_transcription_not_live',category,accessType,presence:livePresence,membershipStatus:member?.ok?member.result?.status:null,membershipCheckedAt:member?.checkedAt || null,membershipError:member&&!member.ok?member.errorCode:null,contracts:csv.map(r=>({sourceKey:r.key,providerPlanId:r.ID,cost:Number(r['Стоимость']),startedAt:moscowDate(r['Дата подписки']),nextChargeAt:moscowDate(r['Будущий платеж']),userActive:r['Активность (пользователь)'],managerActive:r['Активность (менеджер)']})),imageTariffs:image.map(r=>({sourceKey:r.key,amount:r.amount,kind:r.kind})),payments,lastRecordedPayment:last,authorization,issues:[...new Set(e.issues)]})
  }
  const accounted = rows.flatMap(e=>e.evidence.map(r=>r.key))
  if (accounted.length !== evidence.length || new Set(accounted).size !== evidence.length) throw Error('evidence_coverage_failed')
  return {version:1,at:now,coverage:{csvRows:input.csvRows.length,screenshotRows:input.screenshotRows.length,ownerRows:input.ownerRows.length,sourceRows:evidence.length,accountedRows:accounted.length,uniqueCsvTelegramIds:new Set(input.csvRows.map(r=>r['TG ID'])).size,cardsScanned:cards.length,botUsersScanned:users.length},rows,registry,issues:rows.filter(e=>e.issues.length).map(e=>({key:e.key,issues:e.issues})),complete:false,limitations:['A subscriber export has no receipts or individual provider profile IDs.','Telegram Bot API cannot enumerate every group member; coverage is all supplied evidence plus resident cards.','Screenshot text is manually transcribed; current usernames require live Telegram responses.']}
}

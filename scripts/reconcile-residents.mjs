#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {reconcileResidents, usernameKey} from './lib/resident-reconciliation.mjs'
import {runtimeSettings, telegramRead} from './lib/bot-runtime-settings.mjs'
import {HmacHelper} from '../server/lib/hmac.js'

process.umask(0o077)
const args = process.argv.slice(2)
const option = key => { const i = args.indexOf(key); return i < 0 ? null : args[i+1] }
const inputPath = option('--input'), out = option('--output')
if (!inputPath || !out) { console.error('Usage: node scripts/reconcile-residents.mjs --input evidence.json --output PRIVATE_DIRECTORY [--offline] [--runtime /actual/server]'); process.exit(1) }
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const offline = args.includes('--offline')
let runtime = option('--runtime'), config
if (!offline) {
  const apps = JSON.parse(execFileSync('pm2', ['jlist'], {encoding:'utf8',maxBuffer:32*1024*1024})).filter(a=>a.name === 'legalcareerist-api')
  if (apps.length !== 1 || apps[0].pm2_env.status !== 'online') throw Error('Exactly one online legalcareerist-api is required')
  config = runtimeSettings(apps[0].pm2_env,{})
  if (runtime && path.resolve(runtime) !== path.resolve(config.runtime)) throw Error('runtime_path_conflict')
  runtime = config.runtime
}
const readStore = name => {
  if (!runtime) return []
  const file = path.join(runtime,'data',name)
  // Missing production stores are blockers, never silently replaced with an empty database.
  const obj = JSON.parse(fs.readFileSync(file,'utf8'))
  if (!obj || Array.isArray(obj) || typeof obj !== 'object' || Object.values(obj).some(v=>!v||Array.isArray(v)||typeof v!=='object')) throw Error('invalid_store:'+name)
  return Object.entries(obj).map(([key,v])=>name==='pending-joins.json'?{...v,token:key}:{...v,id:v.id||key})
}
const cards = readStore('pending-joins.json'), users = readStore('bot-users.json')
const memberships = {}, errors = []
if (!offline) {
  const token = config.value('TELEGRAM_BOT_TOKEN'), chat = config.chat
  if (!token || !chat) throw Error('bot_token_or_chat_not_configured')
  const me = await telegramRead(token,'getMe')
  if (!me.ok) throw Error('telegram_getMe_failed:'+me.errorCode)
  const rights = await telegramRead(token,'getChatMember',{chat_id:chat,user_id:me.result.id})
  if (!rights.ok || !['creator','administrator'].includes(rights.result?.status)) throw Error('bot_administrator_membership_required')
  const ids = new Set([...input.csvRows.map(r=>r['TG ID']),...input.ownerRows.map(r=>r.telegramId),...cards.filter(c=>c.paid||c.lifetime||c.ownerAccess?.active||c.residentRegister).map(c=>c.tgUserId)].filter(Boolean).map(String))
  const wanted = new Set([...input.screenshotRows,...input.ownerRows].map(r=>usernameKey(r.usernameRaw)).filter(Boolean))
  for (const u of users) if (wanted.has(usernameKey(u.username))) ids.add(String(u.id))
  for (const c of cards) if (wanted.has(usernameKey(c.telegram)) && c.tgUserId) ids.add(String(c.tgUserId))
  for (const id of ids) {
    const result = await telegramRead(token,'getChatMember',{chat_id:chat,user_id:id})
    memberships[id] = {...result,checkedAt:Date.now()}
    if (!result.ok) errors.push({id,errorCode:result.errorCode})
    await new Promise(resolve=>setTimeout(resolve,80))
  }
}
const result = reconcileResidents(input,{cards,users,memberships})
result.mode = offline ? 'offline' : 'live_read_only'
result.membershipErrors = errors
// The journal is read, never replayed. It remains a separate source from the CSV schedule.
const journal=[]
const verificationKeys=config?['PRODAMUS_SECRET_KEY','PRODAMUS_MATERIALS_SECRET_KEY','PRODAMUS_EVENTS_SECRET_KEY'].map(k=>config.value(k)).filter(Boolean):[]
if(runtime) {
  const journalFile=path.join(runtime,'data/prodamus-webhooks.jsonl')
  try {
    const lines=fs.readFileSync(journalFile,'utf8').split('\n')
    for(let i=0;i<lines.length;i++)if(lines[i].trim()) {
      try {
        const r=JSON.parse(lines[i]),signature=r.sign||r.signature||r.headers?.sign||r.body?.signature
        const signed=Boolean(r.body&&signature&&verificationKeys.some(key=>HmacHelper.verify(r.body,key,signature)))
        journal.push({line:i+1,verified:r.verified===true||signed,verificationSource:signed?'original_signature':r.verified===true?'accepted_journal':null,body:r.body})
      }
      catch { errors.push({source:'prodamus-webhooks.jsonl',line:i+1,errorCode:'malformed_json'}) }
    }
  } catch(e) { if(e.code!=='ENOENT')throw e;errors.push({source:'prodamus-webhooks.jsonl',errorCode:'missing_journal'}) }
}
// Receipt verification is strictly exact order/date/amount/plan against accepted journal rows.
for(const row of result.rows) {
  row.receiptChecks=row.payments.map(p=>{
    const matches=journal.filter(r=>r.verified&&r.body?.payment_status==='success'&&String(r.body.subscription?.id||'')===String(p.subscriptionId||'')&&Number(r.body.sum??r.body.subscription?.cost)===Number(p.amount)).filter(r=>{
      const b=r.body,k=String(b.order_id||'')||(b.subscription?.profile_id&&b.subscription?.payment_num?`sub:${b.subscription.id}:${b.subscription.profile_id}:${b.subscription.payment_num}`:'')
      const at=String(b.date||'');const ts=Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(at)?at.replace(' ','T')+'+03:00':at)
      return k&&k===p.orderKey&&Number(p.at)===ts&&(!b.tg_user_id||String(b.tg_user_id)===row.telegramId)
    })
    return {at:p.at,amount:p.amount,providerPlanId:p.subscriptionId,verifiedJournalLines:matches.map(r=>r.line),verified:matches.length>0}
  })
  const mine=cards.filter(c=>row.telegramId&&String(c.tgUserId||'')===row.telegramId)
  row.bankEvents=journal.filter(r=>r.verified&&r.body?.subscription&&r.body.payment_status==='success').filter(r=>{
    const b=r.body
    if(b.tg_user_id&&String(b.tg_user_id)!==row.telegramId)return false
    return Boolean(row.telegramId&&String(b.tg_user_id||'')===row.telegramId)||mine.some(c=>b.subscription.profile_id&&String(c.prodamusProfileId||'')===String(b.subscription.profile_id))||row.receiptChecks.some(p=>p.verifiedJournalLines.includes(r.line))
  }).map(r=>({journalLine:r.line,verificationSource:r.verificationSource,date:r.body.date,amount:Number(r.body.sum??r.body.subscription.cost),providerPlanId:String(r.body.subscription.id),providerProfileId:r.body.subscription.profile_id?String(r.body.subscription.profile_id):null,orderId:r.body.order_id||null}))
}
result.journalSummary={rows:journal.length,verified:journal.filter(r=>r.verified).length}
const eventOwners=new Map()
for(const row of result.rows)for(const event of row.bankEvents){if(!eventOwners.has(event.journalLine))eventOwners.set(event.journalLine,[]);eventOwners.get(event.journalLine).push(row.key)}
for(const row of result.rows) {
  const conflicts=row.bankEvents.filter(e=>eventOwners.get(e.journalLine).length>1)
  if(conflicts.length){row.issues.push('bank_event_identity_conflict');row.bankEvents=row.bankEvents.filter(e=>eventOwners.get(e.journalLine).length===1)}
}
result.issues=result.rows.filter(r=>r.issues.length).map(r=>({key:r.key,issues:r.issues}))
fs.mkdirSync(out,{recursive:true,mode:0o700})
fs.writeFileSync(path.join(out,'reconciliation.json'),JSON.stringify(result,null,2),{mode:0o600})
fs.writeFileSync(path.join(out,'register-proposal.json'),JSON.stringify(result.registry,null,2),{mode:0o600})
const csvCell=v=>'"'+String(v??'').replaceAll('"','""')+'"'
const csv=(header,rows)=>'\ufeff'+[header,...rows].map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n'
fs.writeFileSync(path.join(out,'bank-events.csv'),csv(['Строка журнала','Проверка','Дата источника','Сумма','Telegram ID в событии','ID плана','ID профиля Prodamus','ID заказа','Сопоставленные записи','Статус сопоставления'],journal.map(r=>[r.line,r.verificationSource||'не проверена',r.body?.date||'',r.body?.sum??r.body?.subscription?.cost??'',r.body?.tg_user_id||'',r.body?.subscription?.id||'',r.body?.subscription?.profile_id||'',r.body?.order_id||'',(eventOwners.get(r.line)||[]).join(' / '),(eventOwners.get(r.line)||[]).length===1?'exact_identifier_match':(eventOwners.get(r.line)||[]).length>1?'ambiguous':'unassigned'])),{mode:0o600})
const moscow=t=>t?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}).format(t)+' МСК':''
const sourceBasis=r=>[...new Set([...r.evidence.map(e=>e.basis).filter(Boolean),r.authorization?.basis].filter(Boolean))].join('; ')
const header=['Ключ','Имя','Telegram username','Telegram ID','Категория','Платный / бесплатный / особое разрешение','Основание доступа','Присутствие Telegram','Статус Telegram','Тарифы на скриншоте','Договоры Prodamus: ID плана / сумма / следующее списание / активность','Последняя оплата в карточке (не всегда проверенная)','Проверка банковской записи','Расхождения','Исходные строки']
const toRow=r=>[r.key,r.name,r.username,r.telegramId||'не найден',r.category,r.accessType,sourceBasis(r)||'Нужна проверка основания и срока',r.presence,r.membershipStatus||'не проверен',r.imageTariffs.map(t=>`${t.amount} ₽ (${t.kind})`).join(' / '),r.contracts.map(c=>`${c.providerPlanId} / ${c.cost} ₽ / ${moscow(c.nextChargeAt)||'нет даты'} / ${c.userActive},${c.managerActive}`).join(' | '),r.lastRecordedPayment?`${r.lastRecordedPayment.amount} ₽ / ${moscow(Number(r.lastRecordedPayment.at))}`:'не найдена',r.receiptChecks.some(p=>p.verified)?'есть точное совпадение с принятым verified-событием; период см. JSON':'не подтверждена первичным журналом',r.issues.join(' / '),r.evidence.map(e=>e.key).join(' / ')]
fs.writeFileSync(path.join(out,'all-records.csv'),csv(header,result.rows.map(toRow)),{mode:0o600})
fs.writeFileSync(path.join(out,'former-and-inactive.csv'),csv(header,result.rows.filter(r=>['previously_absent','inactive_contract_or_pending_card'].includes(r.category)).map(toRow)),{mode:0o600})
fs.writeFileSync(path.join(out,'exceptions.csv'),csv(header,result.rows.filter(r=>r.issues.length).map(toRow)),{mode:0o600})
const sourceHeader=['Исходная строка','Имя','Username как на изображении/в задании','Телефон','Telegram ID из CSV/задания','ID плана Prodamus','Стоимость/метка','Будущий платеж','Активность пользователя','Активность менеджера','Итоговый ключ']
fs.writeFileSync(path.join(out,'source-coverage.csv'),csv(sourceHeader,result.rows.flatMap(r=>r.evidence.map(e=>[e.key,e.name||'',e.usernameRaw||'',e['Телефон']||e.phone||'',e['TG ID']||e.telegramId||'',e.ID||'',e['Стоимость']??e.amount??'',e['Будущий платеж']||'',e['Активность (пользователь)']||'',e['Активность (менеджер)']||'',r.key]))),{mode:0o600})
const escape=v=>String(v??'').replaceAll('|',' / ').replaceAll('\n',' ')
const table=rows=>'| Имя | Telegram username | Telegram ID | Основание / тариф | Срок / следующее списание | Присутствие | Расхождения |\n|---|---|---|---|---|---|---|\n'+rows.map(r=>'| '+[r.name,r.username,r.telegramId||'не найден',r.accessType+'; '+(sourceBasis(r)||r.imageTariffs.map(t=>`${t.kind}: ${t.amount} ₽`).join('; ')||r.category),r.contracts.map(c=>`${c.cost} ₽: ${moscow(c.nextChargeAt)||'нет даты'} (${c.userActive}/${c.managerActive})`).join('; ')||r.authorization?.basis||'не установлен',r.presence==='in'?'подтверждено Telegram':r.presence==='out'?'Telegram: отсутствует':'не проверено',r.issues.join('; ')].map(escape).join(' | ')+' |').join('\n')
fs.writeFileSync(path.join(out,'report.md'),`# Сверка резидентов — 11.11.2026\n\nУчтены все **${result.coverage.csvRows} строк CSV, ${result.coverage.screenshotRows} строк трёх скриншотов и ${result.coverage.ownerRows} персональных ориентиров**: ${result.coverage.accountedRows}/${result.coverage.sourceRows}. В CSV ${result.coverage.uniqueCsvTelegramIds} разных TG ID. Каждая строка сопоставлена с итоговым ключом в source-coverage.csv. Это покрытие предоставленных источников, не доказательство полного состава Telegram.\n\nРежим: ${result.mode}. Членство: in — ${result.rows.filter(r=>r.presence==='in').length}, out — ${result.rows.filter(r=>r.presence==='out').length}, unknown — ${result.rows.filter(r=>r.presence==='unknown').length}.\n\n«Будущий платеж» — расписание, не банковское подтверждение и не доказанный оплаченный срок. CSV ID — ID повторяющегося тарифного плана; CSV TG ID — отдельная колонка. В выгрузке нет profile_id или уникального ID личного договора. Пять повторов TG ID сохранены как разные строки договоров. Ники со скриншотов — ручная транскрипция, до ответа Telegram не объявлены текущими. Некорректные значения с двоеточием сохранены в исходных строках и не используются как username.\n\n## Реестр по актуальному списку владельца / активным договорам\n\n${table(result.rows.filter(r=>r.category==='owner_or_provider_snapshot'))}\n\n## Бывшие, неактивные договоры и карточки для отдельной проверки\n\n${table(result.rows.filter(r=>['previously_absent','inactive_contract_or_pending_card','live_card_review'].includes(r.category)))}\n\n## Служебные записи\n\n${table(result.rows.filter(r=>r.category==='service'))}\n\n## Источники и ограничения\n\nsubscribers.csv: SHA-256 ${input.csvSha256}; три скриншота из сообщения владельца, строки привязаны к секции и номеру; персональные указания из переписки. Живых карточек прочитано ${cards.length}, контактов бота ${users.length}; журнал: ${journal.length} строк, verified: ${result.journalSummary.verified}. Ничего не воспроизводилось в обработчике оплат.\n\nБез живой базы нельзя установить актуальные username, присутствие, реальные последние оплаты и банковские профили. Бесплатные резиденты и амбассадоры сохранены отдельными строками. Служебные бот-аккаунты и владелец отделены. Из тестов репозитория ни одна карточка не импортируется. Конфликты имён/номеров/тарифов не исправляются догадкой. У Ксении из скриншота username @xxeniyamik; связанный по уникальному телефону CSV содержит TG ID 906154391, а прежний ориентир — 905164391. Эти ID не объединены. Скриншот Кристины @lawyer_civillaw не признан алиасом @civillaw_civile без независимого подтверждения. У Дианы сохранены отдельно @mulanka_7 (владелец, 350 ₽) и транскрипция скриншота @mulandldhh (500 ₽). У Светика owner-основание оплаты до 08.12.2026 сохранено отдельно от расписания CSV 08.12.2026 23:12.\n`,{mode:0o600})
console.log(JSON.stringify({mode:result.mode,coverage:result.coverage,peopleAndReviewRecords:result.rows.length,liveIn:result.rows.filter(r=>r.presence==='in').length,liveOut:result.rows.filter(r=>r.presence==='out').length,unknown:result.rows.filter(r=>r.presence==='unknown').length,exceptions:result.issues.length,output:path.resolve(out),botMutations:false,messagesSent:false},null,2))
// Nonzero signals an incomplete live check, while retaining every report and source row.
if (!offline && errors.length) process.exitCode=2

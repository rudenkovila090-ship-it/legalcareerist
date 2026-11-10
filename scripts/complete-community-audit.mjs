import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {runtimeSettings,telegramRead} from './lib/bot-runtime-settings.mjs'
process.umask(0o077)
const expected={"after": "bf627c4e5b75d690490085bf4c9cb546fbc57b274d9f0b035bf6b77d550b9320", "indexEdits": [["import { repairCommunityCards }", "import { completeSvetikPayment, completeWebsiteCheckout } from './lib/communityPaymentCompletion.js'\nimport { repairCommunityCards }"], ["setTgUserId, findJoinForPayment", "setTgUserId, removeJoin, findJoinForPayment"], ["  if (req.body.operation === 'repair_community_20261110') {", "  if (req.body.operation === 'complete_billing_audit_20261110') {\n    if (communityMaintenanceRunning || processingProdamus > 0) return res.status(409).json({ ok: false, error: 'maintenance_running' })\n    communityMaintenanceRunning = true\n    try {\n      const member = async id => { const r = await telegramFetch('getChatMember', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({chat_id:COMMUNITY_CHAT_ID,user_id:Number(id)}) }); const b=await r.json(); return r.ok && b.ok ? b.result : {status:'unknown'} }\n      const events = () => { const file=path.join(import.meta.dirname,'data/prodamus-webhooks.jsonl');return fs.existsSync(file)?fs.readFileSync(file,'utf8').split('\\n').filter(Boolean).map(line=>JSON.parse(line)):[] }\n      let svetik, website\n      const safeCode=error=>/^(svetik_|website_)[a-z_]+$/.test(error.message)?error.message:'billing_audit_unavailable'\n      try { svetik = await completeSvetikPayment({list:listJoins,events,member,bind:setTgUserId,patch:patchJoin,sync:syncResidentMetadata,trustedFrom:Number(process.env.PRODAMUS_LOG_TRUST_FROM)||0,\n        apply:async record=>{processingProdamus++;try{await handleSubscriptionPayment(record.body,record.body.customer_phone||record.body.phone,record.receivedAt)}finally{processingProdamus--}},\n        expectedEnd:(b,at)=>pickNextPaymentDate(b.subscription,at)||((HISTORICAL_PLANS[String(b.subscription.id)]?.months||TARIFFS[tariffIdBySubscriptionId(b.subscription.id)]?.months)?addMonths(at,HISTORICAL_PLANS[String(b.subscription.id)]?.months||TARIFFS[tariffIdBySubscriptionId(b.subscription.id)]?.months):null),\n      })\n      } catch(error) { svetik={ok:false,error:safeCode(error)} }\n      try { website = await completeWebsiteCheckout({list:listJoins,remove:removeJoin,cancel:cancelPending,siteUrl:SITE_URL,\n        post:async(url,body)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});return{ok:r.ok,body:await r.json()}},\n      })\n      } catch(error) { website={ok:false,error:safeCode(error)} }\n      const complete=svetik.ok&&website.ok\n      return res.status(complete?200:503).json({ok:complete,error:complete?undefined:svetik.error||website.error,svetik,website,automaticProviderCancellation:false})\n    } catch(error) { const code=/^(svetik_|website_)[a-z_]+$/.test(error.message)?error.message:'billing_audit_unavailable';return res.status(503).json({ok:false,error:code}) }\n    finally {communityMaintenanceRunning=false}\n  }\n  if (req.body.operation === 'repair_community_20261110') {"], ["subscriptionAdmission: 1,", "subscriptionAdmission: 1, billingAuditVersion: 1,"]]}
const run=(c,a,extra={})=>execFileSync(c,a,{stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:16*1048576,...extra})
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
const write=(f,b)=>{fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});const t=f+'.resume-'+crypto.randomBytes(5).toString('hex');try{fs.writeFileSync(t,b,{mode:0o600});fs.renameSync(t,f)}finally{fs.rmSync(t,{force:true})}}
let backup,files=[],changed=false,installed=false,restartAttempted=false,app
try{
 const found=JSON.parse(run('pm2',['jlist'])).filter(a=>a.name==='legalcareerist-api')
 if(found.length!==1||found[0].pm2_env.status!=='online')throw Error('Нужен единственный работающий основной API.')
 app=found[0];const state=app.pm2_env,config=runtimeSettings(state,{}),root=config.runtime,port=Number(config.value('PORT')||3001)
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Не удалось проверить порт API.')
 const url='http://127.0.0.1:'+port
 const health=async()=>{try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(3000)});return r.ok?await r.json():{}}catch{return{}}}
 const previous=await health();if(previous.subscriptionExpiry!==3||previous.automaticProviderCancellation!==false)throw Error('Основное обновление бота не подтверждено; адресная операция остановлена.')
 const token=config.value('TELEGRAM_BOT_TOKEN'),secret=config.value('PRODAMUS_SECRET_KEY')
 if(!token||!secret||!config.chat)throw Error('Не найдены действующие настройки бота.')
 const me=await telegramRead(token,'getMe');if(!me.ok)throw Error('Telegram не подтвердил токен: '+(me.description||me.errorCode))
 const rights=await telegramRead(token,'getChatMember',{chat_id:config.chat,user_id:me.result.id})
 if(!rights.ok)throw Error('Telegram не подтвердил чат: '+(rights.description||rights.errorCode))
 if(!['administrator','creator'].includes(rights.result?.status)||!(rights.result.status==='creator'||(rights.result.can_invite_users&&rights.result.can_restrict_members)))throw Error('Не подтверждены права бота приглашать и исключать участников.')
 const moduleFile=path.join(root,'lib/communityPaymentCompletion.js'),payload=fs.readFileSync(path.join(import.meta.dirname,'../server/lib/communityPaymentCompletion.js'),'utf8')
 const before=fs.existsSync(moduleFile)?fs.readFileSync(moduleFile,'utf8'):null;if(hash(payload)!==expected.after||(before!==null&&hash(before)!==expected.after))throw Error('Версия адресного модуля отличается от проверенной. Код не заменён.')
 const indexFile=state.pm_exec_path,indexBefore=fs.readFileSync(indexFile,'utf8');let indexAfter=indexBefore
 for(const[a,b]of expected.indexEdits){if(indexAfter.split(b).length===2)continue;if(indexAfter.split(a).length!==2)throw Error('Не удалось безопасно совместить окончательную проверку оплаты.');indexAfter=indexAfter.replace(a,b)}
 const base=process.env.BOT_COMPLETION_BACKUP_ROOT||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'complete-20261110-'));write(path.join(backup,'package.json'),'{"type":"module"}')
 files=[{file:moduleFile,before,after:payload},{file:indexFile,before:indexBefore,after:indexAfter}]
 for(const[f,n]of files.map((f,i)=>[f,i])){if(f.before!==null)write(path.join(backup,n+'.before'),f.before);const check=path.join(backup,n+'.mjs');write(check,f.after);run(process.execPath,['--check',check]);if((fs.existsSync(f.file)?fs.readFileSync(f.file,'utf8'):null)!==f.before)throw Error('Код изменился во время подготовки.')}
 console.log('Права бота и установленное обновление подтверждены. Подготавливаю окончательную сверку оплаты…')
 changed=files.some(f=>f.before!==f.after)
 if(changed||previous.billingAuditVersion!==1){restartAttempted=true;for(const f of files)if(f.before!==f.after)write(f.file,f.after);run('pm2',['restart',app.name]);let ready=false;for(let i=0;i<30;i++){const h=await health();if(h.ok&&h.subscriptionExpiry===3&&h.automaticProviderCancellation===false&&h.billingAuditVersion===1){ready=true;break}await new Promise(r=>setTimeout(r,500))}if(!ready)throw Error('API не подтвердил перезапуск.')}
 installed=true
 console.log('Сопоставляю платёж 8 ноября и проверяю создание ссылки оплаты через сайт…')
 const body={purpose:'community-subscription-recovery',issuedAt:Date.now(),nonce:crypto.randomBytes(12).toString('hex'),operation:'complete_billing_audit_20261110',send:false,input:{}}
 const key=crypto.createHmac('sha256',secret).update('community-subscription-recovery-admin-v1').digest(),signature=crypto.createHmac('sha256',key).update(JSON.stringify(body)).digest('hex')
 let response,repair
 for(let attempt=0;attempt<10;attempt++){
  response=await fetch(url+'/api/internal/subscription-policy',{method:'POST',headers:{'Content-Type':'application/json','X-Recovery-Signature':signature},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)})
  repair=await response.json();if(response.status!==409)break
  await new Promise(r=>setTimeout(r,2000))
 }
 write(path.join(backup,'repairs.json'),JSON.stringify(repair,null,2))

 const result=JSON.parse(run(process.execPath,[path.join(import.meta.dirname,'audit-community-bot.mjs')],{env:{...process.env,BOT_AUDIT_OUTPUT:path.join(backup,'after.json')},timeout:180000}))
 const date=v=>new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})
 const errors={svetik_verified_payment_not_found:'В журнале нет исходного подтверждённого платежа Светика за 8 ноября 23:13. Оплату не выдумывали.',svetik_multiple_payments_require_review:'Найдено несколько разных платежей Светика; автоматическое сопоставление остановлено.',svetik_payment_identity_conflict:'Платёж связан с другим Telegram ID. Перепривязка не выполнена.',svetik_payment_ledger_mismatch:'История платежа отличается от исходного уведомления Prodamus. Деньги и даты в истории не переписаны.',website_checkout_not_created:'Сайт не смог создать ссылку Prodamus для оплаты подписки.',billing_audit_unavailable:'Один из сервисов не ответил; подробности сохранены в отчёте.'}
 if(repair.svetik?.ok)console.log('Светик: платёж '+repair.svetik.amount+' ₽ от '+date(repair.svetik.verifiedPaymentAt)+' подтверждён; оплаченный срок до '+date(repair.svetik.paidUntil)+'.')
 if(repair.website?.ok)console.log('Оплата на сайте: ссылка Prodamus создана через публичную форму. Списаний не было; тестовая заявка удалена.')
 for(const c of result.cases){const states=[...new Set((c.telegramIds||[]).map(m=>m.membership))];console.log(c.name+': '+(states.every(s=>['left','kicked'].includes(s))&&states.length?'в сообществе отсутствует':states.some(s=>['member','administrator','creator'].includes(s))?'в сообществе':'участие не подтверждено')+(c.cards.some(j=>j.lifetime&&j.complimentary?.nominalAmount===350)?'; бесплатный бессрочный доступ, метка 350 ₽.':c.cards.some(j=>j.access==='active')?'; оплаченный доступ действует.':'; действующего оплаченного доступа нет.'))}
 if(!response.ok||!repair.ok)throw Error('Проверка не завершена: '+(errors[repair.error]||String(repair.error||response.status))+'. Отчёт: '+backup)
 if(result.storageErrors?.length||result.payments.malformedLines)throw Error('Проверка не завершена: обнаружена ошибка чтения базы или журнала платежей. Отчёт: '+backup)
 if(!result.configuration.autoExclude)throw Error('Проверка не завершена: автоматический контроль доступа выключен. Отчёт: '+backup)
 if(result.api.health.http!==200||result.api.health.subscriptionExpiry!==3||result.api.webhookRejectsUnsigned.http!==403||result.api.publicSubscriptionRejectsMissingConsent.http!==400)throw Error('Проверка не завершена: защита или доступность платёжного API не подтверждена. Отчёт: '+backup)
 for(const c of result.cases)if((c.telegramIds||[]).some(m=>m.membership==='unknown'))throw Error('Проверка не завершена: Telegram не подтвердил участие '+c.name+'. Отчёт: '+backup)
 const confirmedGrant=result.cases.flatMap(c=>c.cards||[]).find(c=>String(c.tgUserId)==='376201355'&&c.lifetime&&c.complimentary?.nominalAmount===350)
 if(!confirmedGrant)throw Error('Адресная сверка не подтвердила бессрочный доступ Анастасии. Отчёт: '+backup)
 if(!repair.svetik?.ok||!repair.website?.ok||!repair.website.unpaidProbeRemoved||repair.website.realChargePerformed!==false)throw Error('Проверка оплаты не завершена. Отчёт: '+backup)
 for(const c of result.cases)for(const member of c.telegramIds||[])if(['member','administrator','creator'].includes(member.membership)){const mine=c.cards.filter(j=>String(j.tgUserId)===String(member.id));if(!mine.some(j=>j.access==='active'||j.access==='lifetime'))throw Error('Проверка доступа не завершена: '+c.name+'. Отчёт: '+backup)}
 if(!result.telegram.botRights?.checked||!result.telegram.botRights.invite||!result.telegram.botRights.restrict)throw Error('Повторная проверка Telegram не завершена. Отчёт: '+backup)
 console.log('Проверка завершена: платёж, сайт, права бота и доступ резидентов подтверждены. Автопродление бот не отключает.')
 console.log('COMMUNITY_AUDIT_COMPLETE '+JSON.stringify({telegramRightsConfirmed:true,svetikPaymentVerified:true,websiteCheckoutVerified:true,anastasiaLifetime350:true,automaticProviderCancellation:false,financialHistoryReplaced:false,realChargePerformed:false,report:backup}))
}catch(error){
 if((changed||restartAttempted)&&!installed){for(const f of files)try{if(f.before===null)fs.rmSync(f.file,{force:true});else write(f.file,f.before)}catch{};if(app)try{run('pm2',['restart',app.name])}catch{}}
 console.error(/^(Нужен|Не |Основное|Telegram|Версия|Код|API|Адресная|Повторная|Проверка)/.test(error.message)?error.message:'Проверка остановлена. Секреты не выводятся. Отчёт: '+(backup||'не создан'))
 process.exitCode=1
}

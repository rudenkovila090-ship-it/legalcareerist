import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {runtimeSettings,telegramRead} from './lib/bot-runtime-settings.mjs'
process.umask(0o077)
const expected={"before": "44abba0688d87bf54041ea13c729da7a23cd24683ce1d2188ff6659e4aa69813", "after": "8be274d70404137411c2587ebcef9f1bf12c47d1f0e12e4ac091ecfe3bfb8f29", "indexEdits": [["    'Отлично! Оплата получена ✅\\n\\nНажми кнопку «Вступить в сообщество» и подай заявку, я сразу её приму.\\n\\nЖду тебя внутри!',", "    join.complimentary ? 'Для вас восстановлен бесплатный бессрочный доступ к сообществу.\\n\\nНажмите «Вступить в сообщество» и подайте заявку — бот её одобрит. Списаний за этот доступ нет.' : 'Отлично! Оплата получена ✅\\n\\nНажми кнопку «Вступить в сообщество» и подай заявку, я сразу её приму.\\n\\nЖду тебя внутри!',"]]}
const run=(c,a,extra={})=>execFileSync(c,a,{stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:16*1048576,...extra})
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
const write=(f,b)=>{fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});const t=f+'.resume-'+crypto.randomBytes(5).toString('hex');try{fs.writeFileSync(t,b,{mode:0o600});fs.renameSync(t,f)}finally{fs.rmSync(t,{force:true})}}
let backup,files=[],changed=false,installed=false,app
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
 const moduleFile=path.join(root,'lib/communityMaintenance.js'),payload=fs.readFileSync(path.join(import.meta.dirname,'../server/lib/communityMaintenance.js'),'utf8')
 const before=fs.readFileSync(moduleFile,'utf8');if(hash(payload)!==expected.after||![expected.before,expected.after].includes(hash(before)))throw Error('Версия адресного модуля отличается от проверенной. Код не заменён.')
 const indexFile=state.pm_exec_path,indexBefore=fs.readFileSync(indexFile,'utf8');let indexAfter=indexBefore
 for(const[a,b]of expected.indexEdits){if(indexAfter.split(b).length===2)continue;if(indexAfter.split(a).length!==2)throw Error('Не удалось безопасно совместить сообщение приглашения.');indexAfter=indexAfter.replace(a,b)}
 const base=process.env.BOT_RESUME_BACKUP_ROOT||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'finish-20261110-'));write(path.join(backup,'package.json'),'{"type":"module"}')
 files=[{file:moduleFile,before,after:payload},{file:indexFile,before:indexBefore,after:indexAfter}]
 for(const[f,n]of files.map((f,i)=>[f,i])){write(path.join(backup,n+'.before'),f.before);const check=path.join(backup,n+'.mjs');write(check,f.after);run(process.execPath,['--check',check]);if(fs.readFileSync(f.file,'utf8')!==f.before)throw Error('Код изменился во время подготовки.')}
 console.log('Права бота подтверждены. Адресное исправление карточки проверено.')
 changed=files.some(f=>f.before!==f.after)
 if(changed){for(const f of files)if(f.before!==f.after)write(f.file,f.after);run('pm2',['restart',app.name]);let ready=false;for(let i=0;i<30;i++){const h=await health();if(h.ok&&h.subscriptionExpiry===3&&h.automaticProviderCancellation===false){ready=true;break}await new Promise(r=>setTimeout(r,500))}if(!ready)throw Error('API не подтвердил перезапуск.')}
 installed=true
 console.log('Сверяю бессрочный доступ 350 ₽ и фактические статусы резидентов…')
 const body={purpose:'community-subscription-recovery',issuedAt:Date.now(),nonce:crypto.randomBytes(12).toString('hex'),operation:'repair_community_20261110',send:false,input:{}}
 const key=crypto.createHmac('sha256',secret).update('community-subscription-recovery-admin-v1').digest(),signature=crypto.createHmac('sha256',key).update(JSON.stringify(body)).digest('hex')
 const response=await fetch(url+'/api/internal/subscription-policy',{method:'POST',headers:{'Content-Type':'application/json','X-Recovery-Signature':signature},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)})
 const repair=await response.json();write(path.join(backup,'repairs.json'),JSON.stringify(repair,null,2));if(!response.ok||!repair.ok)throw Error('Адресная сверка не завершена. Отчёт: '+backup)
 const result=JSON.parse(run(process.execPath,[path.join(import.meta.dirname,'audit-community-bot.mjs')],{env:{...process.env,BOT_AUDIT_OUTPUT:path.join(backup,'after.json')},timeout:180000}))
 console.log('REPAIRS '+JSON.stringify(repair))
 for(const c of result.cases)console.log('CASE '+JSON.stringify({name:c.name,ambiguous:c.ambiguous,membership:c.telegramIds,cards:c.cards.map(j=>({access:j.access,lifetime:j.lifetime,inChat:j.inChat,nominalPrice:j.complimentary?.nominalAmount||null,review:j.review?.state==='pending'?j.review.reason:null,cancellation:j.cancellation?.source||null}))}))
 const confirmedGrant=result.cases.flatMap(c=>c.cards||[]).find(c=>String(c.tgUserId)==='376201355'&&c.lifetime&&c.complimentary?.nominalAmount===350)
 if(repair.complimentary==='lifetime_nominal_350'&&!confirmedGrant)throw Error('Адресная сверка не подтвердила бессрочную карточку. Отчёт: '+backup)
 if(repair.complimentary!=='lifetime_nominal_350'&&repair.complimentary!=='grant_ended_on_departure')throw Error('Адресная карточка Анастасии требует сверки: '+repair.complimentary+'. Отчёт: '+backup)
 if(!result.telegram.botRights?.checked||!result.telegram.botRights.invite||!result.telegram.botRights.restrict)throw Error('Повторная проверка Telegram не завершена. Отчёт: '+backup)
 console.log('BOT_FINISH_READY '+JSON.stringify({telegramRightsConfirmed:true,complimentary:repair.complimentary,changed,financialHistoryReplaced:false,report:backup}))
}catch(error){
 if(changed&&!installed){for(const f of files)try{write(f.file,f.before)}catch{};if(app)try{run('pm2',['restart',app.name])}catch{}}
 console.error(/^(Нужен|Не |Основное|Telegram|Версия|Код|API|Адресная|Повторная)/.test(error.message)?error.message:'Проверка остановлена. Секреты не выводятся. Отчёт: '+(backup||'не создан'))
 process.exitCode=1
}

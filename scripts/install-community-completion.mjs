import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {runtimeSettings} from './lib/bot-runtime-settings.mjs'
process.umask(0o077)
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:16*1048576})
const write=(file,data)=>{const temp=file+'.finish-'+crypto.randomBytes(5).toString('hex');try{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}}
const hash=s=>crypto.createHash('sha256').update(s).digest('hex')
let app,backup,changed=false,mutated=false,stopAttempted=false,installed=false,files=[]
try{
 const found=JSON.parse(run('pm2',['jlist'])).filter(a=>a.name==='legalcareerist-api')
 if(found.length!==1||found[0].pm2_env.status!=='online')throw Error('Не найден работающий основной API.')
 app=found[0];const config=runtimeSettings(app.pm2_env,{}),root=config.runtime,port=Number(config.value('PORT')||3001)
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Не удалось определить порт API.')
 const url='http://127.0.0.1:'+port,health=async()=>{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(4000)});return r.ok?await r.json():{}}
 const previous=await health()
 if(previous.subscriptionAutomation!==1||!previous.autoExclude||previous.automaticAccessRemovalPaused||previous.graceDays!==4)throw Error('Не подтверждена включённая автоматика. Её настройки не изменены.')
 const secret=config.value('PRODAMUS_SECRET_KEY');if(!secret)throw Error('Не найден ключ подписанной операции.')
 const base=process.env.BOT_FINISH_BACKUP_ROOT||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'followup-20261110-'))
 const packet=path.join(import.meta.dirname,'../updates/community-completion'),manifest=JSON.parse(fs.readFileSync(path.join(packet,'manifest.json')))
 for(const entry of manifest.files){
  const file=path.join(root,entry.path),payload=fs.readFileSync(path.join(packet,'server',entry.path),'utf8'),before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null
  if(hash(payload)!==entry.sha256)throw Error('Не совпала контрольная сумма пакета: '+entry.path)
  let after=before
  if(entry.new){if(before!==null&&before!==payload)throw Error('Неизвестная версия модуля: '+entry.path);after=payload}
  else {if(before===null)throw Error('Не найден модуль: '+entry.path);for(const [old,next]of entry.edits){if(after.split(next).length===2)continue;if(after.split(old).length!==2)throw Error('Не удалось безопасно совместить: '+entry.path);after=after.replace(old,next)}}
  const i=files.length;if(before!==null)write(path.join(backup,i+'.before'),before);const check=path.join(backup,i+'.mjs');write(check,after);run(process.execPath,['--check',check]);files.push({file,before,after})
 }
 changed=files.some(f=>f.before!==f.after)
 if(changed||previous.communityFollowup!==1){
  for(const f of files)if((fs.existsSync(f.file)?fs.readFileSync(f.file,'utf8'):null)!==f.before)throw Error('Код изменился во время подготовки.')
  stopAttempted=true;run('pm2',['stop',app.name]);mutated=true
  for(const f of files)if(f.before!==f.after)write(f.file,f.after)
  run('pm2',['restart',app.name])
 }
 let ready=false;for(let i=0;i<30;i++){try{const h=await health();if(h.ok&&h.communityFollowup===1&&h.autoExclude&&!h.automaticAccessRemovalPaused&&h.graceDays===4){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
 if(!ready)throw Error('API не подтвердил обновление с сохранением автоматики.')
 installed=true
 console.log('Обновление установлено. Автоматика подписки продолжает работать. Проверяю доставку и завершаю сообщения…')
 let response,result
 for(let i=0;i<10;i++){
  const body={purpose:'community-subscription-recovery',issuedAt:Date.now(),nonce:crypto.randomBytes(12).toString('hex'),operation:'finish_community_followup_20261110',send:true,input:{}}
  const key=crypto.createHmac('sha256',secret).update('community-subscription-recovery-admin-v1').digest(),signature=crypto.createHmac('sha256',key).update(JSON.stringify(body)).digest('hex')
  response=await fetch(url+'/api/internal/subscription-policy',{method:'POST',headers:{'Content-Type':'application/json','X-Recovery-Signature':signature},body:JSON.stringify(body),signal:AbortSignal.timeout(240000)});result=await response.json();if(response.status!==409)break
  await new Promise(r=>setTimeout(r,2000))
 }
 write(path.join(backup,'completion.json'),JSON.stringify(result,null,2))
 if(!response.ok||!result.ok)throw Error('Не все действия подтверждены: '+String(result.error||result.cases?.filter(c=>!c.ok).map(c=>c.name+': '+c.reason).join(', ')||response.status)+'. Отчёт: '+backup)
 const history=[...new Map((result.historical||[]).map(c=>[c.telegramId,c])).values()]
 console.log('Активных карточек с неподтверждённой историей: '+result.unverifiedCards+'.')
 if(history.length)console.log('Уже отсутствующие участники: '+history.map(c=>c.name+' (ID '+c.telegramId+')').join('; ')+'. В активные проблемы они не входят.')
 for(const c of result.cases){console.log(c.name+': '+(c.joined?'уже в сообществе':c.inviteAcceptedByTelegram?'Telegram подтвердил доставку приглашения; ожидается переход участника':'доставка приглашения пока не подтверждена, повтор остаётся в очереди')+'.')
  if(c.username==='civillaw_civile')console.log('Оплата Бреховой: '+(c.currentPaymentVerified?'подтверждена исходным уведомлением Prodamus'+(c.latestVerifiedPayment?' — '+c.latestVerifiedPayment.amount+' ₽':''):'банковского подтверждения текущего периода в журнале нет; доступ сохранён по вашему подтверждению, запись о деньгах не выдумана')+'.')
  if(c.username==='mulanka_7')console.log('Напоминание Диане на 350 ₽: '+(c.reminder350==='sent'?'Telegram подтвердил отправку':c.reminder350==='already_paid'?'не отправлялось — текущий период уже оплачен':'в очереди повторной доставки')+'.')
 }
 console.log('Подтверждённых автопродлений после включения новой автоматики: '+result.confirmedRenewalsSinceActivation+'.')
 if(result.pendingDeliveries||result.pendingReminders){if(result.inviteUrl)console.log('Ссылка для возвращения: '+result.inviteUrl);console.log('FOLLOWUP_PENDING_DELIVERY '+JSON.stringify({pendingInvites:result.pendingDeliveries,pendingReminders:result.pendingReminders,report:backup}));process.exitCode=2}
 else console.log('COMMUNITY_FOLLOWUP_READY '+JSON.stringify({automaticExclusionEnabled:true,activeUnverifiedCards:result.unverifiedCards,historicalAccounts:history.length,deliveryConfirmed:true,dianaReminder:result.cases.find(c=>c.username==='mulanka_7')?.reminder350,bankEvidenceMissing:result.bankEvidenceMissing,financialHistoryReplaced:false,report:backup}))
}catch(error){
 if(stopAttempted&&!installed){if(mutated)for(const f of files)try{if(f.before===null)fs.rmSync(f.file,{force:true});else write(f.file,f.before)}catch{};if(app)try{run('pm2',['restart',app.name])}catch{}}
 console.error(/^(Не |API|Код)/.test(error.message)?error.message:'Завершение не подтверждено. Секреты не выводятся. Отчёт: '+(backup||'не создан'));process.exitCode=1
}

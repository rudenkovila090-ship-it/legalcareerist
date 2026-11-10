import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {runtimeSettings} from './lib/bot-runtime-settings.mjs'
process.umask(0o077)
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:16*1048576})
const write=(file,body)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.rescue-'+crypto.randomBytes(4).toString('hex');try{fs.writeFileSync(temp,body,{mode:0o600});fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
const guard="  if (fs.existsSync(path.join(import.meta.dirname,'data/community-removals-paused.json'))) return false\n"
let app,backup,guarded=false,installed=false,rollback=[]
try{
 const apps=JSON.parse(run('pm2',['jlist'])).filter(a=>a.name==='legalcareerist-api')
 if(apps.length!==1)throw Error('Не найден единственный основной API.')
 app=apps[0];const state=app.pm2_env,config=runtimeSettings(state,{}),root=config.runtime,index=state.pm_exec_path,original=fs.readFileSync(index,'utf8')
 const header='async function kickAndNotify(join) {\n'
 if(original.split(header).length!==2)throw Error('Не найден однозначный обработчик исключения; код не заменён.')
 const base=process.env.BOT_RESCUE_BACKUP_ROOT||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'access-rescue-20261110-'))
 write(path.join(backup,'index.before'),original)
 write(path.join(root,'data/community-removals-paused.json'),JSON.stringify({paused:true,reason:'owner_reported_wrong_removals',at:Date.now()}))
 const safe=original.includes(guard)?original:original.replace(header,header+guard)
 write(path.join(backup,'safe.mjs'),safe);run(process.execPath,['--check',path.join(backup,'safe.mjs')])
 // Stop the running worker before replacing any code. The persistent pause is retained on EVERY failure.
 run('pm2',['stop',app.name]);write(index,safe);guarded=true
 console.log('Автоматические исключения остановлены. Защита сохранится после перезапуска.')
 const manifest=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'../updates/community-access-rescue/manifest.json')))
 for(const entry of manifest.files){
  const file=path.join(root,entry.path),payload=fs.readFileSync(path.join(import.meta.dirname,'../updates/community-access-rescue/server',entry.path),'utf8')
  if(hash(payload)!==entry.sha256)throw Error('Не совпала контрольная сумма пакета: '+entry.path)
  const physical=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null
  let after=entry.path==='index.js'?original:physical
  if(entry.new){if(physical!==null&&physical!==payload)throw Error('Неизвестная версия модуля: '+entry.path);after=payload}
  else {
   if(after===null)throw Error('Не найден модуль: '+entry.path)
   // Strip the emergency guard only while applying the base index diff; it is included in the final checked patch.
   if(entry.path==='index.js'&&!after.includes('accessRescueVersion: 1,'))after=after.replace(guard,'')
   for(const [before,next] of entry.edits){if(after.split(next).length===2)continue;if(after.split(before).length!==2)throw Error('Не удалось безопасно совместить: '+entry.path);after=after.replace(before,next)}
  }
  const n=rollback.length;rollback.push({file,before:physical});if(physical!==null)write(path.join(backup,n+'.before'),physical)
  const check=path.join(backup,n+'.mjs');write(check,after);run(process.execPath,['--check',check])
  write(path.join(backup,n+'.after'),after)
 }
 for(const [n,f]of rollback.entries()){if((fs.existsSync(f.file)?fs.readFileSync(f.file,'utf8'):null)!==f.before)throw Error('Код изменился во время установки.');write(f.file,fs.readFileSync(path.join(backup,n+'.after'),'utf8'))}
 run('pm2',['restart',app.name])
 const port=Number(config.value('PORT')||3001);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Не удалось проверить порт API.')
 const url='http://127.0.0.1:'+port
 let healthy=false
 for(let i=0;i<40;i++){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(3000)}),b=await r.json();if(r.ok&&b.ok&&b.accessRescueVersion===1&&b.automaticAccessRemovalPaused===true){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
 if(!healthy)throw Error('API не подтвердил исправление; возвращён прежний код с запретом исключений.')
 installed=true
 const secret=config.value('PRODAMUS_SECRET_KEY');if(!secret)throw Error('Не найден ключ подписанной операции. Исключения остаются остановлены.')
 let result,response
 for(let attempt=0;attempt<10;attempt++){
  const body={purpose:'community-subscription-recovery',issuedAt:Date.now(),nonce:crypto.randomBytes(12).toString('hex'),operation:'rescue_access_20261110',send:true,input:{}}
  const key=crypto.createHmac('sha256',secret).update('community-subscription-recovery-admin-v1').digest(),signature=crypto.createHmac('sha256',key).update(JSON.stringify(body)).digest('hex')
  response=await fetch(url+'/api/internal/subscription-policy',{method:'POST',headers:{'Content-Type':'application/json','X-Recovery-Signature':signature},body:JSON.stringify(body),signal:AbortSignal.timeout(240000)});result=await response.json()
  if(response.status!==409)break
  await new Promise(r=>setTimeout(r,2000))
 }
 write(path.join(backup,'result.json'),JSON.stringify(result,null,2))
 for(const c of result.cases||[]){console.log(c.name+': '+(!c.ok?'ВОССТАНОВЛЕНИЕ НЕ ПОДТВЕРЖДЕНО — '+c.error:c.joined?'уже в сообществе':c.awaitingIdentity?'допуск по @'+c.username+' сохранён; Telegram ID появится после Start или заявки':'блокировка снята, вход разрешён; ожидается заявка на вступление')+(c.lifetime?'; бессрочно, бесплатно, метка 350 ₽':'')+(c.realPaymentFound?'; подтверждение платежа найдено':c.username==='vmashik'||c.username==='civillaw_civile'?'; доступ разрешён по вашему подтверждению, платёж в журнале пока не подтверждён':'')+'.')}
 if(result.inviteUrl)console.log('Ссылка для возвращения в сообщество: '+result.inviteUrl)
 if(result.pendingAdminNotices)console.log('Уведомления администратору остаются в очереди: '+result.pendingAdminNotices+'. Повторная доставка автоматическая.')
 if(result.paymentJournalErrors)console.log('В журнале оплат есть повреждённые строки: '+result.paymentJournalErrors+'. Они не использовались как подтверждение оплаты.')
 if(!response.ok||!result.ok)throw Error('Не все восстановления подтверждены. Исключения остановлены. Отчёт: '+backup)
 console.log('ACCESS_RESCUE_APPLIED '+JSON.stringify({automaticAccessRemovalPaused:true,accessGranted:result.cases.length,joined:result.cases.filter(c=>c.joined).map(c=>c.username),awaitingJoin:result.cases.filter(c=>!c.joined).map(c=>c.username),financialHistoryReplaced:false,report:backup}))
}catch(error){
 if(guarded&&!installed){for(const f of rollback)try{if(f.before===null)fs.rmSync(f.file,{force:true});else write(f.file,f.before)}catch{};try{run('pm2',['restart',app.name])}catch{}}
 console.error(/^(Не |API)/.test(error.message)?error.message:'Восстановление не завершено. Секреты не выводятся. Отчёт: '+(backup||'не создан'))
 process.exitCode=1
}

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
let app,backup,pauseFile,guarded=false,installed=false,rollback=[]
try{
 const apps=JSON.parse(run('pm2',['jlist'])).filter(a=>a.name==='legalcareerist-api')
 if(apps.length!==1)throw Error('Не найден единственный основной API.')
 app=apps[0];const state=app.pm2_env,config=runtimeSettings(state,{}),root=config.runtime,index=state.pm_exec_path,original=fs.readFileSync(index,'utf8')
 const header='async function kickAndNotify(join) {\n'
 if(original.split(header).length!==2)throw Error('Не найден однозначный обработчик исключения; код не заменён.')
 const base=process.env.BOT_AUTOMATION_BACKUP_ROOT||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'automation-20261110-'))
 write(path.join(backup,'index.before'),original)
 pauseFile=path.join(root,'data/community-removals-paused.json');write(pauseFile,JSON.stringify({paused:true,reason:'owner_reported_wrong_removals',at:Date.now()}))
 const safe=original.includes(guard)?original:original.replace(header,header+guard)
 write(path.join(backup,'safe.mjs'),safe);run(process.execPath,['--check',path.join(backup,'safe.mjs')])
 // Stop the running worker before replacing any code. The persistent pause is retained on EVERY failure.
 run('pm2',['stop',app.name]);write(index,safe);guarded=true
 console.log('Автоматические исключения остановлены. Защита сохранится после перезапуска.')
 const manifest=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'../updates/community-subscription-automation/manifest.json')))
 for(const entry of manifest.files){
  const file=path.join(root,entry.path),payload=fs.readFileSync(path.join(import.meta.dirname,'../updates/community-subscription-automation/server',entry.path),'utf8')
  if(hash(payload)!==entry.sha256)throw Error('Не совпала контрольная сумма пакета: '+entry.path)
  const physical=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null
  let after=entry.path==='index.js'?original:physical
  if(entry.new){if(physical!==null&&physical!==payload)throw Error('Неизвестная версия модуля: '+entry.path);after=payload}
  else {
   if(after===null)throw Error('Не найден модуль: '+entry.path)
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
 for(let i=0;i<40;i++){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(3000)}),b=await r.json();if(r.ok&&b.ok&&b.subscriptionAutomation===1&&b.automaticAccessRemovalPaused===true){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
 if(!healthy)throw Error('API не подтвердил исправление; возвращён прежний код с запретом исключений.')
 installed=true
 const secret=config.value('PRODAMUS_SECRET_KEY');if(!secret)throw Error('Не найден ключ подписанной операции. Исключения остаются остановлены.')
 const operation=async send=>{
  for(let attempt=0;attempt<10;attempt++){
   const body={purpose:'community-subscription-recovery',issuedAt:Date.now(),nonce:crypto.randomBytes(12).toString('hex'),operation:'activate_subscription_automation_v1',send,input:{}}
   const key=crypto.createHmac('sha256',secret).update('community-subscription-recovery-admin-v1').digest(),signature=crypto.createHmac('sha256',key).update(JSON.stringify(body)).digest('hex')
   const r=await fetch(url+'/api/internal/subscription-policy',{method:'POST',headers:{'Content-Type':'application/json','X-Recovery-Signature':signature},body:JSON.stringify(body),signal:AbortSignal.timeout(240000)}),bodyResult=await r.json()
   if(r.status!==409)return{status:r.status,body:bodyResult}
   await new Promise(r=>setTimeout(r,2000))
  }
  return{status:409,body:{ok:false,error:'maintenance_running'}}
 }
 console.log('Проверяю права бота, оплаты и персональные исключения перед включением…')
 const preview=await operation(false);write(path.join(backup,'preview.json'),JSON.stringify(preview.body,null,2))
 if(preview.status!==200||!preview.body.ok||!preview.body.permanentExceptionsConfirmed)throw Error('Не удалось подтвердить готовность: '+String(preview.body.error||preview.status)+'. Отчёт: '+backup)
 const applied=await operation(true);write(path.join(backup,'activation.json'),JSON.stringify(applied.body,null,2))
 if(applied.status!==200||!applied.body.ok||!applied.body.enabled||!applied.body.cycle?.ok||!applied.body.website?.ok||applied.body.website.realChargePerformed!==false)throw Error('Не удалось включить автоматику: '+String(applied.body.error||applied.body.cycle?.reason||applied.status)+'. Отчёт: '+backup)
 const rr=await fetch(url+'/api/health',{signal:AbortSignal.timeout(5000)}),h=await rr.json()
 if(!rr.ok||!h.autoExclude||h.automaticAccessRemovalPaused||h.graceDays!==4||!h.automationLastCycle?.ok)throw Error('Не подтверждён действующий цикл автоматики. Отчёт: '+backup)
 const holds=(applied.body.plan||[]).filter(c=>!['eligible_after_membership_check','owner_protected','active_access','grace_not_finished','chat_administrator'].includes(c.reason))
 console.log('Автоматика включена: оплаченный срок → 4 суток → сверка оплат и исключений → удаление при отсутствии доступа.')
 console.log('Анастасия и Диана защищены. Платежи, метки, приглашения и уведомления обрабатываются автоматически. Действующие договоры Prodamus не отключались.')
 console.log('Форма оплаты сайта проверена: ссылка создана, тестовая заявка удалена, списаний не было.')
 if(applied.body.historical?.length)console.log('Исторических карточек уже отсутствующих участников: '+applied.body.historical.length+'. В активные проблемы они не входят.')
 if(holds.length)console.log('Карточек с неподтверждённой историей, требующих сверки: '+holds.length+'. Они не исключаются по предположению; служебная проверка сохраняется без повторного спама.')
 console.log('SUBSCRIPTION_AUTOMATION_READY '+JSON.stringify({enabled:true,graceDays:4,intervalSeconds:30,permanentExceptionsConfirmed:true,websiteCheckoutVerified:true,lastCycleOk:true,reconciliation:applied.body.reconciliation,unverifiedCards:holds.length,financialHistoryReplaced:false,report:backup}))

}catch(error){
 if(pauseFile)try{write(pauseFile,JSON.stringify({paused:true,reason:'automation_installation_not_verified',at:Date.now()}))}catch{}
 if(guarded&&!installed){for(const f of rollback)try{if(f.before===null)fs.rmSync(f.file,{force:true});else write(f.file,f.before)}catch{};try{run('pm2',['restart',app.name])}catch{}}
 console.error(/^(Не |API)/.test(error.message)?error.message:'Автоматика не включена; исключения оставлены на паузе. Секреты не выводятся. Отчёт: '+(backup||'не создан'))
 process.exitCode=1
}

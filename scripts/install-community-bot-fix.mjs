import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { parseEnv } from 'node:util'
import { execFileSync } from 'node:child_process'
process.umask(0o077)
const pkg=path.resolve(process.argv[2]||path.join(import.meta.dirname,'../updates/community-bot'))
const m=JSON.parse(fs.readFileSync(path.join(pkg,'manifest.json'),'utf8'))
const sha=v=>crypto.createHash('sha256').update(v).digest('hex')
const run=(c,a,extra={})=>execFileSync(c,a,{stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:16*1048576,...extra})
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const write=(f,b)=>{fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});const tmp=f+'.bot-'+crypto.randomBytes(5).toString('hex');try{fs.writeFileSync(tmp,b,{mode:0o600});fs.renameSync(tmp,f)}finally{fs.rmSync(tmp,{force:true})}}
const processes=()=>JSON.parse(run('pm2',['jlist'])).filter(a=>['legalcareerist-api','legalcareerist-resident-demo'].includes(a.name))
const initial=processes(),apps=[],planned=[]
let backup,stopped=false,written=false,installed=false
const health=async app=>{try{const r=await fetch('http://127.0.0.1:'+app.port+'/api/health',{signal:AbortSignal.timeout(3000)});return r.ok?await r.json():{}}catch{return{}}}
const checked=async(app,updated)=>{for(let i=0;i<30;i++){const h=await health(app);if(h.ok&&(!updated||(h.subscriptionExpiry===3&&h.automaticProviderCancellation===false)))return h;await pause(500)}throw Error('API не подтвердил запуск: '+app.name)}
function reconcile(text,edits){let s=text;for(const [a,b,prior=[]]of edits){if(s.split(b).length===2)continue;const matches=[a,...prior].filter(v=>s.split(v).length===2);if(matches.length!==1)throw Error('Не удалось безопасно совместить код бота. Замена не выполнена.');s=s.replace(matches[0],b)}return s.replace(/\bproviderStopBeforeRemoval:\s*true\b/g,'providerStopBeforeRemoval: false')}
function protectedFiles(app){return Object.fromEntries(fs.readdirSync(path.join(app.root,'lib')).filter(n=>n.endsWith('.js')&&!m.backend.some(f=>f.path==='lib/'+n)).map(n=>[n,sha(fs.readFileSync(path.join(app.root,'lib',n)))]))}
function protect(app){for(const [name,hash]of Object.entries(app.protected))if(sha(fs.readFileSync(path.join(app.root,'lib',name)))!==hash)throw Error('Изменился модуль вне обновления: '+name)}
async function audit(name){const dest=path.join(backup,name+'.json');const output=run(process.execPath,[path.join(import.meta.dirname,'audit-community-bot.mjs')],{env:{...process.env,BOT_AUDIT_OUTPUT:dest},timeout:180000});return JSON.parse(output)}
try{
 if(m.kind!=='community-bot-20261110-v1'||initial.filter(a=>a.name==='legalcareerist-api').length!==1||new Set(initial.map(a=>a.name)).size!==initial.length)throw Error('Нужен единственный основной процесс API.')
 for(const a of initial){const e=a.pm2_env;if(e.status!=='online'||!e.pm_exec_path||e.pm_exec_path!==fs.realpathSync(e.pm_exec_path))throw Error('Не удалось проверить работающий API.');const root=path.dirname(e.pm_exec_path),port=Number(e.PORT||e.env?.PORT||3001);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Не удалось проверить порт API.');const app={name:a.name,root,port,script:e.pm_exec_path,state:e};app.protected=protectedFiles(app);app.health=await checked(app,false);apps.push(app)}
 const base=process.env.BOT_FIX_BACKUP_ROOT||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'audit-20261110-'));write(path.join(backup,'package.json'),'{"type":"module"}')
 for(const app of apps)for(const f of m.backend){if(!/^(?:index\.js|lib\/[A-Za-z0-9_-]+\.js)$/.test(f.path))throw Error('Неверный путь в пакете.');const file=path.join(app.root,f.path),before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;let after
  if(f.edits){if(before===null)throw Error('Не найден основной код API.');after=reconcile(before,f.edits)}else{after=fs.readFileSync(path.join(pkg,'payload/server',f.path),'utf8');if(sha(after)!==f.sha256)throw Error('Повреждён пакет: '+f.path);if(before!==after&&!f.beforeSha256.includes(before===null?null:sha(before)))throw Error('Версия модуля отличается от проверенной: '+f.path)}
  const staged=path.join(backup,'syntax',app.name,f.path);write(staged,after);run(process.execPath,['--check',staged]);if(before!==null)write(path.join(backup,'before',app.name,f.path),before);planned.push({file,before,after})
 }
 console.log('Код проверен. Снимаю безопасный отчёт о подписках и правах бота…')
 const beforeAudit=await audit('before')
 for(const app of apps){protect(app);for(const f of planned.filter(f=>f.file.startsWith(app.root+path.sep)))if((fs.existsSync(f.file)?fs.readFileSync(f.file,'utf8'):null)!==f.before)throw Error('Код изменился во время подготовки.')}
 // Accepted payments are journaled; a short restart preserves payment retries and shared data.
 for(const app of [...apps].reverse())run('pm2',['stop',app.name]);stopped=true
 written=true;for(const f of planned)if(f.before!==f.after)write(f.file,f.after)
 for(const app of apps)run('pm2',['restart',app.name])
 for(const app of apps){await checked(app,true);protect(app)}
 stopped=false;installed=true
 const main=apps.find(a=>a.name==='legalcareerist-api');let fileEnv={};try{fileEnv=parseEnv(fs.readFileSync(path.join(main.root,'.env'),'utf8'))}catch{}
 const secret=main.state.PRODAMUS_SECRET_KEY||main.state.env?.PRODAMUS_SECRET_KEY||fileEnv.PRODAMUS_SECRET_KEY
 if(!secret)throw Error('Код установлен; не найден ключ локальной сверки карточек.')
 const body={purpose:'community-subscription-recovery',issuedAt:Date.now(),nonce:crypto.randomBytes(12).toString('hex'),operation:'repair_community_20261110',send:false,input:{}}
 const key=crypto.createHmac('sha256',secret).update('community-subscription-recovery-admin-v1').digest(),signature=crypto.createHmac('sha256',key).update(JSON.stringify(body)).digest('hex')
 console.log('API запущен. Сверяю карточки и бессрочный доступ; история оплат не заменяется…')
 const r=await fetch('http://127.0.0.1:'+main.port+'/api/internal/subscription-policy',{method:'POST',headers:{'Content-Type':'application/json','X-Recovery-Signature':signature},body:JSON.stringify(body),signal:AbortSignal.timeout(180000)})
 const repair=await r.json();if(!r.ok||!repair.ok)throw Error('Код установлен; автоматическая сверка карточек не завершена.')
 write(path.join(backup,'repairs.json'),JSON.stringify(repair,null,2))
 const after=await audit('after');if(after.api.health.subscriptionExpiry!==3||after.api.health.automaticProviderCancellation!==false||after.api.webhookRejectsUnsigned.http!==400||after.api.subscriptionFormRejectsMissingConsent.http!==400||after.api.publicSubscriptionRejectsMissingConsent.http!==400)throw Error('Код установлен; контрольная проверка формы оплаты не пройдена.')
 if(after.storageErrors?.length||after.payments.malformedLines)throw Error('Код установлен; требуется сверка повреждённых файлов данных. Отчёт: '+backup)
 if(!after.telegram.ok||!after.telegram.botRights?.invite||!after.telegram.botRights?.restrict||!after.configuration.inviteLink)throw Error('Код установлен; требуется проверить права бота и ссылку на вступление. Отчёт: '+backup)
 console.log('BOT_FIX_READY '+JSON.stringify({automaticProviderCancellation:false,graceDays:after.configuration.graceDays,telegram:after.telegram,repairs:repair,financialHistoryReplaced:false,report:backup}))
 const moscow=t=>t?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'medium'}).format(new Date(t)):null
 for(const c of after.cases)console.log('CASE '+JSON.stringify({name:c.name,ambiguous:c.ambiguous,membership:c.telegramIds,cards:c.cards.map(j=>({ref:j.ref,billingStatus:j.status,access:j.access,lifetime:j.lifetime,paidUntil:moscow(j.paidUntil),accessUntil:moscow(j.accessUntil),accessClosedAt:moscow(j.accessClosedAt),inChat:j.inChat,review:j.review?.state==='pending'?j.review.reason:null,nominalPrice:j.complimentary?.nominalAmount||null,cancellation:j.cancellation?.source}))}))
}catch(e){
 if(!installed&&written){for(const f of planned)try{if(f.before===null)fs.rmSync(f.file,{force:true});else write(f.file,f.before)}catch{};for(const app of apps)try{run('pm2',['restart',app.name])}catch{}}
 else if(!installed&&stopped)for(const app of apps)try{run('pm2',['restart',app.name])}catch{}
 console.error(/^(Нужен|Не удалось|Неверный|Не найден|Повреждён|Версия|Код|API|Изменился)/.test(e.message)?e.message:'Проверка остановлена. Секреты не выводятся; проверьте журнал в '+(backup||'PM2')+'.')
 process.exitCode=1
}

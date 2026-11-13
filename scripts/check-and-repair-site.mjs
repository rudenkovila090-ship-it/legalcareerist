// Run on the website server as root. Only public modes and a proven SPA fallback
// collision may be repaired. No bot, payment or membership changes.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {nginxRoots} from './repair-community-promo-static.mjs'
import {staticAccessPlan, applyStaticAccess, ancestorDirectories, nginxWorkerUser, traversalAcl} from './lib/site-static-access.mjs'
import {runtimeSettings, telegramRead} from './lib/bot-runtime-settings.mjs'
import {currentBundle} from './lib/site-bundle.mjs'
import {nginxRoutingChanges,applyRoutingChanges,directoryIndexEvidence} from './lib/nginx-spa-routing.mjs'

process.umask(0o077)
if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
  console.error('Запустите эту команду от root на сервере сайта; изменений нет.')
  process.exit(1)
}
const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i+1] }
const origin = new URL('https://legalcareerist.ru'), results = [], operations = []
const sha = b => crypto.createHash('sha256').update(b).digest('hex')
const command = (name, argv, timeout=15000) => spawnSync(name, argv, {encoding:'utf8', timeout, maxBuffer:32*1024*1024})
let backup, plan, runtime, app, nginxConfig, worker
function nginxLogTail() {
  if(!nginxConfig)return ''
  const lines=[],logs=[...nginxConfig.matchAll(/\berror_log\s+(\/[^\s;]+)[^;]*;/g)].map(m=>m[1])
  for(const logfile of [...new Set([...logs,'/var/log/nginx/error.log'])])try{
    const fd=fs.openSync(logfile,'r');let tail
    try{const size=fs.fstatSync(fd).size,length=Math.min(size,65536),buffer=Buffer.alloc(length);fs.readSync(fd,buffer,0,length,size-length);tail=buffer.toString()}finally{fs.closeSync(fd)}
    lines.push(tail)
  }catch{}
  return lines.join('\n')
}
function nginxErrorHints() {
  const errors=new Set()
  for(const line of nginxLogTail().split('\n').filter(l=>l.includes(origin.hostname))){
      if(line.includes('Permission denied'))errors.add('Permission denied: права/ACL/политика безопасности')
      if(line.includes('directory index')&&line.includes('is forbidden'))errors.add('directory index is forbidden: нет подходящего index или неверен root/index')
      if(line.includes('access forbidden by rule'))errors.add('access forbidden by rule: запрет в конфигурации nginx')
  }
  return [...errors]
}
const report = (name, ok, detail='') => {
  results.push({name, ok, detail}); console.log(`[${ok ? 'OK' : 'ПРОБЛЕМА'}] ${name}${detail ? ': ' + detail : ''}`)
}
const save = () => {
  if (!backup) return
  fs.writeFileSync(path.join(backup, 'report.json'), JSON.stringify({at:new Date().toISOString(), results, operations}, null, 2), {mode:0o600})
}
const ensureBackup = () => {
  if (!backup) {
    const base = option('--backup-root') || '/root/legalcareerist-bot-backups'
    fs.mkdirSync(base, {recursive:true, mode:0o700})
    backup = fs.mkdtempSync(path.join(base, 'site-health-20261114-'))
    fs.chmodSync(backup, 0o700)
  }
  return backup
}
const record = operation => { ensureBackup(); operations.push(operation); save() }
const get = async (url, options={}) => {
  const response = await fetch(url, {...options, signal:AbortSignal.timeout(15000), headers:{'Cache-Control':'no-cache', ...options.headers}})
  return {status:response.status, type:response.headers.get('content-type') || '', body:Buffer.from(await response.arrayBuffer())}
}
const localNginx = route => {
  // An on-server loopback probe with the real Host, SNI and certificate verification.
  // Only used after nginx -T has confirmed this is the origin server.
  const result = command('curl', ['--silent', '--show-error', '--location', '--max-redirs', '3', '--max-time', '15', '--resolve', origin.hostname+':443:127.0.0.1', '--noproxy', origin.hostname, '--output', '/dev/null', '--write-out', '%{http_code}', origin.href.replace(/\/$/,'')+route])
  return result.status === 0 ? Number(result.stdout) : null
}
const can = (permission, file) => command('runuser', ['-u', worker, '--', 'test', permission, file]).status === 0

try {
  const valid = command('nginx', ['-t'])
  if (valid.status !== 0) throw Error('nginx -t не прошёл; конфигурация не изменялась. Выполните nginx -t для точной ошибки')
  const config = command('nginx', ['-T'])
  if (config.status !== 0) throw Error('Не прочитана конфигурация nginx')
  nginxConfig = config.stdout; report('Конфигурация nginx', true)
  const before = localNginx('/')
  console.log('[ДО] Локальный nginx: '+(before === null ? 'TLS/соединение не подтверждены' : 'HTTP '+before))
  const roots = nginxRoots(nginxConfig, origin.hostname,443)
  const candidates = [], rejected=[]
  for (const root of roots) {
    try { const candidate=staticAccessPlan(root); if(!candidates.some(p=>p.root===candidate.root))candidates.push(candidate) }
    catch(e) { rejected.push(root+': '+(e.code||e.message)) }
  }
  if (candidates.length !== 1) throw Error('Не найден единственный безопасный публичный корень nginx. Настроенные корни: '+(roots.join(', ') || 'не определены')+'. '+rejected.join('; ')+'. '+nginxErrorHints().join('; ')+'. Нет изменений файлов или nginx')
  plan = candidates[0]
  report('Публичная сборка nginx', true, plan.root)
  worker = nginxWorkerUser(nginxConfig)
  if (!worker || command('id', ['-u', worker]).status !== 0 || worker === 'root') throw Error('Не определён непривилегированный пользователь nginx; права не изменялись')
  const test = command('runuser', ['-u', worker, '--', 'test', '-d', '/'])
  if (test.status !== 0) throw Error('Не удалось проверить права от пользователя nginx '+worker)
  report('Пользователь nginx', true, worker)
  const blocked = ancestorDirectories(plan.root).filter(p=>!can('-x',p))
  // Preflight ACL support for private ancestors before touching any permissions.
  if (blocked.length && (command('getfacl', ['--version']).status !== 0 || command('setfacl', ['--version']).status !== 0)) {
    throw Error('nginx не может пройти по каталогу '+blocked.join(', ')+'. Для точечного разрешения нужен пакет acl; закрытые каталоги не раскрывались')
  }
  const denied = before === 403 || plan.changes.some(c=>!can(c.directory?'-x':'-r',c.path))
  if (denied || blocked.length) {
    ensureBackup()
    for (const parent of blocked) {
      if(can('-x',parent))continue
      const acl = command('getfacl', ['--absolute-names', '--', parent])
      if (acl.status !== 0) throw Error('Не прочитана ACL '+parent)
      const saved = path.join(backup, 'ancestor-'+operations.length+'.acl')
      fs.writeFileSync(saved, acl.stdout, {mode:0o600})
      record({type:'ancestor-acl', path:parent, beforeFile:saved, worker})
      if (command('setfacl', [...traversalAcl(acl.stdout,worker), '--', parent]).status !== 0) throw Error('Не предоставлен проход nginx по '+parent)
    }
    const count = denied ? applyStaticAccess(plan, change=>record({type:'public-mode', ...change})) : 0
    report('Права публичной сборки исправлены', true, count+' файлов/каталогов; проход по родителям: '+blocked.length)
  } else report('Права публичной сборки', true, 'исправление не требуется')
  const unreadable = [...plan.directories.filter(p=>!can('-x',p)), ...[path.join(plan.root,'index.html'),path.join(plan.root,plan.entry)].filter(p=>!can('-r',p))]
  if (unreadable.length) report('Доступ nginx к сборке', false, unreadable.join(', ')+'; проверьте ACL/SELinux/AppArmor')
  else report('Доступ nginx к сборке', true)
  const after = localNginx('/')
  report('Локальный nginx после проверки', after === 200, after === null ? 'TLS/соединение не подтверждены' : 'HTTP '+after)
  if (after === 403) {
    report('Записи 403 в хвосте журнала nginx', false, nginxErrorHints().join('; ') || 'нет подходящих записей; требуется журнал виртуального хоста')
  }
  const probeAt=Date.now(),events=localNginx('/events/')
  const directory=path.join(plan.root,'events'),aliases=roots.filter(root=>{try{return fs.realpathSync(root)===plan.root}catch{return false}})
  if(after===200&&events===403&&fs.existsSync(directory)&&fs.statSync(directory).isDirectory()&&!['index.html','index.htm'].some(name=>fs.existsSync(path.join(directory,name)))){
    if(!directoryIndexEvidence(nginxLogTail(),[plan.root,...aliases],origin.hostname,probeAt)){
      report('Причина отказа /events/',false,'нет свежего подтверждения directory index is forbidden для каталога events; nginx не изменялся')
    }else{
      console.log('[ФАКТ] /events/: nginx выбрал каталог изображений вместо маршрута приложения; подтверждено свежей записью журнала')
      const changes=nginxRoutingChanges(nginxConfig,origin.hostname,plan.root)
      const count=await applyRoutingChanges(changes,{run:command,backup:ensureBackup(),record,verify:async()=>{
        for(let attempt=0;attempt<20;attempt++){
          if(localNginx('/events/')===200&&localNginx('/events')===200&&localNginx('/')===200&&localNginx(plan.entry)===200&&localNginx('/api/health')===200&&(!fs.existsSync(path.join(directory,'kutafin-legal-cup-xvi.jpg'))||localNginx('/events/kutafin-legal-cup-xvi.jpg')===200))return true
          await new Promise(resolve=>setTimeout(resolve,150))
        }
        return false
      }})
      report('Маршрут /events исправлен',true,'убран выбор каталогов $uri/ в '+count+' правилах SPA; nginx -t и проверка после reload прошли')
    }
  }
} catch (e) { report('Проверка/исправление статики', false, e.message) }

// Do the remaining independent checks even if static repair could not be completed.
try {
  const list = command('pm2', ['jlist'])
  if (list.status !== 0) throw Error('PM2 недоступен')
  const found = JSON.parse(list.stdout).filter(a=>a.name==='legalcareerist-api')
  if(found.length!==1)throw Error('Не найден единственный процесс legalcareerist-api')
  app=found[0];runtime=runtimeSettings(app.pm2_env,{})
  report('API в PM2', app.pm2_env.status==='online', app.pm2_env.status)
  const port=Number(runtime.value('PORT')||3001)
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Не определён порт API')
  const local=await get('http://127.0.0.1:'+port+'/api/health'), health=JSON.parse(local.body)
  report('Локальный API', local.status===200&&health.ok===true, 'HTTP '+local.status)
  report('Квест новичка: обработчик и задержка', health.communityOnboarding===1&&health.newcomerQuestDelayMs===600000&&health.newcomerQuestReady===true)
  const pdf=path.join(runtime.runtime,'data/community-assets/newcomer-quest.pdf')
  report('Квест новичка: точный PDF',fs.existsSync(pdf)&&sha(fs.readFileSync(pdf))==='ac44f51bc9e8c68edaa14bfa0fbcfb41074cdd005a7d3f7d29acb99dd0609b54')
  const jsonFiles=fs.readdirSync(path.join(runtime.runtime,'data')).filter(f=>f.endsWith('.json')), invalid=[]
  for(const f of jsonFiles)try{JSON.parse(fs.readFileSync(path.join(runtime.runtime,'data',f),'utf8'))}catch{invalid.push(f)}
  report('Целостность JSON-хранилищ',invalid.length===0,invalid.length?invalid.join(', '):'проверено '+jsonFiles.length+'; данные не изменялись')
  const queueFile=path.join(runtime.runtime,'data/community-onboarding.json')
  if(fs.existsSync(queueFile)){
    const jobs=Object.values(JSON.parse(fs.readFileSync(queueFile,'utf8'))),held=jobs.filter(j=>j.state==='uncertain'),late=jobs.filter(j=>j.state==='pending'&&j.dueAt<Date.now()-5*60000)
    report('Очередь Квеста новичка',!held.length&&!late.length,'всего '+jobs.length+'; с неопределённой отправкой '+held.length+'; просроченных '+late.length)
  }
  for(const key of ['PRODAMUS_SECRET_KEY','TELEGRAM_BOT_TOKEN'])report('Настроен '+key,Boolean(runtime.value(key)))
} catch (e) { report('Проверка API на сервере',false,'не подтверждена: '+(e instanceof SyntaxError ? 'некорректный JSON' : e.code||e.message)) }

const routes=['/','/community','/events','/events/','/events/materials','/kadry','/kadry/vacancies','/marketplace','/cabinet','/contacts','/legal/privacy']
for(const route of routes)try{
  const result=await get(new URL(route+'?sitecheck='+Date.now(),origin))
  report('HTTPS '+route,result.status===200&&result.type.includes('text/html')&&Boolean(plan)&&result.body.includes(Buffer.from(plan.entry)),'HTTP '+result.status+(plan?'':'; сборка не определена'))
}catch(e){report('HTTPS '+route,false,'соединение/TLS не подтверждены: '+e.name)}
if(plan&&fs.existsSync(path.join(plan.root,'events/kutafin-legal-cup-xvi.jpg')))try{
  const cover=await get(new URL('/events/kutafin-legal-cup-xvi.jpg',origin))
  report('Обложка мероприятия',cover.status===200&&cover.body.equals(fs.readFileSync(path.join(plan.root,'events/kutafin-legal-cup-xvi.jpg'))),'HTTP '+cover.status)
}catch{report('Обложка мероприятия',false,'содержимое файла не подтверждено')}

if(plan)try{
  const bundle=currentBundle(plan),files=bundle.assets.map(asset=>path.join(plan.root,asset)),failed=[]
  report('Зависимости текущей сборки',bundle.missing.length===0,bundle.missing.length?bundle.missing.join(', '):'найдено '+files.length+'; старые версии JS сохранены')
  // Four concurrent requests; compare bytes to catch HTML fallbacks and stale chunks.
  let at=0
  await Promise.all(Array.from({length:4},async()=>{while(at<files.length){const file=files[at++],relative='/'+path.relative(plan.root,file).split(path.sep).join('/');try{const r=await get(new URL(relative,origin));if(r.status!==200||!r.body.equals(fs.readFileSync(file)))failed.push(relative+' HTTP '+r.status)}catch{failed.push(relative+' соединение не подтверждено')}}}))
  report('JS/CSS текущей опубликованной сборки',failed.length===0,'проверено '+files.length+(failed.length?'; ошибки: '+failed.join(', '):'; байты совпадают со сборкой'))
  report('Промокод в текущей сборке',bundle.promo)
  for(const [name,forms]of Object.entries(bundle.forms))report('Форма '+name+' в текущей сборке',forms.length===1,forms.length===1?forms[0]:'найдено '+forms.length)
}catch(e){report('Зависимости текущей сборки',false,'не подтверждены: '+(e.code||e.name))}
try{
  const r=await get(new URL('/api/health',origin)),h=JSON.parse(r.body)
  report('Публичный API через nginx',r.status===200&&h.ok===true,'HTTP '+r.status)
}catch{report('Публичный API через nginx',false,'ответ JSON/API не подтверждён')}
for(const [tariffId,amount,months,promoCode,subscriptionId] of [['1m',690,1,'','2854597'],['3m',1770,3,'','3005286'],['6m',3180,6,'','3005289'],['1m',350,1,'KQ1111','2611878']])try{
  const r=await get(new URL('/api/community/promo',origin),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tariffId,promoCode})}),q=JSON.parse(r.body)
  report('Расчёт '+(promoCode||tariffId),r.status===200&&q.ok===true&&q.amount===amount&&q.months===months&&String(q.subscriptionId)===subscriptionId&&q.applied===Boolean(promoCode),q.ok?`${q.amount} ₽ / ${q.months} мес.`:'HTTP '+r.status+'; скидка не подтверждена')
}catch{report('Расчёт '+(promoCode||tariffId),false,'не подтверждён; счёт не создавался')}

if(runtime?.value('TELEGRAM_BOT_TOKEN'))try{
  const token=runtime.value('TELEGRAM_BOT_TOKEN'),me=await telegramRead(token,'getMe'),hook=await telegramRead(token,'getWebhookInfo')
  report('Telegram: доступ к боту',me.ok,me.ok?'@'+me.result.username:String(me.errorCode))
  const polling=String(runtime.value('TELEGRAM_POLLING')??'1')!=='0'
  const webhook=hook.result?.url,expectedHost=new URL(runtime.value('SITE_URL')||origin).hostname
  const owned=Boolean(webhook)&&new URL(webhook).hostname===expectedHost
  report('Telegram: получение событий',hook.ok&&(owned||!webhook&&polling),!hook.ok?'getWebhookInfo не подтверждён':webhook?(owned?'webhook своего сайта':'webhook другого сервиса'):(polling?'polling включён; фактический getUpdates не проверялся':'нет webhook и polling выключен'))
  if(owned)report('Telegram: события вступления',Array.isArray(hook.result.allowed_updates)&&hook.result.allowed_updates.includes('chat_member'))
  if(me.ok&&runtime.chat){const rights=await telegramRead(token,'getChatMember',{chat_id:runtime.chat,user_id:me.result.id});report('Telegram: бот администратор сообщества',rights.ok&&['administrator','creator'].includes(rights.result?.status))}
  else report('Telegram: чат сообщества определён',false)
}catch{report('Telegram',false,'соединение или конфигурация не подтверждены')}
ensureBackup(); save()
const failed=results.filter(r=>!r.ok)
console.log('Отчёт и резервные копии: '+backup)
console.log('Проверка не создаёт оплат, не отправляет сообщения, не меняет доступ участников и настройки бота. Реальная оплата и доставка PDF новым участникам этой проверкой не подтверждаются.')
if(failed.length){console.log('SITE_CHECK_INCOMPLETE: не прошли проверки: '+failed.map(f=>f.name).join('; '));process.exitCode=1}
else console.log('SITE_CHECK_PASSED: страницы, JS/CSS, API, тарифы, промокод и настройки получения событий прошли перечисленные проверки.')

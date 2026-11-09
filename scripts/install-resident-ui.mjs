// Install the reviewed resident cabinet and blog release without replacing billing code.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
process.umask(0o077)
const pkg=path.resolve(process.argv[2]||path.join(import.meta.dirname,'../updates/resident-ui'))
const manifest=JSON.parse(fs.readFileSync(path.join(pkg,'manifest.json'),'utf8'))
const site=path.resolve(process.env.UI_SITE_ROOT||'/var/www/legalcareerist')
const buildRoot=path.resolve(process.env.UI_BUILD_ROOT||'/root/legalcareerist-event-builds')
const publicRoot=path.resolve(process.env.UI_PUBLIC_ROOT||'/var/www/legalcareerist-web-releases')
const publicUrl=process.env.UI_PUBLIC_URL||'https://legalcareerist.ru'
const sha=v=>crypto.createHash('sha256').update(v).digest('hex')
const run=(cmd,args,extra={})=>execFileSync(cmd,args,{stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:16*1048576,...extra})
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const write=(file,content,mode=0o600)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.ui-'+crypto.randomBytes(5).toString('hex');try{fs.writeFileSync(tmp,content,{mode});fs.chmodSync(tmp,mode);fs.renameSync(tmp,file)}finally{fs.rmSync(tmp,{force:true})}}
const readProcesses=()=>JSON.parse(run('pm2',['jlist'])).filter(p=>['legalcareerist-api','legalcareerist-resident-demo'].includes(p.name))
const details=p=>({name:p.name,pid:p.pid,status:p.pm2_env?.status,script:p.pm2_env?.pm_exec_path,cwd:p.pm2_env?.pm_cwd,port:Number(p.pm2_env?.PORT||p.pm2_env?.env?.PORT||3001)})
const deploymentHealth=async(app)=>{
 const headers={};if(app.name==='legalcareerist-resident-demo'){const original=readProcesses().find(p=>p.name===app.name);const key=original?.pm2_env?.RESIDENT_DEMO_PROXY_KEY||original?.pm2_env?.env?.RESIDENT_DEMO_PROXY_KEY;if(key)headers['x-resident-demo-key']=key}
 const r=await fetch('http://127.0.0.1:'+app.port+'/api/health',{headers,signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Проверка API не пройдена: '+app.name)
 const value=await r.json();if(value.ok!==true)throw Error('Проверка API не пройдена: '+app.name)
 return Object.fromEntries(['ok','autoExclude','graceDays','cardBlockHours','providerStopBeforeRemoval','subscriptionExpiry','subscriptionRecovery','subscriptionOffboarding'].map(k=>[k,value[k]??null]))
}
async function verifyEventCheckout(base) {
 for(const event of manifest.catalogUpdates||[])if(event.collectTicketLead){
  for(const [route,body,expected]of [
   ['promo',{tariffId:'light',code:'__UI_CHECK_INVALID_20261109__'},'invalid_promo'],
   ['checkout',{tariffId:'light',consent:{}},'consent_required'],
  ]){
   const response=await fetch(base+'/api/event/'+encodeURIComponent(event.slug)+'/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(7000)})
   const result=await response.json().catch(()=>({}))
   if(response.status!==400||result.error!==expected)throw Error('API не подтвердил форму билета и промокод: '+route+' ('+response.status+').')
  }
 }
}
function sourceAndConfigs(){
 const dump=run('nginx',['-T']).toString(),configs=new Map()
 for(const match of dump.matchAll(/^# configuration file (.+):\r?\n([\s\S]*?)(?=^# configuration file |$(?![\s\S]))/gm)){
  const file=fs.realpathSync(match[1]),before=fs.readFileSync(file,'utf8'),roots=[]
  for(const m of before.matchAll(/^[ \t]*root[ \t]+("[^"\r\n]+"|'[^'\r\n]+'|[^;\s]+)[ \t]*;/gm)){
   const value=m[1].replace(/^(["'])(.*)\1$/,'$2')
   if(value===path.join(site,'dist')||value.startsWith(publicRoot+path.sep))roots.push(value)
  }
  if(roots.length)configs.set(file,{file,before,roots:[...new Set(roots)],mode:fs.statSync(file).mode&0o777})
 }
 const items=[...configs.values()],roots=[...new Set(items.flatMap(c=>c.roots))]
 if(roots.length!==1)throw Error('Не удалось однозначно определить действующий сайт в Nginx.')
 let source=roots[0]===path.join(site,'dist')?site:null
 if(!source&&fs.existsSync(buildRoot))for(const name of fs.readdirSync(buildRoot)){
  const candidate=path.join(buildRoot,name)
  try{const meta=JSON.parse(fs.readFileSync(path.join(candidate,'deployment.json'),'utf8'));if(meta.release===path.dirname(roots[0])&&sha(fs.readFileSync(path.join(candidate,'dist/index.html')))===sha(fs.readFileSync(path.join(roots[0],'index.html')))){source=candidate;break}}catch{}
 }
 if(!source)throw Error('Не найдены исходники действующей сборки. Рабочий сайт сохранён.')
 return {source,configs:items}
}
function patch(source,edits,file){
 let value=source
 for(const [before,after,previous=[]]of edits){
  if(value.split(after).length===2)continue
  const candidates=[before,...previous].filter(v=>value.split(v).length===2)
  if(candidates.length===1){value=value.replace(candidates[0],after);continue}
  throw Error('Не удалось совместить обновление с файлом '+file+'. Рабочая версия сохранена.')
 }
 return value
}
function permissions(dir){fs.chmodSync(dir,0o755);for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())permissions(file);else if(e.isFile())fs.chmodSync(file,0o644);else throw Error('Неожиданный тип файла в сборке.')}}
function retainAssets(from,to){if(!fs.existsSync(from))return;for(const e of fs.readdirSync(from,{withFileTypes:true})){const a=path.join(from,e.name),b=path.join(to,e.name);if(e.isDirectory()){fs.mkdirSync(b,{recursive:true});retainAssets(a,b)}else if(e.isFile()&&!fs.existsSync(b))fs.copyFileSync(a,b)}}
function protect(root){
 const files=fs.readdirSync(path.join(root,'lib')).filter(n=>n.endsWith('.js')&&!manifest.backend.some(m=>m.path==='lib/'+n)).map(n=>'lib/'+n)
 return Object.fromEntries(files.map(n=>[n,sha(fs.readFileSync(path.join(root,n)))]))
}
function checkProtected(app){for(const [file,hash]of Object.entries(app.protected))if(sha(fs.readFileSync(path.join(app.root,file)))!==hash)throw Error('Изменился модуль вне обновления: '+file)}
function readCatalog(file){if(!fs.existsSync(file))return [];const value=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(value))throw Error('Не удалось прочитать каталог мероприятий.');return value}
function replaceCatalogEntry(rows,slug,value){const index=rows.findIndex(e=>e.slug===slug);if(value===null)return rows.filter(e=>e.slug!==slug);if(index<0)return [...rows,value];return rows.map((e,i)=>i===index?value:e)}
let stage,release,configs=[],apps=[],catalogPlans=[],backendWritten=false,nginxWritten=false
try{
 if(manifest.kind!=='resident-ui-20261109-v1')throw Error('Неизвестный пакет обновления.')
 for(const f of manifest.frontend){if(!/^(src\/|scripts\/|public\/materials\/covers\/)[A-Za-z0-9_./-]+$/.test(f.path)||f.path.split('/').includes('..'))throw Error('Неверный путь в пакете.');if(sha(fs.readFileSync(path.join(pkg,'payload',f.path)))!==f.sha256)throw Error('Проверка пакета не пройдена: '+f.path)}
 const processes=readProcesses().map(details)
 if(new Set(processes.map(p=>p.name)).size!==processes.length||processes.filter(p=>p.name==='legalcareerist-api').length!==1||processes.some(p=>p.status!=='online'))throw Error('Нужны работающие основной API и запущенный демо-процесс, если он установлен.')
 for(const p of processes){
  if(!p.script||!path.isAbsolute(p.script)||p.script!==fs.realpathSync(p.script))throw Error('Не удалось проверить путь API.')
  const root=path.dirname(p.script),data=fs.realpathSync(path.join(root,'data'))
  if(root===path.join(site,'server'))throw Error('API работает внутри изменяемого Git-каталога. Изолированный runtime не найден.')
  apps.push({...p,root,data,health:await deploymentHealth(p),protected:protect(root),files:[]})
 }
 const found=sourceAndConfigs();configs=found.configs;run('nginx',['-t'])
 fs.mkdirSync(buildRoot,{recursive:true,mode:0o700});stage=fs.mkdtempSync(path.join(buildRoot,'resident-ui-'))
 write(path.join(stage,'package.json'),'{"type":"module"}')
 for(const app of apps){
  for(const item of manifest.backend){
   const file=path.join(app.root,item.path),before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null
   let after
   if(item.edits){if(before===null)throw Error('Не найден '+item.path+' в '+app.name);after=patch(before,item.edits,item.path)}
   else{after=fs.readFileSync(path.join(pkg,'payload/server',item.path),'utf8');if(sha(after)!==item.sha256)throw Error('Проверка серверного пакета не пройдена.');if(before!==null&&before!==after)throw Error('Новая библиотека уже существует с другим содержимым: '+item.path)}
   const saved=path.join(stage,'backend',app.name,item.path);if(before!==null)write(saved+'.before',before)
   write(saved+'.after',after);const syntax=path.join(stage,'syntax',app.name,item.path);write(syntax,after);run(process.execPath,['--check',syntax]);app.files.push({file,before,after})
  }
 }
 const frontend=path.join(stage,'frontend');fs.mkdirSync(frontend,{recursive:true})
 for(const dir of ['src','public','scripts'])fs.cpSync(path.join(found.source,dir),path.join(frontend,dir),{recursive:true,dereference:true})
 for(const file of fs.readdirSync(found.source).filter(f=>/^(package(?:-lock)?\.json|tsconfig.*\.json|vite\.config\.[cm]?[jt]s|index\.html)$/.test(f)))fs.copyFileSync(path.join(found.source,file),path.join(frontend,file))
 fs.mkdirSync(path.join(frontend,'server/data'),{recursive:true});fs.symlinkSync(fs.realpathSync(path.join(found.source,'node_modules')),path.join(frontend,'node_modules'))
 for(const item of manifest.frontend)write(path.join(frontend,item.path),fs.readFileSync(path.join(pkg,'payload',item.path)))
 console.log('Изменения проверены. Собираю кабинет и блог…')
 try{write(path.join(stage,'build.log'),run('npm',['run','build'],{cwd:frontend,timeout:240000}))}catch(e){const log=Buffer.concat([e.stdout||Buffer.alloc(0),e.stderr||Buffer.alloc(0)]);write(path.join(stage,'build.log'),log);for(const line of log.toString().split(/\r?\n/).filter(s=>/error TS[0-9]+:|^error during build:|^Error:|Could not resolve|Cannot find module/.test(s)).slice(0,25))console.error(line.slice(0,600));throw Error('Сборка не прошла. Действующий сайт сохранён. Журнал: '+path.join(stage,'build.log'))}
 const dist=path.join(frontend,'dist'),index=fs.readFileSync(path.join(dist,'index.html')),entry=/src="([^"<>]+\.js)"/.exec(index.toString())?.[1]
 if(!entry)throw Error('В сборке не найден входной файл.')
 const bundles=fs.readdirSync(path.join(dist,'assets')).filter(n=>n.endsWith('.js')).map(n=>fs.readFileSync(path.join(dist,'assets',n),'utf8')).join('\n')
 if(!['https://legalcareerist.mave.digital/ep-19','https://legalcareerist.mave.digital/ep-22','/api/account/contact-email/request','Моя записная книжка'].every(s=>bundles.includes(s)))throw Error('Сборка не содержит обязательные изменения.')
 if(manifest.catalogUpdates?.length){
  const built=JSON.parse(fs.readFileSync(path.join(frontend,'server/data/event-catalog.json'),'utf8'))
  for(const [i,data]of [...new Set(apps.map(p=>p.data))].entries()){
   const file=path.join(data,'event-catalog.json'),before=readCatalog(file),entries=[]
   for(const update of manifest.catalogUpdates){const row=built.find(e=>e.slug===update.slug);if(!row||row.price!==update.price||row.registrationLink!==update.registrationLink||row.collectTicketLead!==update.collectTicketLead||row.tariffs?.length!==1||row.tariffs[0].price!==update.price)throw Error('Проверка новой цены мероприятия не пройдена.');const old=before.find(e=>e.slug===update.slug)??null;entries.push({slug:update.slug,before:old,after:{...(old||row),price:update.price,registrationLink:update.registrationLink,collectTicketLead:update.collectTicketLead,tariffs:row.tariffs}})}
   write(path.join(stage,'catalog-'+i+'.before.json'),JSON.stringify(before,null,2));catalogPlans.push({file,entries,written:false})
  }
 }
 fs.mkdirSync(publicRoot,{recursive:true,mode:0o755});fs.chmodSync(publicRoot,0o755);release=fs.mkdtempSync(path.join(publicRoot,'resident-ui-20261109-'));const nextDist=path.join(release,'dist');fs.cpSync(dist,nextDist,{recursive:true})
 for(const c of configs)for(const root of c.roots)retainAssets(root,nextDist)
 permissions(release)
 for(let i=0;i<configs.length;i++)write(path.join(stage,'nginx-'+i+'.before'),configs[i].before)
 for(const app of apps){checkProtected(app);if(fs.realpathSync(path.join(app.root,'data'))!==app.data)throw Error('Изменился каталог данных API.');for(const f of app.files)if((fs.existsSync(f.file)?fs.readFileSync(f.file,'utf8'):null)!==f.before)throw Error('Исходники API изменились во время подготовки.')}
 if(JSON.stringify(readProcesses().map(details))!==JSON.stringify(processes))throw Error('API изменился во время сборки. Обновление остановлено.')
 // Backend is installed first, so the new UI never points at missing routes.
 backendWritten=true
 for(const app of apps)for(const f of app.files)if(f.before!==f.after)write(f.file,f.after)
 for(const app of [...apps].reverse())run('pm2',['restart',app.name])
 console.log('API обновлены. Проверяю доступность и прежние настройки подписок…')
 for(const app of apps){let good=false;for(let i=0;i<25;i++){try{if(JSON.stringify(await deploymentHealth(app))===JSON.stringify(app.health)){good=true;break}}catch{}await pause(500)}if(!good)throw Error('API не подтвердил запуск: '+app.name);checkProtected(app)}
 for(const plan of catalogPlans){let current=readCatalog(plan.file);for(const entry of plan.entries){if(JSON.stringify(current.find(e=>e.slug===entry.slug)??null)!==JSON.stringify(entry.before))throw Error('Изменился каталог мероприятия во время подготовки.');current=replaceCatalogEntry(current,entry.slug,entry.after)}write(plan.file,JSON.stringify(current,null,2));plan.written=true}
 await verifyEventCheckout('http://127.0.0.1:'+apps.find(a=>a.name==='legalcareerist-api').port)
 for(const item of configs){if(fs.readFileSync(item.file,'utf8')!==item.before)throw Error('Конфигурация Nginx изменилась.');item.after=item.before.replace(/(^[ \t]*root[ \t]+)("[^"\r\n]+"|'[^'\r\n]+'|[^;\s]+)([ \t]*;)/gm,(all,prefix,raw,suffix)=>item.roots.includes(raw.replace(/^(["'])(.*)\1$/,'$2'))?prefix+nextDist+suffix:all)}
 nginxWritten=true;for(const item of configs)write(item.file,item.after,item.mode);run('nginx',['-t']);run('nginx',['-s','reload'])
 const cover=manifest.frontend.find(f=>f.path.startsWith('public/materials/covers/'))
 let verified=false
 for(let i=0;i<12;i++){try{const page=await fetch(publicUrl+'/blog?ui='+path.basename(release),{signal:AbortSignal.timeout(5000),headers:{'Cache-Control':'no-cache'}}),html=await page.text();if(!page.ok||!html.includes(entry))throw Error();const asset=await fetch(publicUrl+entry,{signal:AbortSignal.timeout(5000)});if(!asset.ok||sha(Buffer.from(await asset.arrayBuffer()))!==sha(fs.readFileSync(path.join(dist,entry.replace(/^\//,'')))))throw Error();if(cover){const photo=await fetch(publicUrl+'/'+cover.path.slice(7),{signal:AbortSignal.timeout(10000)});if(!photo.ok||sha(Buffer.from(await photo.arrayBuffer()))!==cover.sha256)throw Error()}verified=true;break}catch{}await pause(1000)}
 if(!verified)throw Error('Сайт не подтвердил новую сборку. Восстанавливаю прежнюю версию.')
 for(const app of apps){checkProtected(app);if(JSON.stringify(await deploymentHealth(app))!==JSON.stringify(app.health))throw Error('Настройки API изменились.')}
 for(const plan of catalogPlans){const current=readCatalog(plan.file);for(const entry of plan.entries)if(JSON.stringify(current.find(e=>e.slug===entry.slug)??null)!==JSON.stringify(entry.after))throw Error('Каталог не подтвердил новую цену мероприятия.')}
 await verifyEventCheckout(publicUrl)
 write(path.join(stage,'deployment.json'),JSON.stringify({release,source:found.source,configs:configs.map(({file,before,after,mode})=>({file,before,after,mode})),backend:apps.map(({name,script,data})=>({name,script,data})),catalogs:catalogPlans.map(({file,entries})=>({file,entries})),installedAt:Date.now(),manifestSha:sha(fs.readFileSync(path.join(pkg,'manifest.json')))}))
 // Compatibility with subsequent publishers that look for source folders next to deployment.json.
 for(const name of ['src','public','scripts','dist','node_modules'])fs.symlinkSync(path.join(frontend,name),path.join(stage,name))
 for(const name of fs.readdirSync(frontend).filter(f=>/^(package(?:-lock)?\.json|tsconfig.*\.json|vite\.config\.[cm]?[jt]s|index\.html)$/.test(f)))fs.copyFileSync(path.join(frontend,name),path.join(stage,name))
 console.log('ОБНОВЛЕНИЕ_ГОТОВО '+JSON.stringify({cabinet:publicUrl+'/cabinet',podcast:publicUrl+'/blog?category='+encodeURIComponent('Подкаст'),blog:publicUrl+'/blog',api:apps.map(p=>p.name),materialCovers:8,eventPrices:manifest.catalogUpdates||[],billingModulesUnchanged:true,subscriptionSettingsPreserved:true,backup:stage,release}))
}catch(error){
 let rolled=true
 if(nginxWritten)try{for(const c of configs){const value=fs.readFileSync(c.file,'utf8');if(c.after&&value===c.after)write(c.file,c.before,c.mode);else if(value!==c.before)throw Error('Concurrent Nginx change')}run('nginx',['-t']);run('nginx',['-s','reload'])}catch{rolled=false}
 for(const plan of catalogPlans.filter(p=>p.written))try{let current=readCatalog(plan.file);for(const entry of plan.entries){if(JSON.stringify(current.find(e=>e.slug===entry.slug)??null)!==JSON.stringify(entry.after))throw Error('Concurrent event catalog change');current=replaceCatalogEntry(current,entry.slug,entry.before)}write(plan.file,JSON.stringify(current,null,2))}catch{rolled=false}
 if(backendWritten)try{for(const app of apps){for(const f of app.files){const value=fs.existsSync(f.file)?fs.readFileSync(f.file,'utf8'):null;if(value===f.after){if(f.before===null)fs.rmSync(f.file);else write(f.file,f.before)}else if(value!==f.before)throw Error('Concurrent API change')}run('pm2',['restart',app.name])}for(const app of apps){let ready=false;for(let i=0;i<20;i++){try{if(JSON.stringify(await deploymentHealth(app))===JSON.stringify(app.health)){ready=true;break}}catch{}await pause(500)}if(!ready)rolled=false}}catch{rolled=false}
 console.error(error?.message&&/^(Не |Нуж|Проверк|Измен|Исход|Сборк|API|Конфиг|Сайт|В сборке|Новая библиотека)/.test(error.message)?error.message:'Обновление остановлено. Секреты не выводятся.')
 if(backendWritten||nginxWritten)console.error(rolled?'Прежние код и сайт восстановлены.':'Автоматическое восстановление завершилось не полностью. Резервная папка: '+stage)
 process.exitCode=1
}

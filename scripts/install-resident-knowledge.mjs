// Install five private articles only; no API/bot code, public files or account/payment data writes.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {runtimeSettings} from './lib/bot-runtime-settings.mjs'

process.umask(0o077)
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const packet=path.join(import.meta.dirname,'../updates/resident-knowledge-20261116')
const repo=path.join(import.meta.dirname,'..')
const entryExists=file=>{try{fs.lstatSync(file);return true}catch(error){if(error.code==='ENOENT')return false;throw error}}
const write=(file,bytes,owner)=>{
  const temp=path.join(path.dirname(file),'.'+path.basename(file)+'.'+crypto.randomBytes(6).toString('hex')+'.tmp')
  try{
    fs.writeFileSync(temp,bytes,{mode:0o644,flag:'wx'})
    if(process.getuid?.()===0)fs.chownSync(temp,owner.uid,owner.gid)
    // Hard-link creation is atomic and refuses an existing name, including a broken symlink.
    fs.chmodSync(temp,0o644);fs.linkSync(temp,file)
  }finally{fs.rmSync(temp,{force:true})}
}
const mdFiles=root=>{
  const out=[]
  const walk=(dir,rel='')=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(e.name.startsWith('.'))continue
    const next=path.join(rel,e.name)
    if(e.isDirectory())walk(path.join(dir,e.name),next)
    else if(e.isFile()&&e.name.endsWith('.md'))out.push(next)
  }}
  walk(root);return out
}

let backup=null,jobs=[]
try{
  const manifest=JSON.parse(fs.readFileSync(path.join(packet,'manifest.json'),'utf8'))
  if(manifest.version!==1||manifest.date!=='2026-11-16'||manifest.files.length!==5||new Set(manifest.files.map(f=>f.id)).size!==5)throw Error('Не подтвержден пакет из пяти статей')
  for(const f of manifest.files){
    if(!/^(?:[a-z0-9-]+\/)+[a-z0-9-]+\.md$/.test(f.path)||f.path.endsWith('/_index.md'))throw Error('Некорректный путь статьи')
    const body=fs.readFileSync(path.join(repo,'server/content/knowledge',f.path))
    if(body.length!==f.bytes||hash(body)!==f.sha256)throw Error('Исходник статьи изменен: '+f.title)
    jobs.push({...f,body,installed:false})
  }
  const apps=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:15000,maxBuffer:16*1024*1024})).filter(a=>a.name==='legalcareerist-api')
  if(apps.length!==1||apps[0].pm2_env.status!=='online')throw Error('Не найден единственный работающий API legalcareerist-api')
  const config=runtimeSettings(apps[0].pm2_env,{}),port=Number(config.value('PORT')||3001)
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Не определен порт API')
  const requested=config.value('KB_DIR')?path.resolve(config.cwd,config.value('KB_DIR')):path.join(config.runtime,'content/knowledge')
  const root=fs.realpathSync(requested)
  if(root.split(path.sep).some(part=>['public','dist','dist-ssr'].includes(part)))throw Error('Папка закрытой базы не должна находиться в публичных файлах')
  const api=async route=>fetch('http://127.0.0.1:'+port+route,{signal:AbortSignal.timeout(8000)})
  const checkAccess=async()=>{
    const health=await api('/api/health')
    if(!health.ok||(await health.json()).ok!==true)throw Error('API не подтвердил здоровье')
    for(const route of ['/api/account/kb','/api/account/kb/page?id='+encodeURIComponent(jobs[0].id),'/api/account/kb/search?q=B2B']){
      const response=await api(route)
      if(response.status!==401)throw Error('Не подтвержден закрытый доступ без авторизации: '+route.split('?')[0])
      await response.arrayBuffer()
    }
  }
  await checkAccess()
  // Import only the installed content reader, never index.js or document-supplied code.
  process.env.KB_DIR=root
  const kb=await import(pathToFileURL(path.join(config.runtime,'lib/knowledgeBase.js')).href)
  for(const name of ['resetKnowledgeCache','knowledgeTree','knowledgePage','knowledgeSearch','knowledgeCheck'])if(typeof kb[name]!=='function')throw Error('Неизвестная версия базы знаний: '+name)
  kb.resetKnowledgeCache();const beforeTree=kb.knowledgeTree({admin:true})
  for(const job of jobs){
    job.target=path.join(root,job.path)
    if(fs.realpathSync(path.dirname(job.target))!==path.dirname(job.target))throw Error('Папка раздела отсутствует или является ссылкой: '+job.path)
    job.owner=fs.statSync(path.dirname(job.target))
    const exists=entryExists(job.target)
    if(exists&&(!fs.lstatSync(job.target).isFile()||!fs.readFileSync(job.target).equals(job.body)))throw Error('Статья уже существует с другим содержимым: '+job.path)
    const nodes=beforeTree.filter(n=>n.id===job.id)
    if(nodes.length>(exists?1:0))throw Error('Дублирующий адрес статьи в базе: '+job.id)
    if(!beforeTree.some(n=>n.id===job.parent&&n.folder))throw Error('Не найден раздел статьи: '+job.parent)
    job.changed=!exists
  }
  const verify=()=>{
    kb.resetKnowledgeCache();const tree=kb.knowledgeTree(),report=[]
    for(const job of jobs){
      const nodes=tree.filter(n=>n.id===job.id),page=kb.knowledgePage(job.id)
      if(nodes.length!==1||nodes[0].parent!==job.parent||nodes[0].title!==job.title||!page?.body||page.draft||!page.summary||!fs.readFileSync(job.target).equals(job.body))throw Error('Статья не подтверждена для резидента: '+job.title)
      for(const query of job.searchQueries)if(!kb.knowledgeSearch(query).some(r=>r.id===job.id))throw Error('Поиск не находит статью: '+query)
      report.push({id:job.id,title:job.title,parent:job.parent,sha256:job.sha256,searchQueries:job.searchQueries})
    }
    const problems=kb.knowledgeCheck().problems.filter(p=>jobs.some(j=>p.startsWith(j.id+':')))
    if(problems.length)throw Error('Проверка новых страниц: '+problems.join('; '))
    return report
  }
  if(!jobs.some(j=>j.changed)){
    verify();await checkAccess()
    console.log('RESIDENT_KNOWLEDGE_PUBLISHED: все 5 статей уже установлены; разделы, поиск и закрытый доступ проверены. Повторной записи нет.')
  }else{
    const base=option('--backup-root')||'/root/legalcareerist-bot-backups'
    fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'resident-knowledge-20261116-'))
    const original=mdFiles(root)
    for(const rel of original){const saved=path.join(backup,'knowledge-before',rel);fs.mkdirSync(path.dirname(saved),{recursive:true,mode:0o700});fs.writeFileSync(saved,fs.readFileSync(path.join(root,rel)),{mode:0o600})}
    fs.writeFileSync(path.join(backup,'plan.json'),JSON.stringify({root,createdAt:new Date().toISOString(),existingFiles:original,articles:jobs.map(j=>({id:j.id,path:j.path,sha256:j.sha256,created:j.changed}))},null,2),{mode:0o600})
    for(const job of jobs.filter(j=>j.changed)){
      if(entryExists(job.target))throw Error('Во время подготовки появился файл: '+job.path)
      write(job.target,job.body,job.owner);job.installed=true
    }
    const report=verify();await checkAccess()
    fs.writeFileSync(path.join(backup,'verified.json'),JSON.stringify({verifiedAt:new Date().toISOString(),root,articles:report,added:jobs.filter(j=>j.installed).length,accessWithoutLogin:401,apiRestarted:false,paymentDataChanged:false,publicFilesChanged:false},null,2),{mode:0o600})
    console.log('RESIDENT_KNOWLEDGE_PUBLISHED: 5/5 статей доступны резидентам; разделы и поиск проверены. База перечитывается сервером автоматически в течение 5 секунд. Бот и API не перезапускались.')
    console.log('Резервная копия и отчет: '+backup)
  }
}catch(error){
  let restored=true
  for(const job of jobs.filter(j=>j.installed).reverse())try{
    if(!fs.existsSync(job.target))continue
    if(hash(fs.readFileSync(job.target))!==job.sha256)throw Error('Статья изменена другим процессом')
    fs.unlinkSync(job.target)
  }catch{restored=false}
  console.error('ПУБЛИКАЦИЯ БАЗЫ НЕ ПОДТВЕРЖДЕНА: '+error.message+(jobs.some(j=>j.installed)?(restored?'. Добавленные этим запуском файлы удалены; прежние статьи сохранены.':'. Откат не подтвержден; чужие изменения не перезаписывались.'):'')+(backup?' Резервная копия: '+backup:''))
  process.exitCode=1
}

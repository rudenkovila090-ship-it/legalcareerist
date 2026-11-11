// Apply narrow, checked backend edits and a separately built website; preserve live data.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {runtimeSettings} from './lib/bot-runtime-settings.mjs'
process.umask(0o077)
const argv=process.argv.slice(2),option=k=>{const i=argv.indexOf(k);return i<0?null:argv[i+1]}
const source=path.resolve(import.meta.dirname,'..'),input=option('--resident-input')
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:32*1024*1024})
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
const write=(file,body)=>{const temp=file+'.promo-'+crypto.randomBytes(5).toString('hex');try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(temp,body,{mode:0o600,flag:'wx'});fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}}
let app,backup,stopped=false,touched=false,dist,oldDist,newDist,swapped=false,oldMoved=false,files=[]
try {
 const apps=JSON.parse(run('pm2',['jlist'])).filter(a=>a.name==='legalcareerist-api')
 if(apps.length!==1||apps[0].pm2_env.status!=='online')throw Error('Не найден единственный работающий основной API')
 app=apps[0];const settings=runtimeSettings(app.pm2_env,{}),root=settings.runtime,site=option('--site-root')||path.dirname(root),port=Number(settings.value('PORT')||3001)
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Не определён порт API')
 const health=async()=>{const r=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(4000)});return r.ok?await r.json():{}}
 const initial=await health();if(!initial.ok)throw Error('API не подтвердил здоровье до установки')
 dist=path.join(site,'dist');const built=path.join(source,'dist')
 if(!fs.existsSync(path.join(dist,'index.html'))||!fs.existsSync(path.join(built,'index.html')))throw Error('Не найден установленный или собранный сайт')
 if(fs.lstatSync(dist).isSymbolicLink())throw Error('Каталог dist является символьной ссылкой; установка остановлена')
 const base=option('--backup-root')||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'community-promo-20261111-'))
 const manifest=JSON.parse(fs.readFileSync(path.join(source,'updates/community-promo/manifest.json'),'utf8'))
 for(const item of manifest.files){
  if(!['index.js','lib/prodamus.js','lib/communityPromo.js'].includes(item.path))throw Error('Неизвестный путь пакета')
  const file=path.join(root,item.path),before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null
  let after=before
  if(item.new){after=fs.readFileSync(path.join(source,'updates/community-promo/server',item.path),'utf8');if(hash(after)!==item.sha256||before!==null&&before!==after)throw Error('Неизвестная версия '+item.path)}
  else {if(before===null)throw Error('Не найден '+item.path);for(const [old,next] of item.edits){if(after.split(next).length===2)continue;if(after.split(old).length!==2)throw Error('Не удалось безопасно совместить '+item.path);after=after.replace(old,next)}}
  const check=path.join(backup,'syntax-'+files.length+'.mjs');write(check,after);run(process.execPath,['--check',check]);files.push({file,before,after})
 }
 // The owner registry is installed before restarting with the new checkout code.
 // No git merge/reset is needed on a live checkout containing locally installed fixes.
 if(input)execFileSync(process.execPath,[path.join(source,'scripts/install-resident-register.mjs'),'--input',path.resolve(input),'--packet',path.join(source,'updates/resident-register'),'--apply'],{stdio:'inherit',timeout:600000})
 newDist=path.join(site,'dist.promo-new-'+crypto.randomBytes(5).toString('hex'));oldDist=path.join(site,'dist.promo-old-'+crypto.randomBytes(5).toString('hex'))
 fs.cpSync(built,newDist,{recursive:true,errorOnExist:true,force:false})
 const publicModes=dir=>{fs.chmodSync(dir,0o755);for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Символьная ссылка в сборке');if(entry.isDirectory())publicModes(p);else fs.chmodSync(p,0o644)}};publicModes(newDist)
 for(const f of files)if((fs.existsSync(f.file)?fs.readFileSync(f.file,'utf8'):null)!==f.before)throw Error('Код изменился во время подготовки')
 run('pm2',['stop',app.name]);stopped=true
 for(const [i,f]of files.entries()){if(f.before!==null)write(path.join(backup,i+'.before'),f.before);if(f.before!==f.after){touched=true;write(f.file,f.after)}}
 fs.renameSync(dist,oldDist);oldMoved=true;fs.renameSync(newDist,dist);swapped=true
 run('pm2',['restart',app.name]);stopped=false
 let ready=false;for(let i=0;i<30;i++){try{if((await health()).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}
 if(!ready)throw Error('API не подтвердил здоровье после установки')
 fs.cpSync(oldDist,path.join(backup,'dist-before'),{recursive:true,errorOnExist:true,force:false});fs.rmSync(oldDist,{recursive:true});oldMoved=false
 write(path.join(backup,'installed.json'),JSON.stringify({at:Date.now(),promoCodeCaptured:true,bankSettingsChanged:false,directMessagesSent:false,sourceCommit:option('--commit')||null},null,2))
 console.log('COMMUNITY_PROMO_INSTALLED: поле опубликовано в обеих формах; код сохраняется и передаётся в подписанных данных оплаты. Условия банковских тарифов сохранены. Резервная копия: '+backup)
} catch(error) {
 if(app&&(touched||swapped||stopped||oldMoved))try{if(!stopped)run('pm2',['stop',app.name]);for(const f of files){if(f.before===null)fs.rmSync(f.file,{force:true});else write(f.file,f.before)}if(swapped){fs.renameSync(dist,newDist);swapped=false}if(oldMoved){fs.renameSync(oldDist,dist);oldMoved=false}run('pm2',['restart',app.name]);stopped=false}catch{console.error('Не подтверждён откат; резервная копия: '+backup)}
 console.error('УСТАНОВКА НЕ ЗАВЕРШЕНА: '+String(error.message).replace(/https?:\/\/\S+/g,'[URL]')+'. Данные оплат не откатывались. Отчёт: '+(backup||'подготовка'))
 process.exitCode=1
} finally {if(newDist&&fs.existsSync(newDist))fs.rmSync(newDist,{recursive:true,force:true})}

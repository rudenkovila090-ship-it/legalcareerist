import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {runtimeSettings,telegramRead} from './lib/bot-runtime-settings.mjs'
process.umask(0o077)
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]}
const run=(cmd,argv)=>execFileSync(cmd,argv,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:32*1024*1024})
const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
const write=(file,body,mode=0o600)=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.quest-'+crypto.randomBytes(6).toString('hex');try{fs.writeFileSync(temp,body,{mode,flag:'wx'});fs.chmodSync(temp,mode);fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}}
let app,backup,stopped=false,mutated=false,files=[],pdfTarget,pdfBefore
try{
 if(!opt('--pdf'))throw Error('Требуется --pdf с файлом «Квест новичка.pdf»')
 const packet=path.join(import.meta.dirname,'../updates/community-onboarding'),manifest=JSON.parse(fs.readFileSync(path.join(packet,'manifest.json'))),pdf=fs.readFileSync(opt('--pdf'))
 if(manifest.version!==1||manifest.delayMs!==600000||manifest.pdf.path!=='data/community-assets/newcomer-quest.pdf')throw Error('Неизвестная конфигурация пакета')
 if(pdf.length!==manifest.pdf.size||hash(pdf)!==manifest.pdf.sha256||!pdf.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('PDF не совпадает с присланным владельцем файлом; изменений нет')
 const found=JSON.parse(run('pm2',['jlist'])).filter(a=>a.name==='legalcareerist-api')
 if(found.length!==1||found[0].pm2_env.status!=='online')throw Error('Требуется единственный работающий основной API legalcareerist-api')
 app=found[0];const config=runtimeSettings(app.pm2_env,{}),root=config.runtime,port=Number(config.value('PORT')||3001)
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Не определён порт API')
 const health=async()=>{const r=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(4000)});return r.ok?await r.json():{}}
 const previous=await health();if(!previous.ok)throw Error('Основной API не подтвердил здоровье до установки')
 const token=config.value('TELEGRAM_BOT_TOKEN');if(!token||!config.chat)throw Error('Не определены действующий бот и чат сообщества')
 const me=await telegramRead(token,'getMe');if(!me.ok)throw Error('Telegram не подтвердил действующего бота: '+me.errorCode)
 const rights=await telegramRead(token,'getChatMember',{chat_id:config.chat,user_id:me.result.id})
 if(!rights.ok||!['administrator','creator'].includes(rights.result?.status))throw Error('Бот должен быть администратором чата для получения событий вступления')
 const hook=await telegramRead(token,'getWebhookInfo');if(!hook.ok)throw Error('Не удалось проверить получение обновлений Telegram')
 const polling=String(config.value('TELEGRAM_POLLING')??'1')!=='0',webhook=hook.result?.url
 if(webhook){
  const host=new URL(webhook).hostname,site=new URL(config.value('SITE_URL')||'https://legalcareerist.ru').hostname
  if(host!==site)throw Error('У бота активен webhook другого сервиса; он не перенастраивался')
  if(!polling&&(!Array.isArray(hook.result.allowed_updates)||!hook.result.allowed_updates.includes('chat_member')))throw Error('Webhook не подтверждает получение chat_member; требуется добавить события вступления')
 }else if(!polling)throw Error('У бота отключён polling и отсутствует webhook')
 const base=opt('--backup-root')||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'newcomer-quest-20261113-'))
 for(const entry of manifest.files){
  if(!['index.js','lib/personData.js','lib/communityOnboarding.js'].includes(entry.path))throw Error('Неизвестный путь пакета')
  const file=path.join(root,entry.path),before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null,mode=before===null?0o644:fs.statSync(file).mode&0o777
  let after=before
  if(entry.new){after=fs.readFileSync(path.join(packet,'server',entry.path),'utf8');if(hash(after)!==entry.sha256||before!==null&&before!==after)throw Error('Неизвестная версия '+entry.path)}
  else {if(before===null)throw Error('Не найден '+entry.path);for(const [old,next]of entry.edits){if(after.split(next).length===2)continue;if(after.split(old).length!==2)throw Error('Не удалось безопасно совместить '+entry.path);after=after.replace(old,next)}}
  const check=path.join(backup,files.length+'.mjs');write(check,after);run(process.execPath,['--check',check]);files.push({file,before,after,mode})
 }
 for(const f of files)if((fs.existsSync(f.file)?fs.readFileSync(f.file,'utf8'):null)!==f.before)throw Error('Код изменился во время подготовки')
 run('pm2',['stop',app.name]);stopped=true
 pdfTarget=path.join(root,manifest.pdf.path);pdfBefore=fs.existsSync(pdfTarget)?fs.readFileSync(pdfTarget):null
 if(pdfBefore)write(path.join(backup,'newcomer-quest.before.pdf'),pdfBefore)
 const queue=path.join(root,'data/community-onboarding.json')
 if(fs.existsSync(queue)){
  const body=fs.readFileSync(queue),data=JSON.parse(body);if(!data||Array.isArray(data)||typeof data!=='object'||Object.entries(data).some(([id,j])=>!/^\d{5,16}$/.test(id)||j?.version!==1||!Number.isFinite(j.dueAt)))throw Error('Неизвестная структура очереди; перезапись остановлена')
  write(path.join(backup,'community-onboarding.before.json'),body)
 }
 for(const [i,f]of files.entries()){if(f.before!==null)write(path.join(backup,i+'.before'),f.before);if(f.before!==f.after){mutated=true;write(f.file,f.after,f.mode)}}
 mutated=true;write(pdfTarget,pdf)
 run('pm2',['restart',app.name]);stopped=false
 let ready=false
 for(let i=0;i<30;i++){try{const h=await health();if(h.ok&&h.communityOnboarding===1&&h.newcomerQuestReady===true&&h.newcomerQuestDelayMs===600000){for(const key of ['autoExclude','automaticAccessRemovalPaused','graceDays','subscriptionAutomation'])if(h[key]!==previous[key])throw Error('Изменилась настройка '+key);ready=true;break}}catch(e){if(e.message.startsWith('Изменилась'))throw e}await new Promise(r=>setTimeout(r,500))}
 if(!ready||hash(fs.readFileSync(pdfTarget))!==manifest.pdf.sha256)throw Error('Не подтверждены обработчик, задержка 10 минут и нужный PDF')
 write(path.join(backup,'installed.json'),JSON.stringify({at:Date.now(),delayMs:600000,pdfSha256:manifest.pdf.sha256,pdfSize:pdf.length,bot:me.result.username,existingMembersEnqueued:false,paymentDataChanged:false},null,2))
 console.log('NEWCOMER_QUEST_READY: через 10 минут после нового вступления — приветствие и PDF «Квест новичка». Файл проверен по SHA-256, очередь сохраняется при перезапуске. Старые участники не добавлялись в рассылку. Резервная копия: '+backup)
}catch(error){
 if(app&&(stopped||mutated))try{
  if(!stopped)run('pm2',['stop',app.name]);stopped=true
  if(mutated){for(const f of files){if(f.before===null)fs.rmSync(f.file,{force:true});else write(f.file,f.before,f.mode)}if(pdfTarget){if(pdfBefore)write(pdfTarget,pdfBefore);else fs.rmSync(pdfTarget,{force:true})}}
  run('pm2',['restart',app.name]);stopped=false
 }catch{console.error('Не подтверждён откат/перезапуск; резервная копия: '+backup)}
 console.error('УСТАНОВКА НЕ ЗАВЕРШЕНА: '+String(error.message).replace(/https?:\/\/\S+/g,'[URL]')+'. Данные оплат и очередь не откатывались. Отчёт: '+(backup||'подготовка'));process.exitCode=1
}

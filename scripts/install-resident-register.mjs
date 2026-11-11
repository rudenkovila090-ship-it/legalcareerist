#!/usr/bin/env node
// Installs a reviewed owner roster without replaying payments or sending Telegram messages.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {execFileSync,spawnSync} from 'node:child_process'
import {runtimeSettings} from './lib/bot-runtime-settings.mjs'
process.umask(0o077)
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]}
const input=opt('--input'),apply=args.includes('--apply'),packet=opt('--packet')
if(!input||!packet)throw Error('Usage: --input evidence.json --packet package-directory [--apply] [--backup-root private-directory]')
const run=(cmd,argv)=>execFileSync(cmd,argv,{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']})
const hash=v=>crypto.createHash('sha256').update(v).digest('hex')
const write=(p,v)=>{const tmp=p+'.roster-'+crypto.randomBytes(5).toString('hex');try{fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(tmp,v,{mode:0o600,flag:'wx'});fs.renameSync(tmp,p)}finally{fs.rmSync(tmp,{force:true})}}
let app,stopped=false,codeWritten=false,changed=[],backup
try{
 const apps=JSON.parse(run('pm2',['jlist'])).filter(a=>a.name==='legalcareerist-api')
 if(apps.length!==1||apps[0].pm2_env.status!=='online')throw Error('Exactly one online legalcareerist-api is required')
 app=apps[0];const config=runtimeSettings(app.pm2_env,{}),root=config.runtime
 const port=Number(config.value('PORT')||3001)
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('invalid_api_port')
 const health=async()=>{const response=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error('health_http_'+response.status);return response.json()}
 const beforeHealth=await health();if(beforeHealth.ok!==true)throw Error('api_not_healthy_before_install')
 const base=opt('--backup-root')||'/root/legalcareerist-bot-backups'
 fs.mkdirSync(base,{recursive:true,mode:0o700});backup=fs.mkdtempSync(path.join(base,'resident-register-20261111-'))
 const reportDir=path.join(backup,'report')
 const audit=spawnSync(process.execPath,[path.join(import.meta.dirname,'reconcile-residents.mjs'),'--input',path.resolve(input),'--output',reportDir],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']})
 if(audit.status!==0&&audit.status!==2)throw Error('read_only_reconciliation_failed; no changes; report='+backup)
 const report=JSON.parse(fs.readFileSync(path.join(reportDir,'reconciliation.json')))
 fs.copyFileSync(input,path.join(backup,'input-evidence.json'))
 const registry=report.registry
 if(report.coverage.sourceRows!==report.coverage.accountedRows)throw Error('evidence_coverage_failed')
 if(!Object.keys(registry.authorizations).length)throw Error('no_resolved_authorizations')
 const manifest=JSON.parse(fs.readFileSync(path.join(packet,'manifest.json')))
 for(const f of manifest.files){
  if(!/^lib\/[a-zA-Z]+\.js$/.test(f.path))throw Error('invalid_manifest_path')
  const target=path.join(root,f.path),payload=fs.readFileSync(path.join(packet,'server',f.path))
  if(hash(payload)!==f.after)throw Error('package_checksum_mismatch:'+f.path)
  const before=fs.readFileSync(target),sum=hash(before)
  if(sum!==f.before&&sum!==f.after)throw Error('unknown_installed_code:'+f.path+'; no changes; report='+backup)
  const check=path.join(backup,'syntax-'+path.basename(f.path)+'.mjs');write(check,payload);run(process.execPath,['--check',check])
  changed.push({target,before,payload,changed:sum!==f.after})
 }
 console.log('Все исходные строки учтены: '+report.coverage.accountedRows+'/'+report.coverage.sourceRows+'. Отчёт: '+reportDir)
 console.log('Telegram подтвердил присутствие: '+report.rows.filter(r=>r.presence==='in').length+'; отсутствие: '+report.rows.filter(r=>r.presence==='out').length+'; не проверено: '+report.rows.filter(r=>r.presence==='unknown').length+'.')
 console.log('Расхождения сохранены отдельно: '+report.issues.length+'. Идентификаторы, имена и тарифы не объединяются догадкой.')
 if(!apply){console.log('READ_ONLY: бот и данные не изменены. Для установки используйте --apply.');process.exit(0)}
 for(const f of changed)if(hash(fs.readFileSync(f.target))!==hash(f.before))throw Error('code_changed_during_preflight')
 // Stop writers before reading the final store; never replace a live database snapshot.
 run('pm2',['stop',app.name]);stopped=true
 const data=path.join(root,'data'),file=path.join(data,'pending-joins.json')
 const beforeStore=fs.readFileSync(file),joins=JSON.parse(beforeStore)
 if(!joins||Array.isArray(joins)||typeof joins!=='object'||Object.values(joins).some(j=>!j||Array.isArray(j)||typeof j!=='object'))throw Error('invalid_join_store')
 fs.cpSync(data,path.join(backup,'data-before'),{recursive:true,errorOnExist:true,force:false})
 const originalFinancial=new Map(Object.entries(joins).map(([key,j])=>[key,JSON.stringify(j)]))
 let added=0,updated=0
 for(const [id,grant]of Object.entries(registry.authorizations)){
  if(!/^\d{5,16}$/.test(id)||grant.active!==true||!(grant.until===null||Number.isFinite(grant.until)&&grant.until>Date.now()))continue
  const row=report.rows.find(r=>r.telegramId===id)
  if(!row||row.category==='previously_absent'||row.category==='service')throw Error('invalid_authorization_identity')
  const key='owner-roster-'+hash(id).slice(0,24),existing=joins[key]
  if(existing&&(existing.ownerAccess?.source!=='owner_roster_20261111'||String(existing.tgUserId)!==id||existing.paid||(existing.payments||[]).length))throw Error('roster_key_conflict')
  // A verified current receipt retires temporary permission. Reapplying this same
  // source must not turn that permission back into a permanent free subscription.
  if(existing?.ownerAccess?.fulfilledAt&&existing.ownerAccess.inputHash===registry.inputHash)continue
  const record={...existing,name:row.name,telegram:row.usernameSource==='live_telegram'&&row.username.startsWith('@')?row.username:'',tgUserId:id,status:'active',paid:false,createdAt:existing?.createdAt||Date.now(),residentRegister:true,payments:[],ownerAccess:{active:true,source:'owner_roster_20261111',telegramId:id,kind:grant.kind,until:grant.until,reason:grant.basis,grantedAt:existing?.ownerAccess?.grantedAt||Date.now(),inputHash:registry.inputHash,paymentVerificationPending:!['free','ambassador'].includes(grant.kind)},providerSnapshot:{source:'owner_csv_20261111',contracts:row.contracts,sourceKeys:row.evidence.map(e=>e.key)}}
  if(existing&&JSON.stringify(existing)===JSON.stringify(record))continue
  joins[key]=record;existing?updated++:added++
 }
 // Existing non-import records, including every payment and delivery state, must remain byte-equivalent as JSON.
 for(const [key,before]of originalFinancial)if(!key.startsWith('owner-roster-')&&JSON.stringify(joins[key])!==before)throw Error('existing_record_would_change')
 for(const [i,f]of changed.entries()){write(path.join(backup,i+'.before'),f.before);if(f.changed){codeWritten=true;write(f.target,f.payload)}}
 if(added||updated)write(file,JSON.stringify(joins,null,2))
 write(path.join(data,'community-resident-register.json'),JSON.stringify(registry,null,2))
 write(path.join(backup,'installation.json'),JSON.stringify({version:1,added,updated,sourceRows:report.coverage.accountedRows,sourceHash:registry.inputHash,files:manifest.files,existingFinancialRecordsUnchanged:true,installerMessagesSent:false},null,2))
 run('pm2',['restart',app.name]);stopped=false
 let after
 for(let i=0;i<30;i++){try{after=await health();if(after.ok)break}catch{}await new Promise(r=>setTimeout(r,500))}
 if(!after?.ok)throw Error('api_health_not_confirmed_after_install')
 for(const key of ['autoExclude','automaticAccessRemovalPaused','graceDays','subscriptionAutomation'])if(beforeHealth[key]!==after[key])throw Error('automation_setting_changed:'+key)
 console.log('RESIDENT_REGISTER_INSTALLED: новых разрешений '+added+', обновлено '+updated+'. Существующие оплаты, даты, договоры и настройки сохранены. Прямых отправок сообщений и операций Telegram на изменение нет.')
 console.log('Проверка оплаты и присутствия отделена от прав доступа. Неразрешённые строки не потеряны: '+path.join(reportDir,'exceptions.csv'))
}catch(error){
 // Roll back code only. Never restore an old financial snapshot over newly arrived receipts.
 if(app){try{if(!stopped&&codeWritten){run('pm2',['stop',app.name]);stopped=true}if(stopped){if(codeWritten)for(const f of changed)if(f.changed)write(f.target,f.before);run('pm2',['restart',app.name]);stopped=false}}catch{console.error('Rollback/restart needs attention; private backup: '+(backup||'not created'))}}
 console.error('INSTALL_FAILED: '+String(error.message).replace(/https?:\/\/\S+/g,'[URL]')+'. Финансовая база не откатывалась. Отчёт: '+(backup||'preflight failed'))
 process.exitCode=1
}

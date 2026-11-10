// Read-only live audit: no charges, messages, approvals, removals or billing changes.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { runtimeSettings, telegramRead } from './lib/bot-runtime-settings.mjs'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
const apps=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000})).filter(a=>a.name==='legalcareerist-api')
if(apps.length!==1)throw Error('Expected one legalcareerist-api process')
const state=apps[0].pm2_env,root=path.dirname(state.pm_exec_path),data=fs.realpathSync(path.join(root,'data'))
const effective=runtimeSettings(state,{})
const value=effective.value
process.env.SUBSCRIPTION_GRACE_DAYS=String(value('SUBSCRIPTION_GRACE_DAYS')||4)
const {accessUntil,hasAccess}=await import(pathToFileURL(path.join(root,'lib/subscriptionAccess.js')))
const source=fs.readFileSync(state.pm_exec_path,'utf8')
const token=value('TELEGRAM_BOT_TOKEN'),chat=effective.chat
const report={readOnly:true,secretsPrinted:false,at:new Date().toISOString(),runtime:root,process:{status:state.status,restarts:state.restart_time},configuration:{botToken:Boolean(token),paymentKey:Boolean(value('PRODAMUS_SECRET_KEY')),inviteLink:Boolean(value('COMMUNITY_INVITE_LINK')),autoExclude:value('AUTO_EXCLUDE')==='1',graceDays:Number(value('SUBSCRIPTION_GRACE_DAYS')||4)}}
const read=(name,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(data,name),'utf8'))}catch(e){if(e.code!=='ENOENT')report.storageErrors=(report.storageErrors||[]).concat(name);return fallback}}
const cards=Object.entries(read('pending-joins.json',{})).map(([key,v])=>({...v,_key:key,ref:crypto.createHash('sha256').update(key).digest('hex').slice(0,12)}))
const users=Object.values(read('bot-users.json',{}))
const norm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim()
const phone=s=>String(s||'').replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7')
const cases=[['Диана Плиева',v=>/диан/.test(norm(v))&&/пл[ие]+в/.test(norm(v))],['Светик_DI',v=>/svetik[_ ]?d[il1]/i.test(String(v))],['Панкрат',v=>/панкрат/.test(norm(v))],['Артём',v=>/(^| )артем( |$)/.test(norm(v))],['Шемонаева Анастасия',v=>/шем[ао]наев/.test(norm(v))&&/анастас/.test(norm(v))],['Олеся',v=>/(^| )олеся( |$)/.test(norm(v))],['Ксения',v=>phone(v)==='79107532067']]
const label=v=>[v.name,v.firstName,v.lastName,v.telegram,v.username,v.phone].filter(Boolean).join(' ')
async function tg(method,body={}){return token?telegramRead(token,method,body):{ok:false,error:'not_configured'}}
const [me,hook]=await Promise.all([tg('getMe'),tg('getWebhookInfo')])
report.telegram={pollingEnabled:value('TELEGRAM_POLLING')!=='0',webhookSecretPresent:Boolean(value('TELEGRAM_WEBHOOK_SECRET')),ok:me.ok,username:me.result?.username||null,webhookConfigured:Boolean(hook.result?.url),pendingUpdates:hook.result?.pending_update_count??null,webhookDeliveryError:Boolean(hook.result?.last_error_message)}
if(chat&&me.result?.id){const b=await tg('getChatMember',{chat_id:chat,user_id:me.result.id});report.telegram.botRights={checked:b.ok,errorCode:b.errorCode||null,description:b.description||null,role:b.result?.status,invite:b.result?.status==='creator'||b.result?.can_invite_users===true,restrict:b.result?.status==='creator'||b.result?.can_restrict_members===true}}
try{report.telegram.webhookHost=hook.result?.url?new URL(hook.result.url).hostname:null}catch{report.telegram.webhookHost='invalid'}
const membership=new Map()
report.cases=[]
for(const [name,match] of cases){const found=cards.filter(c=>name==='Ксения'?phone(c.phone)==='79107532067':match(label(c))),known=users.filter(u=>name==='Ксения'?phone(u.phone)==='79107532067':match(label(u))),ids=[...new Set([...found.map(c=>c.tgUserId),...known.map(u=>u.id)].filter(Boolean).map(String))]
 for(const id of ids)if(!membership.has(id)){const m=await tg('getChatMember',{chat_id:chat,user_id:Number(id)});membership.set(id,m.ok?m.result.status:'unknown')}
 report.cases.push({name,ambiguous:ids.length>1,telegramIds:ids.map(id=>({id,membership:membership.get(id)})),cards:found.map(c=>({ref:c.ref,tgUserId:c.tgUserId||null,status:c.status,access:c.lifetime?'lifetime':hasAccess(c)?'active':'expired_or_unpaid',accessUntil:accessUntil(c),accessClosedAt:c.accessClosedAt||null,paid:Boolean(c.paid),lifetime:Boolean(c.lifetime),complimentary:c.complimentary?{nominalAmount:c.complimentary.nominalAmount,untilDeparture:c.complimentary.untilDeparture,revokedAt:c.complimentary.revokedAt||null}:null,inChat:c.inChat,paidUntil:c.nextPaymentAt||c.endsAt||null,lastPaidAt:c.lastPaidAt||null,lastPayment:(c.payments||[]).filter(p=>!p.estimated).slice(-1).map(p=>({at:p.at,amount:p.amount,subscriptionId:p.subscriptionId}))[0]||null,review:c.billingReview?{state:c.billingReview.state,reason:c.billingReview.reason,period:c.billingReview.period,holdUntil:c.billingReview.holdUntil}:null,cancellation:c.cancellation?{source:c.cancellation.source,confirmed:c.cancellation.confirmed,at:c.cancellation.confirmedAt,closureSource:c.billingClosure?.source||null}:null,providerCancellation:c.providerCancellation||null,inviteDelivery:c.inviteDelivery?{pending:c.inviteDelivery.pending,mailPending:c.inviteDelivery.mailPending}:null})),tags:known.map(u=>({id:u.id,tags:(u.tags||[]).filter(t=>/резидент|тариф|цена|подписк|бессроч|доступ|сообществ/.test(t))}))})}
let records=[],badLines=0;try{for(const line of fs.readFileSync(path.join(data,'prodamus-webhooks.jsonl'),'utf8').split('\n'))if(line.trim()){try{records.push(JSON.parse(line))}catch{badLines++}}}catch(e){if(e.code!=='ENOENT')report.storageErrors=(report.storageErrors||[]).concat('prodamus-webhooks.jsonl')}
report.payments={acceptedJournalRecords:records.length,malformedLines:badLines,verifiedRecords:records.filter(r=>r.verified===true).length,storedPayments:cards.reduce((n,c)=>n+(c.payments||[]).filter(p=>!p.estimated).length,0),automaticNonpaymentMarkers:cards.filter(c=>c.cancellation?.source==='automatic_nonpayment').length,confirmedBotExpiryStops:cards.filter(c=>c.cancellation?.source==='automatic_nonpayment'&&c.billingClosure?.source==='provider_api').length}
report.relevantEvents=records.filter(r=>cases.some(([,match])=>match([r.body?.customer_phone,r.body?.customer_extra,r.body?.customer_name].join(' ')))||phone(r.body?.customer_phone)==='79107532067').slice(-25).map(r=>({receivedAt:r.receivedAt,verified:r.verified===true,date:r.body?.date,status:r.body?.payment_status,amount:r.body?.sum,planId:r.body?.subscription?.id,profileRef:r.body?.subscription?.profile_id?crypto.createHash('sha256').update(String(r.body.subscription.profile_id)).digest('hex').slice(0,10):null,action:r.body?.subscription?.action_code,activeUser:r.body?.subscription?.active_user,activeManager:r.body?.subscription?.active_manager,errorCode:r.body?.subscription?.error_code}))
const port=Number(value('PORT')||3001)
async function probe(url,body){try{const r=await fetch(url,{method:body?'POST':'GET',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});const b=await r.json().catch(()=>({}));return{http:r.status,ok:b.ok===true,error:typeof b.error==='string'?b.error.slice(0,60):null,subscriptionExpiry:b.subscriptionExpiry,automaticProviderCancellation:b.automaticProviderCancellation}}catch{return{http:0,error:'unavailable'}}}
report.api={health:await probe('http://127.0.0.1:'+port+'/api/health'),subscriptionFormRejectsMissingConsent:await probe('http://127.0.0.1:'+port+'/api/community/subscribe',{}),webhookRejectsUnsigned:await probe('http://127.0.0.1:'+port+'/api/prodamus/webhook',{})}
report.api.publicSubscriptionRejectsMissingConsent=await probe(String(value('SITE_URL')||'https://legalcareerist.ru').replace(/\/$/,'')+'/api/community/subscribe',{})
report.runtimeErrorSignals={}
for(const [label,file]of [['error',state.pm_err_log_path],['output',state.pm_out_log_path]])if(file){
 let fd
 try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,buf=Buffer.alloc(Math.min(size,131072));fs.readSync(fd,buf,0,buf.length,Math.max(0,size-buf.length));const text=buf.toString();report.runtimeErrorSignals[label]=Object.fromEntries(Object.entries({telegramConflict:/409|Conflict: terminated/g,telegramPermissions:/not enough rights|CHAT_ADMIN_REQUIRED|USER_ADMIN_INVALID/gi,paymentConfiguration:/ключи проверки.*не настроены/gi,storageFailure:/EACCES|ENOSPC|EROFS|JSON.*Unexpected/gi,deliveryFailure:/ECONNRESET|ETIMEDOUT|fetch failed/gi}).map(([key,re])=>[key,[...text.matchAll(re)].length]))}catch{}finally{if(fd!==undefined)fs.closeSync(fd)}
}
report.summary={cards:cards.length,lifetime:cards.filter(c=>c.lifetime).length,reviewPending:cards.filter(c=>c.billingReview?.state==='pending').length,expiredStoredAsAbsent:cards.filter(c=>c.inChat===false&&c.nextPaymentAt&&c.nextPaymentAt<Date.now()).length,pendingAdmissionRequests:Object.keys(read('community-join-requests.json',{})).length}
if(process.env.BOT_AUDIT_OUTPUT)fs.writeFileSync(process.env.BOT_AUDIT_OUTPUT,JSON.stringify(report,null,2),{mode:0o600})
console.log(JSON.stringify(report,null,2))

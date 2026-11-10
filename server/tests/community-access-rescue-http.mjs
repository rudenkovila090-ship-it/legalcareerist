import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {recoveryRequestSignature} from '../lib/subscriptionRecovery.js'
import {HmacHelper} from '../lib/hmac.js'
export async function runAccessRescue({root,request,hook,read,check,wait,pathToFileURL}){
 const now=Date.parse('2026-11-10T16:00:00+03:00'),at=now-3600000
 await hook('',{clock:now})
 fs.writeFileSync(path.join(root,'telegram-ok'),'')
 const joins=await import(pathToFileURL(path.join(root,'lib/store.js'))),bot=await import(pathToFileURL(path.join(root,'lib/botUsers.js')))
 const identities=[['376201355','ognevushaa','Анастасия Шемонаева'],['1955667679','mulanka_7','Диана Плиева'],['900000420','civillaw_civile','Кристина Брехова'],['900000421','vmashik','Мария Лапшина']]
 const members={}
 for(const [id,username,name]of identities){bot.touchBotUser({id,username,first_name:name});members[id]={status:username==='vmashik'?'left':'kicked',requestPending:username==='vmashik',user:{id:Number(id),username,first_name:name}}}
 fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify(members))
 const old={}
 for(const [id,username,name]of identities.slice(0,3)){const t=joins.createPendingJoin({tariffId:'1m',name,phone:'',email:'',telegram:'@'+username});joins.setTgUserId(t,id);joins.recordPayment(t,{amount:350,paidAt:now-40*86400000,nextPaymentAt:now-9*86400000,subscriptionId:'2854597',orderKey:'old-'+id});old[id]=t}
 const free=joins.createLifetimeJoin({tgUserId:'376201355',name:'Анастасия Шемонаева',telegram:'@ognevushaa'})
 joins.patchJoin(free,{lifetime:false,complimentary:{nominalAmount:350,untilDeparture:true,revokedAt:now-3600000}})
 const before=structuredClone(joins.listJoins().flatMap(j=>j.payments||[]))
 const b={payment_status:'success',date:new Date(at).toISOString(),sum:'350',order_id:'maria-real-signed',customer_extra:'Подписка на месяц | Мария Лапшина | @vmashik',subscription:{id:'2854597',profile_id:'maria-profile',payment_num:'1',date_next_payment:new Date(at+30*86400000).toISOString()}}
 const oldKristina={payment_status:'success',tg_user_id:'900000420',date:new Date(now-40*86400000).toISOString(),sum:'350',order_id:'old-900000420',subscription:{id:'2854597',profile_id:'old-kristina-profile',payment_num:'1',date_next_payment:new Date(now-9*86400000).toISOString()}}
 fs.writeFileSync(path.join(root,'data/prodamus-webhooks.jsonl'),JSON.stringify({verified:true,receivedAt:now-40*86400000,body:oldKristina})+'\n'+JSON.stringify({verified:true,receivedAt:at+2000,body:b})+'\n')
 fs.writeFileSync(path.join(root,'admin-offline'),'')
 const invoke=async signed=>{const body={purpose:'community-subscription-recovery',issuedAt:now,nonce:'b'.repeat(24),operation:'rescue_access_20261110',input:{},send:false};return request('/api/internal/subscription-policy',body,signed?{'X-Recovery-Signature':recoveryRequestSignature(body,'test-no-real-provider')}:undefined)}
 let r=await invoke(false);check('restoration requires a signed owner request',()=>assert.equal(r.status,403))
 r=await invoke(true);check('all four owner-authorized access grants are saved',()=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.cases.length,4);assert.ok(r.body.cases.every(c=>c.ok&&c.accessGranted))})
 check('the three bans are released without fabricating membership',()=>{const m=JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json')));for(const id of identities.slice(0,3).map(x=>x[0]))assert.equal(m[id].status,'left');for(const c of r.body.cases.slice(0,3))assert.equal(c.joined,false)})
 check('Anastasia gets her lifetime 350 grant back after the erroneous ban',()=>{const j=joins.listJoins().find(j=>j.token===free);assert.equal(j.lifetime,true);assert.equal(j.complimentary.revokedAt,undefined);assert.equal(j.complimentary.nominalAmount,350)})
 check('Maria original signed payment is recovered and her waiting request is approved',()=>{const c=r.body.cases.find(c=>c.username==='vmashik');assert.equal(c.realPaymentFound,true);assert.equal(c.joined,true);const ledger=joins.listJoins().flatMap(j=>j.payments||[]).filter(p=>p.orderKey==='maria-real-signed');assert.equal(ledger.length,1);assert.equal(ledger[0].amount,350)})
 check('an old signed receipt cannot be reported as a currently paid period',()=>{const c=r.body.cases.find(c=>c.username==='civillaw_civile');assert.equal(c.realPaymentFound,false);assert.equal(c.accessGranted,true)})
 check('restoration preserves every original payment and does not turn owner permission into money',()=>{const after=joins.listJoins().flatMap(j=>j.payments||[]);for(const p of before)assert.ok(after.some(q=>JSON.stringify(q)===JSON.stringify(p)));const grants=joins.listJoins().filter(j=>j.ownerAccess);assert.ok(grants.every(j=>j.paid===false&&!(j.payments||[]).length))})
 check('failed administrator receipts remain pending after the payment is credited',()=>{assert.ok(joins.listJoins().some(j=>(j.adminPaymentNotices||[]).some(n=>!n.done)));assert.equal(r.body.pendingAdminNotices>0,true)})
 const hooksCalls=()=>fs.readFileSync(path.join(root,'telegram-calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l))
 const oldBans=hooksCalls().filter(c=>c.method==='banChatMember').length
 await hook('processAccessExpiry')
 check('the persistent emergency pause prevents every automatic ban, including after restart',()=>{assert.equal(hooksCalls().filter(c=>c.method==='banChatMember').length,oldBans);assert.ok(fs.existsSync(path.join(root,'data/community-removals-paused.json')))})
 // Deliver chat_member transitions with Telegram's real actor semantics.
 let updateSerial=0
 const transition=async(actor,status)=>{await request('/api/telegram/webhook',{update_id:now+(++updateSerial),chat_member:{chat:{id:-100900000001},from:{id:Number(actor)},old_chat_member:{status:'member',user:members['376201355'].user},new_chat_member:{status,user:members['376201355'].user}}});await wait(150)}
 await transition('900000099','kicked')
 check('a bot/admin kick never revokes complimentary lifetime access',()=>assert.equal(joins.getJoin(free).lifetime,true))
 await transition('900000099','left')
 check('an administrator removal is also not a voluntary departure',()=>assert.equal(joins.getJoin(free).lifetime,true))
 fs.rmSync(path.join(root,'admin-offline'))
 await hook('',{clock:now+61000});await hook('deliverPaymentAdminNotices')
 check('administrator payment receipts retry successfully after Telegram recovers',()=>{const n=joins.listJoins().flatMap(j=>j.adminPaymentNotices||[]);assert.ok(n.length>=4);assert.ok(n.every(n=>n.done))})
 const delivered=hooksCalls().filter(c=>c.method==='sendMessage'&&String(c.body.chat_id)==='900000099').length
 await hook('deliverPaymentAdminNotices');check('acknowledged administrator receipts are not sent a second time',()=>assert.equal(hooksCalls().filter(c=>c.method==='sendMessage'&&String(c.body.chat_id)==='900000099').length,delivered))
 r=await invoke(true);check('repeated rescue does not duplicate a payment or access grant',()=>{assert.equal(r.status,200);assert.equal(joins.listJoins().flatMap(j=>j.payments||[]).filter(p=>p.orderKey==='maria-real-signed').length,1);assert.equal(joins.listJoins().filter(j=>j.ownerAccess?.reason==='keep_member').length,1)})
 const health=await request('/api/health');check('health explicitly reports the pause instead of claiming exclusions are running',()=>{assert.equal(health.body.accessRescueVersion,1);assert.equal(health.body.automaticAccessRemovalPaused,true)})
 await transition('376201355','left');check('only Anastasia own voluntary departure can end her until-departure grant',()=>assert.equal(joins.getJoin(free).lifetime,false))
}

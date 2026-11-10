import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {HmacHelper} from '../lib/hmac.js'
import {recoveryRequestSignature} from '../lib/subscriptionRecovery.js'
export async function runCommunityFollowup({root,request,hook,read,check,wait,pathToFileURL}){
 const now=Date.parse('2026-11-10T21:00:00+03:00'),DAY=86400000
 await hook('',{clock:now});fs.writeFileSync(path.join(root,'telegram-ok'),'')
 const joins=await import(pathToFileURL(path.join(root,'lib/store.js'))),users=await import(pathToFileURL(path.join(root,'lib/botUsers.js')))
 const ids=['376201355','1955667679','900000042','900000043'],names=['Анастасия Шемонаева','Диана Плиева','Кристина Брехова','Мария Лапшина'],nicks=['ognevushaa','mulanka_7','civillaw_civile','vmashik'],members={},tokens={}
 for(let i=0;i<ids.length;i++){
  const id=ids[i],t=i===0?joins.createLifetimeJoin({tgUserId:id,name:names[i],telegram:'@'+nicks[i]}):joins.createPendingJoin({name:names[i],telegram:'@'+nicks[i],tariffId:null})
  joins.setTgUserId(t,id);tokens[id]=t
  if(i===0)joins.patchJoin(t,{complimentary:{nominalAmount:350,untilDeparture:true},inviteDelivery:{key:'original-invite',pending:false,deliveredAt:now-DAY}})
  else joins.patchJoin(t,{ownerAccess:{active:true,source:'owner_access_rescue_20261110',reason:i===1?'keep_member':'owner_confirmed_payment'}})
  users.touchBotUser({id,username:nicks[i],first_name:names[i]});members[id]={status:i===1?'member':'left',requestPending:false,user:{id:Number(id),username:nicks[i]}}
 }
 const archives=[]
 for(const [id,name]of [['116539405','Артём'],['836512617','Олеся'],['771331224','Панкрат'],['941467514','Егор']]){const t=joins.createImportedJoin({tgUserId:id,name,amount:350,nextPaymentAt:now-10*DAY});archives.push(joins.getJoin(t));members[id]={status:'left',user:{id:Number(id)}}}
 fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify(members))
 const body=(id,username,order)=>({payment_status:'success',sum:'350',date:new Date(now-DAY).toISOString(),order_id:order,tg_user_id:id,customer_extra:'Подписка | '+username+' | @'+username,subscription:{id:'2611878',payment_num:'1',profile_id:'p-'+id,date_next_payment:new Date(now+29*DAY).toISOString()}})
 const kristina=body(ids[2],nicks[2],'old-signed-kristina'),maria=body(ids[3],nicks[3],'maria-confirmed')
 const mt=joins.createPendingJoin({name:names[3],telegram:'@vmashik',tariffId:'1m'});joins.setTgUserId(mt,ids[3]);joins.recordPayment(mt,{amount:350,paidAt:now-DAY,nextPaymentAt:now+29*DAY,orderKey:maria.order_id,subscriptionId:'2611878',profileId:maria.subscription.profile_id})
 fs.writeFileSync(path.join(root,'data/prodamus-webhooks.jsonl'),JSON.stringify({receivedAt:now-DAY,body:kristina,sign:HmacHelper.create(kristina,'test-no-real-provider')})+'\n'+JSON.stringify({receivedAt:now-DAY,body:maria,verified:true})+'\n')
 const invoke=async signed=>{const b={purpose:'community-subscription-recovery',issuedAt:now,nonce:'c'.repeat(24),operation:'finish_community_followup_20261110',send:true,input:{}};return request('/api/internal/subscription-policy',b,signed?{'X-Recovery-Signature':recoveryRequestSignature(b,'test-no-real-provider')}:undefined)}
 let r=await invoke(false);check('finish operation requires owner signature before messages or recovery',()=>assert.equal(r.status,403))
 r=await invoke(true);check('finisher runs while leaving the enabled automation intact',()=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.ok,true);assert.equal(r.body.automaticExclusionEnabled,true)})
 check('the exact four historical cases disappear from the active-problem counter',()=>{assert.equal(r.body.unverifiedCards,0);assert.deepEqual(r.body.historical.map(c=>c.telegramId).sort(),archives.map(c=>String(c.tgUserId)).sort());for(const j of archives)assert.deepEqual(joins.getJoin(j.token),j)})
 check('Kristina original signature recovers one real payment without fabricating a transaction',()=>{assert.equal(r.body.recoveredSignedEvents,1);const c=r.body.cases.find(c=>c.username==='civillaw_civile');assert.equal(c.currentPaymentVerified,true);assert.equal(c.latestVerifiedPayment.amount,350);assert.equal(joins.listJoins().flatMap(j=>j.payments||[]).filter(p=>p.orderKey===kristina.order_id).length,1)})
 check('actual invitations are acknowledged but returning users are not falsely reported as joined',()=>{const ana=r.body.cases.find(c=>c.username==='ognevushaa'),m=r.body.cases.find(c=>c.username==='vmashik');assert.equal(ana.inviteAcceptedByTelegram,true);assert.equal(ana.joined,false);assert.equal(m.inviteAcceptedByTelegram,true);assert.equal(m.joined,false);assert.equal(r.body.pendingDeliveries,0)})
 const calls=()=>fs.readFileSync(path.join(root,'telegram-calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
 const reminders=()=>calls().filter(c=>c.method==='sendMessage'&&String(c.body.chat_id)==='1955667679'&&c.body.text.includes('350 ₽'))
 check('Diana gets the one-off 350-ruble reminder with her membership preserved',()=>{assert.equal(reminders().length,1);assert.ok(reminders()[0].body.text.includes('Доступ к сообществу за вами сохранён'));assert.equal(joins.getJoin(tokens[ids[1]]).ownerAccess.active,true);assert.equal(r.body.cases.find(c=>c.username==='mulanka_7').reminder350,'sent')})
 r=await invoke(true);check('repeated finish does not duplicate reminders, invitations or recovered money',()=>{assert.equal(r.body.recoveredSignedEvents,0);assert.equal(reminders().length,1);assert.equal(joins.listJoins().flatMap(j=>j.payments||[]).filter(p=>p.orderKey===kristina.order_id).length,1);assert.equal(r.body.unverifiedCards,0)})
 check('old paid callbacks are not mislabeled as new automatic renewals',()=>assert.equal(r.body.confirmedRenewalsSinceActivation,0))
 const stops=path.join(root,'prodamus-stop-requests.jsonl');check('completion never changes a recurring payment agreement or removes anyone',()=>{assert.ok(!fs.existsSync(stops)||!fs.readFileSync(stops,'utf8').trim());assert.equal(calls().filter(c=>c.method==='banChatMember').length,0)})
}

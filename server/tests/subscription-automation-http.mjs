import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {HmacHelper} from '../lib/hmac.js'
import {recoveryRequestSignature} from '../lib/subscriptionRecovery.js'
export async function runSubscriptionAutomation({root,request,hook,read,check,wait,pathToFileURL}){
 const DAY=86400000,start=Date.parse('2026-11-10T15:30:00+03:00'),due=Date.parse('2026-12-10T15:30:00+03:00'),id='900000730',username='new_resident',email='new-auto@example.invalid'
 let clock=start,serial=1000
 const joins=await import(pathToFileURL(path.join(root,'lib/store.js'))),bot=await import(pathToFileURL(path.join(root,'lib/botUsers.js')))
 const at=async t=>{clock=t;await hook('',{clock:t})};await at(start)
 fs.writeFileSync(path.join(root,'telegram-ok'),'')
 const members={[id]:{status:'left',requestPending:true,user:{id:Number(id),username}}}
 fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify(members))
 const calls=()=>fs.existsSync(path.join(root,'telegram-calls.jsonl'))?fs.readFileSync(path.join(root,'telegram-calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]
 const bans=who=>calls().filter(c=>c.method==='banChatMember'&&String(c.body.user_id)===String(who)).length
 const update=async body=>{await request('/api/telegram/webhook',{update_id:++serial,...body});await wait(100)}
 const signed=async body=>{const r=await request('/api/prodamus/webhook',body,{sign:HmacHelper.create(body,'test-no-real-provider')});await wait(100);assert.equal(r.status,200,JSON.stringify(r.body));return r}
 const operation=async send=>{const b={purpose:'community-subscription-recovery',issuedAt:clock,nonce:'d'.repeat(24),operation:'activate_subscription_automation_v1',send,input:{}};return request('/api/internal/subscription-policy',b,{'X-Recovery-Signature':recoveryRequestSignature(b,'test-no-real-provider')})}
 let r=await operation(false);check('automation cannot start without verified owner exceptions',()=>{assert.equal(r.status,503);assert.equal(r.body.error,'permanent_exceptions_unconfirmed')})
 const free=joins.createLifetimeJoin({tgUserId:'376201355',name:'Анастасия',telegram:'@ognevushaa'});joins.patchJoin(free,{complimentary:{nominalAmount:350,untilDeparture:true}})
 const diana=joins.createPendingJoin({name:'Диана',telegram:'@mulanka_7'});joins.setTgUserId(diana,'1955667679');joins.patchJoin(diana,{ownerAccess:{active:true,source:'owner_access_rescue_20261110',reason:'keep_member'}})
 fs.writeFileSync(path.join(root,'data/community-removals-paused.json'),'{}')
 r=await operation(false);check('preview validates exceptions and performs no exclusion or policy activation',()=>{assert.equal(r.status,200);assert.equal(r.body.enabled,false);assert.equal(bans(id),0)})
 r=await operation(true);check('activation verifies the public checkout, enables four-day automation and removes the pause',()=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.enabled,true);assert.equal(r.body.website.ok,true);assert.equal(r.body.website.realChargePerformed,false);assert.equal(r.body.cycle.ok,true);assert.equal(fs.existsSync(path.join(root,'data/community-removals-paused.json')),false);assert.equal(read('community-subscription-automation.json').policy.graceDays,4)})
 await update({message:{from:{id:Number(id),username,first_name:'Новый резидент'},chat:{id:Number(id),type:'private'},text:'/start'}})
 r=await request('/api/community/subscribe',{tariffId:'1m',name:'Новый резидент',email,phone:'+79000000730',telegram:'@'+username,consent:{policy:true,processing:true}})
 check('a new site customer receives a genuine checkout route response',()=>{assert.equal(r.status,200);assert.ok(r.body.url.includes('CHECKOUT'))})
 const token=joins.listJoins().find(j=>j.email===email).token
 const payment={payment_status:'success',date:new Date(start).toISOString(),sum:'690',order_id:'auto-first',customer_phone:'+79000000730',customer_email:email,tg_user_id:id,subscription:{id:'2854597',profile_id:'auto-profile',payment_num:'1',date_next_payment:new Date(due).toISOString()}}
 fs.writeFileSync(path.join(root,'admin-offline'),'')
 await signed(payment)
 check('the first signed payment records money once and preserves the locked price',()=>{const j=joins.getJoin(token);assert.equal(j.payments.length,1);assert.equal(j.nextPaymentAt,due);assert.equal(j.priceLock.amount,690)})
 check('a failed administrator receipt stays durable independently of payment processing',()=>assert.equal(joins.getJoin(token).adminPaymentNotices[0].done,false))
 await update({chat_join_request:{chat:{id:-100900000001},from:{id:Number(id),username},date:start/1000,user_chat_id:Number(id)}})
 check('paid entry is approved and resident, tariff and price tags are applied',()=>{assert.equal(joins.getJoin(token).inChat,true);const u=read('bot-users.json')[id];for(const t of ['резидент_сообщества','тариф_1m','цена_690','вступил_в_сообщество'])assert.ok(u.tags.includes(t))})
 fs.rmSync(path.join(root,'admin-offline'));await at(start+61000);await hook('deliverPaymentAdminNotices')
 check('administrator receipt retries after recovery without adding money',()=>{assert.equal(joins.getJoin(token).adminPaymentNotices[0].done,true);assert.equal(joins.getJoin(token).payments.length,1)})
 await at(due-DAY);await hook('sendAutoResidentReminders');const reminders=calls().filter(c=>c.method==='sendMessage'&&String(c.body.chat_id)===id&&c.body.text.includes('Следующее списание'))
 await hook('sendAutoResidentReminders');check('the 24-hour reminder is sent once per period',()=>{assert.equal(reminders.length,1);assert.equal(calls().filter(c=>c.method==='sendMessage'&&String(c.body.chat_id)===id&&c.body.text.includes('Следующее списание')).length,1)})
 await at(due);await signed({date:new Date(due).toISOString(),tg_user_id:id,subscription:{id:'2854597',profile_id:'auto-profile',type:'notification',notification_code:'auto_payment',error_code:'insufficient_funds',current_attempt:'1'}})
 check('failed debit applies the control tag and retains all payment history',()=>{assert.ok(read('bot-users.json')[id].tags.includes('контроль_списания'));assert.equal(joins.getJoin(token).payments.length,1)})
 await at(due+4*DAY-1);await hook('processAutomaticExpiry');check('no exclusion occurs before exactly four extra days',()=>assert.equal(bans(id),0))
 await at(due+4*DAY);await hook('processAutomaticExpiry');check('after four days a verified unpaid resident is removed and immediately unbanned',()=>{assert.equal(bans(id),1);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json')))[id].status,'left');assert.equal(joins.getJoin(token).accessClosedFor,due)})
 check('exclusion preserves money, tariff and recurring consent and changes access tags',()=>{const j=joins.getJoin(token);assert.equal(j.payments.length,1);assert.equal(j.priceLock.amount,690);assert.equal(j.cancellation,undefined);assert.ok(read('bot-users.json')[id].tags.includes('доступ_закрыт'))})
 await hook('processAutomaticExpiry');check('the following cycle does not remove or notify the member twice',()=>{assert.equal(bans(id),1);assert.equal(joins.getJoin(token).accessClosureNotice.done,true)})
 await at(due+4*DAY+1000);const next=clock+31*DAY;await signed({...payment,date:new Date(clock).toISOString(),order_id:'auto-return',subscription:{...payment.subscription,payment_num:'2',date_next_payment:new Date(next).toISOString()}})
 await hook('processAutomaticExpiry');check('a later real payment restores the locked-price entitlement and sends a new invitation',()=>{const j=joins.getJoin(token);assert.equal(j.nextPaymentAt,next);assert.equal(j.priceLock.amount,690);assert.equal(j.payments.length,2);assert.ok(read('bot-users.json')[id].tags.includes('резидент_сообщества'));assert.ok(calls().some(c=>c.method==='sendMessage'&&String(c.body.chat_id)===id&&c.body.reply_markup?.inline_keyboard?.some(row=>row.some(b=>b.text==='Вступить в сообщество'))))})
 await signed({...payment,date:new Date(clock).toISOString(),order_id:'auto-return',subscription:{...payment.subscription,payment_num:'2',date_next_payment:new Date(next).toISOString()}})
 check('duplicate provider callbacks cannot credit the return twice',()=>assert.equal(joins.getJoin(token).payments.length,2))
 // A different resident has an accepted renewal that is missing from the ledger despite an old application marker.
 const other='900000731',otherToken=joins.createPendingJoin({name:'Оплата в обработке',telegram:'@pending_auto'});joins.setTgUserId(otherToken,other)
 const original={...payment,tg_user_id:other,customer_email:undefined,customer_phone:undefined,order_id:'pending-original',date:new Date(start).toISOString(),subscription:{...payment.subscription,profile_id:'pending-profile'}};delete original.customer_email;delete original.customer_phone;await signed(original)
 const currentMembers=JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json')));currentMembers[other]={status:'member',user:{id:Number(other),username:'pending_auto'}};fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify(currentMembers))
 const pending={...original,order_id:'pending-recovery',date:new Date(clock).toISOString(),subscription:{...original.subscription,payment_num:'2',date_next_payment:new Date(next).toISOString()}}
 fs.appendFileSync(path.join(root,'data/prodamus-webhooks.jsonl'),JSON.stringify({verified:true,receivedAt:clock,body:pending})+'\n')
 const applied=read('prodamus-applied.json');const {prodamusEventId}=await import('../lib/subscriptionExpirySync.js');applied[prodamusEventId(pending)]={at:clock};fs.writeFileSync(path.join(root,'data/prodamus-applied.json'),JSON.stringify(applied))
 await hook('processAutomaticExpiry');check('ledger reconciliation recovers an accepted renewal even when the application marker is stale',()=>{assert.equal(joins.getJoin(otherToken).payments.length,2);assert.equal(bans(other),0)})
 // Verified payment retires only the payer's temporary owner grant, never Diana's protection.
 const service=joins.createPendingJoin({name:'Временный допуск',telegram:'@pending_auto'});joins.setTgUserId(service,other);joins.patchJoin(service,{ownerAccess:{active:true,source:'owner_access_rescue_20261110',reason:'owner_confirmed_payment'}})
 await hook('processAutomaticExpiry');check('temporary paid-admission grants cease after real paid access is established',()=>{assert.equal(joins.getJoin(service).ownerAccess.active,false);assert.equal(joins.getJoin(diana).ownerAccess.active,true);assert.equal(joins.getJoin(free).lifetime,true)})
 const bad='900000732',badToken=joins.createPendingJoin({name:'Непроверенный импорт',telegram:'@legacy_import'});joins.setTgUserId(badToken,bad);joins.patchJoin(badToken,{paid:true,status:'active',lastPaidAt:start,nextPaymentAt:due,payments:[{at:start,amount:350,estimated:true}]});const m=JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json')));m[bad]={status:'member',user:{id:Number(bad),username:'legacy_import'}};fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify(m))
 await hook('processAutomaticExpiry');await hook('processAutomaticExpiry');check('an unverified imported period never authorizes a ban and creates one review',()=>{assert.equal(bans(bad),0);assert.equal(joins.getJoin(badToken).adminPaymentNotices.filter(n=>n.type==='automation_review').length,1)})
 // Payment accepted while Telegram removes a resident must restore entitlement and a retriable invitation.
 const race='900000733',raceToken=joins.createPendingJoin({name:'Оплата во время исключения',telegram:'@racy_auto'});joins.setTgUserId(raceToken,race)
 const raceOld={...original,tg_user_id:race,order_id:'race-original',subscription:{...original.subscription,profile_id:'race-profile'}};await signed(raceOld)
 let mm=JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json')));mm[race]={status:'member',user:{id:Number(race),username:'racy_auto'}};fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify(mm));joins.patchJoin(raceToken,{inChat:true})
 fs.writeFileSync(path.join(root,'during-ban-payment.json'),JSON.stringify({...raceOld,order_id:'race-renewal',date:new Date(clock).toISOString(),subscription:{...raceOld.subscription,payment_num:'2',date_next_payment:new Date(next).toISOString()}}))
 await hook('processAutomaticExpiry');check('payment accepted during the Telegram removal request restores access and durable invitation',()=>{const j=joins.getJoin(raceToken);assert.equal(j.nextPaymentAt,next);assert.equal(j.payments.length,2);assert.notEqual(j.accessClosedFor,due);assert.ok(j.inviteDelivery);assert.equal(j.accessUnbanPending,undefined)})
 const amb='900000734',ambToken=joins.createPendingJoin({name:'Потерян ответ Telegram',telegram:'@amb_auto'});joins.setTgUserId(ambToken,amb)
 const ambOld={...original,tg_user_id:amb,order_id:'amb-original',subscription:{...original.subscription,profile_id:'amb-profile'}};await signed(ambOld)
 mm=JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json')));mm[amb]={status:'member',user:{id:Number(amb),username:'amb_auto'}};fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify(mm));joins.patchJoin(ambToken,{inChat:true})
 fs.writeFileSync(path.join(root,'ambiguous-ban'),'1');await hook('processAutomaticExpiry');check('an ambiguous ban response leaves a durable unban repair flag',()=>assert.equal(joins.getJoin(ambToken).accessUnbanPending,true))
 await signed({...ambOld,order_id:'amb-renewal',date:new Date(clock).toISOString(),subscription:{...ambOld.subscription,payment_num:'2',date_next_payment:new Date(next).toISOString()}})
 await hook('processAutomaticExpiry');check('a later paid resident is unbanned and reinvited even after the ban response was lost',()=>{const j=joins.getJoin(ambToken);assert.equal(j.accessUnbanPending,undefined);assert.equal(j.nextPaymentAt,next);assert.ok(j.inviteDelivery);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json')))[amb].status,'left')})
 const journal=path.join(root,'data/prodamus-webhooks.jsonl'),saved=fs.readFileSync(journal);fs.appendFileSync(journal,'{corrupt\n');await hook('processAutomaticExpiry');check('a corrupt accepted journal stops the exclusion cycle',()=>{assert.equal(bans(bad),0)});fs.writeFileSync(journal,saved);await hook('processAutomaticExpiry')
 const health=await request('/api/health');check('health reports effective enabled automation, four days and the last actual cycle',()=>{assert.equal(health.body.subscriptionAutomation,1);assert.equal(health.body.autoExclude,true);assert.equal(health.body.automaticAccessRemovalPaused,false);assert.equal(health.body.graceDays,4);assert.ok(health.body.automationLastCycle.at);assert.equal(health.body.automationLastCycle.ok,true)})
 const stopFile=path.join(root,'prodamus-stop-requests.jsonl');check('automatic expiry never stops a Prodamus recurring agreement',()=>assert.ok(!fs.existsSync(stopFile)||!fs.readFileSync(stopFile,'utf8').trim()))
}

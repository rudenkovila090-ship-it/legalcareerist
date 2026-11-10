import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { HmacHelper } from '../lib/hmac.js'
import { recoveryRequestSignature } from '../lib/subscriptionRecovery.js'

export async function runExpirySync({root,request,hook,read,check,wait,pathToFileURL}) {
  const joins=await import(pathToFileURL(path.join(root,'lib/store.js')))
  const bot=await import(pathToFileURL(path.join(root,'lib/botUsers.js')))
  const access=await import(pathToFileURL(path.join(root,'lib/subscriptionAccess.js')))
  const DAY=86400000,HOUR=3600000,due=Date.parse('2026-11-01T12:00:00Z')
  let clock=due+4*DAY
  const members={}
  function member(id,phone,{end=due,status='active',imported=false}={}) {
    const token=joins.createPendingJoin({name:'Synthetic '+id,phone,telegram:'@synthetic_'+id,tariffId:'1m'})
    joins.setTgUserId(token,id)
    joins.recordPayment(token,{amount:690,paidAt:due-30*DAY,nextPaymentAt:end,subscriptionId:'2854597',profileId:'profile-'+id,orderKey:'paid-'+id})
    if(!imported)fs.appendFileSync(path.join(root,'data/prodamus-webhooks.jsonl'),JSON.stringify({verified:true,receivedAt:due-30*DAY,body:{payment_status:'success',date:new Date(due-30*DAY).toISOString(),sum:'690',order_id:'paid-'+id,tg_user_id:id,subscription:{id:'2854597',profile_id:'profile-'+id,payment_num:'1',date_next_payment:new Date(end).toISOString()}}})+'\n')
    joins.patchJoin(token,{status,inChat:true,...(imported?{importedFromBotHelp:true,payments:[{amount:690,at:due-30*DAY,estimated:true}]}:{})})
    bot.touchBotUser({id,username:'synthetic_'+id})
    for(const tag of ['резидент_сообщества','тариф_1m','цена_690','оплатил_подписку'])bot.addTag(id,tag)
    members[id]={status:'member',user:{id:Number(id),username:'synthetic_'+id}}
    return token
  }
  const a=member('900000041','+79000000401')
  fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify(members));fs.writeFileSync(path.join(root,'telegram-ok'),'')
  const calls=()=>{try{return fs.readFileSync(path.join(root,'telegram-calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)}catch{return[]}}
  const stops=()=>{try{return fs.readFileSync(path.join(root,'prodamus-stop-requests.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)}catch{return[]}}
  const bans=id=>calls().filter(c=>c.method==='banChatMember'&&String(c.body.user_id)===id)
  const at=async t=>{clock=t;await hook('',{clock:t})}
  const signed=async body=>{const r=await request('/api/prodamus/webhook',body,{sign:HmacHelper.create(body,'test-no-real-provider')});await wait(80);return r}
  const fail=(id,time,code='system_error')=>({tg_user_id:id,date:new Date(time).toISOString(),subscription:{id:'2854597',profile_id:'profile-'+id,type:'notification',notification_code:'auto_payment',current_attempt:'2',last_attempt:'yes',error_code:code}})
  await at(clock)
  const blocked=fail('900000041',due+3*DAY,'CARD_TEMPORARY_BLOCKED')
  let r=await request('/api/prodamus/webhook',blocked)
  check('unsigned failures never establish cancellation evidence or a retry window',()=>{assert.equal(r.status,400);assert.equal(joins.getJoin(a).lastChargeFailure,undefined)})
  await signed(blocked)
  check('signed card blocking extends access to 72 hours from the event without changing paid dates',()=>{const j=joins.getJoin(a);assert.equal(j.nextPaymentAt,due);assert.equal(access.accessUntil(j),due+6*DAY);assert.equal(j.lastChargeFailure.verified,true)})
  await hook('processAccessExpiry')
  check('the end of four days does not remove a resident still in the bank block window',()=>{assert.equal(bans('900000041').length,0);assert.equal(stops().length,0)})
  await at(due+5*DAY);await signed(blocked)
  check('a duplicate blocked-card notification never restarts 72 hours',()=>assert.equal(access.accessUntil(joins.getJoin(a)),due+6*DAY))
  await at(due+6*DAY);await hook('processAccessExpiry')
  check('expiry closes access after the bank retry window without cancelling recurring billing',()=>{const j=joins.getJoin(a);assert.equal(bans('900000041').length,1);assert.equal(stops().length,0);assert.equal(j.cancellation,undefined);assert.equal(j.status,'active')})
  fs.writeFileSync(path.join(root,'prodamus-cancel-ok'),'')
  await at(due+6*DAY+6*HOUR);await hook('processAccessExpiry')
  check('access closure preserves original payments and locked price without inventing provider cancellation',()=>{
    const j=joins.getJoin(a);assert.equal(bans('900000041').length,1);assert.equal(j.billingClosure,undefined);assert.equal(j.inChat,false);assert.equal(j.priceLock.amount,690);assert.equal(j.payments.length,1);assert.equal(j.accessClosedFor,due)
    const u=read('bot-users.json')['900000041'];assert.ok(u.tags.includes('бывший_резидент'));assert.ok(u.tags.includes('доступ_закрыт'));assert.ok(!u.tags.includes('резидент_сообщества'));assert.ok(!u.tags.includes('проверка_подписки'))
  })
  const stopCount=stops().length;await hook('processAccessExpiry')
  check('another scheduler pass does not stop billing or remove the member twice',()=>{assert.equal(stops().length,stopCount);assert.equal(bans('900000041').length,1)})

  const b=member('900000042','+79000000402')
  fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify({...JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json'))),['900000042']:members['900000042']}))
  await signed(fail('900000042',due+DAY))
  const payment={payment_status:'success',tg_user_id:'900000042',customer_phone:'+79000000402',date:new Date(clock).toISOString(),order_id:'unapplied-new-payment',sum:'690',subscription:{id:'2854597',profile_id:'profile-900000042',payment_num:'2',date_next_payment:new Date(clock+30*DAY).toISOString()}}
  fs.appendFileSync(path.join(root,'data/prodamus-webhooks.jsonl'),JSON.stringify({receivedAt:clock,verified:true,body:payment})+'\n')
  await hook('processAccessExpiry')
  check('an accepted payment missing from the ledger blocks both bank cancellation and exclusion',()=>{assert.equal(joins.getJoin(b).billingReview.reason,'unprocessed_payment');assert.equal(bans('900000042').length,0);assert.equal(stops().filter(s=>s.telegramId==='900000042').length,0)})
  await hook('processAutomaticExpiry')
  check('replaying an accepted verified payment restores active tags and retains the locked price before any exclusion',()=>{const j=joins.getJoin(b);assert.equal(j.payments.length,2);assert.equal(access.hasAccess(j,clock),true);assert.equal(j.priceLock.amount,690);assert.ok(read('bot-users.json')['900000042'].tags.includes('резидент_сообщества'));assert.ok(!read('bot-users.json')['900000042'].tags.includes('проверка_подписки'))})
  await hook('processAutomaticExpiry')
  check('a repeated automatic pass never credits the replayed payment twice',()=>assert.equal(joins.getJoin(b).payments.length,2))

  const c=member('900000043','+79000000403',{end:clock+DAY})
  fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify({...JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json'))),['900000043']:members['900000043']}))
  const end=clock+DAY
  const accountUsers=await import(pathToFileURL(path.join(root,'lib/accountUsers.js')))
  const auth=await import(pathToFileURL(path.join(root,'lib/accountAuth.js')))
  const email='synthetic-cancel@example.invalid';joins.patchJoin(c,{email})
  const registration=accountUsers.startRegistration({email,name:'Synthetic',consentAt:clock})
  const account=accountUsers.consumeToken(registration.token,'Synthetic-Password-2026!').account
  const session=auth.startSession('u:'+account.id,clock)
  const headers={Authorization:'Bearer '+session.token}
  r=await request('/api/account/subscription/cancel',{reasonCode:'price'},headers)
  check('website cancellation requires a reason and keeps access through the paid end',()=>{assert.equal(r.status,200);const j=joins.getJoin(c);assert.equal(j.cancellation.confirmed,true);assert.equal(access.accessUntil(j),end);assert.equal(access.hasAccess(j,end-1),true)})
  await at(end-1);await hook('processAccessExpiry')
  check('a voluntarily cancelled paid resident remains until the last millisecond',()=>assert.equal(bans('900000043').length,0))
  await at(end);await hook('processAccessExpiry')
  check('voluntary cancellation excludes at the paid end without adding four more days or repeating the bank stop',()=>{assert.equal(bans('900000043').length,1);assert.equal(stops().filter(s=>s.telegramId==='900000043').length,1)})
  r=await request('/api/account/subscription/renew',{},headers)
  check('returning at the locked price reuses the confirmed cancellation instead of stopping an ended contract again',()=>{assert.equal(r.status,200);assert.equal(stops().filter(s=>s.telegramId==='900000043').length,1)})

  const d=member('900000044','+79000000404',{imported:true})
  fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify({...JSON.parse(fs.readFileSync(path.join(root,'telegram-members.json'))),['900000044']:members['900000044']}))
  await hook('processAccessExpiry')
  check('an imported price label never authorizes provider cancellation or automatic removal',()=>{assert.equal(joins.getJoin(d).cancellation,undefined);assert.equal(bans('900000044').length,0)})

  const audit={purpose:'community-subscription-recovery',issuedAt:clock,nonce:'e'.repeat(24),operation:'audit_expiry',send:false,input:{}}
  r=await request('/api/internal/subscription-policy',audit)
  check('the subscription policy audit requires a signed administrator request',()=>assert.equal(r.status,403))
  const before=stops().length
  r=await request('/api/internal/subscription-policy',audit,{'X-Recovery-Signature':recoveryRequestSignature(audit,'test-no-real-provider')})
  check('the read-only audit reports the actual scheduler flag, grace and exceptions without banking actions',()=>{assert.equal(r.status,200);assert.equal(r.body.version,3);assert.equal(r.body.autoExclude,true);assert.equal(r.body.graceDays,4);assert.equal(r.body.intervalSeconds,30);assert.equal(stops().length,before);assert.ok(r.body.rows.some(row=>row.telegramId==='900000044'))})
  const f=joins.createPendingJoin({name:'Synthetic Historical',phone:'+79000000405',telegram:'@synthetic_historical',tariffId:'1m'})
  joins.setTgUserId(f,'900000045')
  await at(Date.parse('2027-02-28T22:30:00Z')) // March 1 in Moscow
  await signed({payment_status:'success',date:new Date(clock).toISOString(),sum:'500',order_id:'historical-monthly-500',customer_phone:'+79000000405',tg_user_id:'900000045',subscription:{id:'2611880',profile_id:'historical-500-profile',payment_num:'1'}})
  check('historical monthly 500 stays recurring and uses a Moscow calendar month when Prodamus omits the next date',()=>{
    const j=joins.getJoin(f);assert.ok(!j.oneTime);assert.equal(j.nextPaymentAt,Date.parse('2027-03-31T22:30:00Z'));assert.equal(j.priceLock.amount,500);assert.equal(j.priceLock.subscriptionId,'2611880');assert.equal(j.nextPaymentSource,'calculated')
  })
  const z=member('900000046','+79000000406',{end:clock-3*DAY})
  await signed({tg_user_id:'900000046',date:new Date(clock-2*HOUR).toISOString(),subscription:{id:'2854597',profile_id:'profile-900000046',type:'action',action_code:'finish',active_user:'0'}})
  await signed(fail('900000046',clock-HOUR,'CARD_TEMPORARY_BLOCKED'))
  check('out-of-order provider completion followed by a charge error retains the entire block window',()=>{
    const j=joins.getJoin(z);assert.equal(j.cancellation.source,'automatic_nonpayment');assert.equal(access.accessUntil(j),clock+71*HOUR);assert.equal(bans('900000046').length,0)
  })
  const sid='900000047',sp='+79000000407'
  const st=joins.createPendingJoin({name:'Synthetic Svetik',phone:sp,email:'svetik@example.invalid',telegram:'https://t.me/Svetik_DI',tariffId:'1m'})
  const memberFile=path.join(root,'telegram-members.json')
  fs.writeFileSync(memberFile,JSON.stringify({...JSON.parse(fs.readFileSync(memberFile)),[sid]:{status:'left',user:{id:Number(sid),username:'svetik_di'}}}))
  await request('/api/telegram/webhook',{update_id:910000001,chat_join_request:{chat:{id:-100900000001},from:{id:Number(sid),first_name:'Synthetic',username:'svetik_di'},user_chat_id:Number(sid),date:Math.floor(clock/1000)}});await wait(100)
  check('request received before payment remains in a durable admission queue',()=>assert.ok(read('community-join-requests.json')[sid]))
  await signed({payment_status:'success',date:new Date(clock).toISOString(),sum:'350',order_id:'svetik-before-request-paid',customer_phone:sp,subscription:{id:'2611878',profile_id:'svetik-profile',payment_num:'1',date_next_payment:new Date(clock+30*DAY).toISOString()}})
  check('later signed payment binds the pending request and approves admission automatically',()=>{assert.equal(joins.getJoin(st).tgUserId,sid);assert.equal(joins.getJoin(st).inChat,true);assert.equal(read('community-join-requests.json')[sid],undefined);assert.ok(calls().some(c=>c.method==='approveChatJoinRequest'&&String(c.body.user_id)===sid))})
  await request('/api/telegram/webhook',{update_id:910000003,message:{from:{id:900000099,username:'other_account'},chat:{id:900000099,type:'private'},text:'/start access_'+st}});await wait(100)
  check('a reused start link cannot rebind another resident’s paid subscription',()=>assert.equal(joins.getJoin(st).tgUserId,sid))
  const aid='376201355',old=member(aid,'+79000000408')
  bot.touchBotUser({id:aid,first_name:'Анастасия',last_name:'Шемонаева',username:'synthetic_anastasia'})
  fs.writeFileSync(memberFile,JSON.stringify({...JSON.parse(fs.readFileSync(memberFile)),[aid]:{status:'member',user:{id:Number(aid),first_name:'Анастасия',last_name:'Шемонаева',username:'synthetic_anastasia'}}}))
  const oldMoney=structuredClone(joins.getJoin(old).payments)
  const fix={purpose:'community-subscription-recovery',issuedAt:clock,nonce:'f'.repeat(24),operation:'repair_community_20261110',send:false,input:{}}
  r=await request('/api/internal/subscription-policy',fix,{'X-Recovery-Signature':recoveryRequestSignature(fix,'test-no-real-provider')})
  check('signed maintenance grants owner-approved lifetime nominal 350 access with no fake payments',()=>{assert.equal(r.status,200);assert.equal(r.body.complimentary,'lifetime_nominal_350');const c=joins.listJoins().find(j=>String(j.tgUserId)===aid&&j.lifetime);assert.ok(c);assert.deepEqual(c.payments,[]);assert.equal(c.complimentary.nominalAmount,350);assert.deepEqual(joins.getJoin(old).payments,oldMoney);assert.ok(read('bot-users.json')[aid].tags.includes('цена_350'));assert.equal(bans(aid).length,0)})
  await request('/api/telegram/webhook',{update_id:910000002,chat_member:{chat:{id:-100900000001},from:{id:Number(aid)},old_chat_member:{status:'member'},new_chat_member:{status:'left',user:{id:Number(aid),first_name:'Анастасия',last_name:'Шемонаева',username:'synthetic_anastasia'}}}});await wait(100)
  check('courtesy access ends on departure without generating a provider cancellation',()=>{const c=joins.listJoins().find(j=>j.complimentary?.nominalAmount===350);assert.equal(c.lifetime,false);assert.ok(c.complimentary.revokedAt);assert.deepEqual(c.payments,[])})
  check('complimentary grant records remain separate from paid-contract matching after departure',()=>assert.equal(joins.findJoinForPayment({tgUserId:aid}).join.token,old))
  const kid='900000049',kt=member(kid,'+79000000409',{end:clock+10*DAY})
  await signed({date:new Date(clock+1).toISOString(),tg_user_id:kid,subscription:{id:'2854597',profile_id:'profile-'+kid,type:'action',action_code:'deactivation',active:'0',active_user:'1',active_manager:'0'}})
  check('manager deactivation is identified separately from voluntary resident cancellation and preserves paid access',()=>{const c=joins.getJoin(kt);assert.equal(c.providerCancellation.actor,'manager');assert.equal(c.cancellation,undefined);assert.equal(access.hasAccess(c,clock),true);assert.ok(calls().some(c=>c.method==='sendMessage'&&c.body.text?.includes('отключение менеджером')));assert.equal(stops().filter(x=>x.telegramId===kid).length,0)})

}

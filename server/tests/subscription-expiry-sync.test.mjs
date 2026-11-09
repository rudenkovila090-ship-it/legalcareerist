import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifiedChargeFailure, verifiedProviderState, expiryBillingDecision, createPendingPaymentGuard, createExpiryBillingSync, createProdamusReplay, prodamusEventId } from '../lib/subscriptionExpirySync.js'
import { accessUntil, hasAccess } from '../lib/subscriptionAccess.js'
import { createAccessExpiryWorker } from '../lib/accessExpiry.js'
import { subscriptionActivityConfirmed } from '../lib/prodamus.js'

const DAY = 86400000, HOUR = 3600000, now = Date.parse('2026-11-05T12:00:00Z'), due = now - 4 * DAY
const base = () => ({token:'old', tgUserId:'900000031', paid:true, status:'active', nextPaymentAt:due, firstPaidAt:due-30*DAY, lastPaidAt:due-30*DAY,
  payments:[{at:due-30*DAY,amount:690,subscriptionId:'2854597',orderKey:'confirmed-old'}]})
const failure = at => ({date:new Date(at).toISOString(),subscription:{id:'2854597',profile_id:'synthetic',notification_code:'auto_payment',current_attempt:'1',last_attempt:'yes',error_code:'system_error'}})
function fixture(options = {}) {
  let join = {...base(), ...options.join}, clock = now
  if (!options.noEvidence) join.lastChargeFailure = verifiedChargeFailure(join, failure(due+1), due+1)
  const calls = [], get = () => join, patch = (_token, fields) => {join={...join,...fields};return join}
  const reconcile = createExpiryBillingSync({get,patch,stopOnExpiry:true,now:()=>clock,pendingPayment:async()=>options.pending||null,
    stop:async(j,plan)=>{calls.push('stop:'+plan);await options.onStop?.(patch,join);return {ok:options.stop!==false}},
    notifyReview:async(_j,reason)=>{calls.push('review:'+reason);return true}})
  const worker=createAccessExpiryWorker({list:()=>[join],patch,reconcile,now:()=>clock,membership:async()=>options.membership||'in',
    remove:async()=>{calls.push('remove');await options.onRemove?.(patch,join);return true},restoreAccess:async()=>{calls.push('restore')}})
  return {get,patch,calls,reconcile,worker,options,tick:ms=>{clock+=ms}}
}
test('bank acknowledgements are explicit and negative or ambiguous responses never succeed',()=>{
  for(const text of ['success','ok','"success"','true','1','{"success":true}','{"success":1}','{"success":"1"}','{"status":"success"}'])assert.equal(subscriptionActivityConfirmed(true,text),true,text)
  for(const text of ['Invalid token','token expired','payment ok but failed','<html>ok</html>','null','false','{"success":false}','{"success":true,"error":"denied"}','{"status":"success","success":"false"}','{"status":"success","error_code":"invalid_token"}'])assert.equal(subscriptionActivityConfirmed(true,text),false,text)
  assert.equal(subscriptionActivityConfirmed(false,'success'),false)
})
test('card block grants 72 hours from the actual failure beyond the four-day window without changing paid time',()=>{
  const j=base(),body=failure(due+3*DAY);body.subscription.error_code='CARD_TEMPORARY_BLOCKED'
  j.lastChargeFailure=verifiedChargeFailure(j,body,due+3*DAY)
  assert.equal(j.nextPaymentAt,due);assert.equal(accessUntil(j),due+6*DAY)
  assert.equal(verifiedChargeFailure(j,body,due+7*DAY),null)
  body.subscription.current_attempt='2';body.date=new Date(due+3*DAY+HOUR).toISOString()
  const repeat=verifiedChargeFailure(j,body,due+3*DAY+HOUR)
  assert.equal(repeat.blockedUntil,due+6*DAY)
})
test('voluntary cancellation keeps its paid end and ignores a new retry grace',()=>{
  const j={...base(),nextPaymentAt:now+DAY,status:'cancelled',cancellation:{confirmed:true,source:'website',confirmedAt:now,accessUntil:now+DAY}}
  j.lastChargeFailure={verified:true,dueAt:now+DAY,blockedUntil:now+10*DAY}
  assert.equal(accessUntil(j),now+DAY)
  assert.equal(expiryBillingDecision(j).stopped,true)
})
test('old failures, duplicate states and review holds do not transfer to a renewed paid period',()=>{
  const j=base();j.lastChargeFailure=verifiedChargeFailure(j,failure(due+1),due+1)
  j.billingReview={period:due,state:'pending',holdUntil:now+100*DAY}
  j.nextPaymentAt=now+30*DAY;j.lastPaidAt=now
  assert.equal(accessUntil(j),now+34*DAY)
  assert.equal(verifiedChargeFailure(j,failure(due+1),now),null)
  const event={date:new Date(now+1).toISOString(),subscription:{id:'2854597',type:'action',active_user:'0',action_code:'finish'}}
  j.billingProvider=verifiedProviderState(j,event,now+1)
  assert.equal(verifiedProviderState(j,event,now+2),null)
})
test('four days expire only after billing is stopped, then membership and tags can close',async()=>{
  const f=fixture(),payments=structuredClone(f.get().payments)
  assert.deepEqual(await f.worker(),['old'])
  assert.deepEqual(f.calls,['stop:2854597','remove'])
  assert.equal(f.get().billingClosure.source,'provider_api');assert.equal(f.get().status,'cancelled')
  assert.equal(f.get().accessClosedFor,due);assert.equal(f.get().nextPaymentAt,due);assert.deepEqual(f.get().payments,payments)
  await f.worker();assert.equal(f.calls.filter(c=>c==='remove').length,1)
})
test('an already absent member is reconciled locally without stopping recurring billing',async()=>{
  const f=fixture({membership:'out'});await f.worker()
  assert.deepEqual(f.calls,[]);assert.equal(f.get().accessClosedFor,due)
})
test('every recorded recurring contract must be confirmed and partial success is retained for retries',async()=>{
  let rejected=true
  const f=fixture({join:{payments:[{amount:690,at:due-30*DAY,subscriptionId:'2854597'},{amount:500,at:due-20*DAY,subscriptionId:'2611880'}]}})
  const sync=createExpiryBillingSync({get:f.get,patch:f.patch,stopOnExpiry:true,now:()=>now,pendingPayment:async()=>null,
    stop:async(_j,plan)=>{f.calls.push(plan);return {ok:f.calls.length===1||!rejected}},notifyReview:async()=>true})
  assert.equal(await sync(f.get()),false)
  const firstStopped=f.calls[0]
  assert.ok(f.get().billingStops[firstStopped])
  assert.equal(f.get().billingClosure,undefined)
  rejected=false
  assert.equal(await sync(f.get()),true)
  assert.equal(f.calls.filter(c=>c===firstStopped).length,1)
  assert.deepEqual(new Set(f.get().billingClosure.planIds),new Set(['2854597','2611880']))
})
test('a prior confirmed cancellation only covers plans paid before that cancellation',()=>{
  const j={...base(),payments:[{amount:690,at:due-30*DAY,subscriptionId:'2854597'},{amount:500,at:due-10*DAY,subscriptionId:'2611880'}],cancellation:{confirmed:true,source:'website',confirmedAt:due-20*DAY}}
  assert.deepEqual(expiryBillingDecision(j).planIds,['2611880'])
})
test('unconfirmed cancellation preserves access and queues one administrator review',async()=>{
  const f=fixture({stop:false});await f.worker()
  assert.deepEqual(f.calls,['stop:2854597','review:provider_stop_unconfirmed'])
  assert.equal(f.get().accessClosedFor,undefined);assert.equal(hasAccess(f.get(),now),true)
  await f.worker();assert.equal(f.calls.length,2)
  f.tick(6*HOUR);f.options.stop=true;await f.worker()
  assert.equal(f.get().accessClosedFor,due)
})
test('absence of a payment callback and imported prices alone never prove nonpayment or a provider plan',async()=>{
  const missing=fixture({noEvidence:true});await missing.worker()
  assert.deepEqual(missing.calls,['review:nonpayment_not_verified'])
  const imported=fixture({noEvidence:true,join:{importedFromBotHelp:true,payments:[{amount:690,estimated:true}],priceLock:{amount:690,subscriptionId:'2854597',source:'imported_record'}}})
  await imported.worker();assert.deepEqual(imported.calls,['review:provider_plan_unknown'])
})
test('signed completion for this period requires no repeated stop request',async()=>{
  const j=base(),event={date:new Date(due+DAY).toISOString(),subscription:{id:'2854597',type:'action',action_code:'finish',active_user:'0'}}
  const f=fixture({noEvidence:true,join:{status:'cancelled',billingProvider:verifiedProviderState(j,event,due+DAY)}})
  await f.worker();assert.deepEqual(f.calls,['remove'])
})
test('a real one-time payment cannot be confused with an imported recurring 500 label',()=>{
  const genuine={...base(),oneTime:true,oneTimeConfirmed:{source:'owner'},payments:[{amount:500,at:due-30*DAY,subscriptionId:null}]}
  assert.equal(expiryBillingDecision(genuine).oneTime,true)
  assert.equal(expiryBillingDecision({...genuine,importedFromBotHelp:true}).allowed,false)
  assert.equal(expiryBillingDecision({...genuine,prodamusProfileId:'profile'}).allowed,false)
})
test('future paid time, lifetime access and absent Telegram identity remain protected',async()=>{
  const paid=fixture({join:{nextPaymentAt:now+DAY}});await paid.worker();assert.deepEqual(paid.calls,[])
  const founder=fixture({join:{lifetime:true}});await founder.worker();assert.deepEqual(founder.calls,[])
  const missing=fixture({join:{tgUserId:null}});await missing.worker();assert.deepEqual(missing.calls,['review:telegram_id_unknown'])
})
test('a payment during bank cancellation keeps paid rights and records that renewal is off',async()=>{
  const f=fixture({onStop:patch=>patch('old',{lastPaidAt:now,nextPaymentAt:now+30*DAY})})
  await f.worker();assert.ok(!f.calls.includes('remove'));assert.equal(hasAccess(f.get(),now),true)
  assert.equal(f.get().cancellation.source,'automatic_nonpayment');assert.equal(accessUntil(f.get()),now+30*DAY)
})
test('a payment during Telegram removal restores an invite and never marks the new period closed',async()=>{
  const f=fixture({onRemove:patch=>patch('old',{lastPaidAt:now,nextPaymentAt:now+30*DAY})})
  await f.worker();assert.ok(f.calls.includes('restore'));assert.equal(f.get().accessClosedFor,undefined)
})
test('accepted but unapplied payment records and active webhook processing block closure',async()=>{
  for(const pending of ['unprocessed_payment','payment_processing']){
    const f=fixture({pending});await f.worker();assert.ok(!f.calls.includes('remove'));assert.ok(!f.calls.some(c=>c.startsWith('stop:')))
    assert.equal(hasAccess(f.get(),now),true)
  }
})
test('the payment guard only protects matching newer payments, and stops on damaged journals',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'expiry-journal-')),file=path.join(root,'events.jsonl'),j=base()
  try{
    const body={payment_status:'success',tg_user_id:j.tgUserId,order_id:'unapplied',date:new Date(now).toISOString(),subscription:{id:'2854597'}}
    fs.writeFileSync(file,JSON.stringify({verified:true,body})+'\n')
    const guard=createPendingPaymentGuard({list:()=>[j],file})
    assert.equal(await guard(j),'unprocessed_payment')
    j.payments.push({orderKey:'unapplied',amount:690,at:now})
    assert.equal(await guard(j),null)
    const noOrder={...body,order_id:undefined,subscription:{id:'2854597',profile_id:'profile',payment_num:'2'}}
    fs.appendFileSync(file,JSON.stringify({verified:true,body:noOrder})+'\n')
    assert.equal(await guard(j),'unprocessed_payment')
    j.payments.push({orderKey:'sub:2854597:profile:2',amount:690,at:now})
    assert.equal(await guard(j),null)
    fs.appendFileSync(file,'broken\n');assert.equal(await guard(j),'payment_journal_unreadable')
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('replay accepts only verified records or the known strict-process time window and preserves receipt time',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'expiry-replay-')),file=path.join(root,'events.jsonl'),applied=new Set(),seen=[]
  try{
    const old={subscription:{id:'2854597'},payment_status:'success',order_id:'untrusted-old'}
    const trusted={subscription:{id:'2854597'},payment_status:'success',order_id:'strict-receipt'}
    const blocked={subscription:{id:'2854597',error_code:'CARD_TEMPORARY_BLOCKED',notification_code:'auto_payment',date_next_payment:new Date(due+DAY).toISOString()}}
    fs.writeFileSync(file,[{body:old,receivedAt:due-DAY},{body:trusted,receivedAt:due+1},{body:blocked,receivedAt:due+DAY,verified:true}].map(JSON.stringify).join('\n')+'\n')
    const replay=createProdamusReplay({file,trustedFrom:due,isApplied:key=>applied.has(key),apply:async(body,receivedAt)=>{seen.push([body,receivedAt]);applied.add(prodamusEventId(body))}})
    assert.equal(await replay(),true);assert.equal(seen.length,2)
    assert.equal(seen[0][0].order_id,'strict-receipt');assert.equal(seen[1][1],due+DAY)
    assert.equal(verifiedChargeFailure(base(),seen[1][0],seen[1][1]).blockedUntil,due+4*DAY)
    await replay();assert.equal(seen.length,2)
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('failed replay remains retryable and a corrupt journal never triggers closure',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'expiry-replay-fail-')),file=path.join(root,'events.jsonl')
  try{
    fs.writeFileSync(file,JSON.stringify({body:{subscription:{id:'2854597'},payment_status:'success'},receivedAt:now,verified:true})+'\n')
    let fail=true,count=0
    const replay=createProdamusReplay({file,trustedFrom:0,isApplied:()=>false,apply:async()=>{count++;if(fail)throw Error('synthetic_failure')}})
    await assert.rejects(replay,/synthetic_failure/);fail=false;await replay();assert.equal(count,2)
    fs.appendFileSync(file,'broken\n');await assert.rejects(replay,/payment_journal_unreadable/)
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})
test('equivalent webhook objects retain one canonical replay identity',()=>{
  const a={sum:500,subscription:{profile_id:123,id:2611880},signature:'first'}
  const b={signature:'second',subscription:{id:'2611880',profile_id:'123'},sum:'500'}
  assert.equal(prodamusEventId(a),prodamusEventId(b))
})

test('a verified orderless payment already credited to the same subscriber never blocks access expiry indefinitely',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'orderless-payment-')),file=path.join(root,'journal'),j=base()
 try{
  const body={payment_status:'success',date:new Date(now).toISOString(),sum:'690',tg_user_id:j.tgUserId,subscription:{id:'2854597'}}
  fs.writeFileSync(file,JSON.stringify({verified:true,body})+'\n')
  const guard=createPendingPaymentGuard({list:()=>[j],file})
  assert.equal(await guard(j),'unprocessed_payment')
  j.payments.push({at:now,amount:690,subscriptionId:'2854597'})
  assert.equal(await guard(j),null)
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})

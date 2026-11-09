import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createExpiryBillingSync } from '../lib/subscriptionExpirySync.js'
import { createAccessExpiryWorker } from '../lib/accessExpiry.js'
import { accessUntil, hasAccess } from '../lib/subscriptionAccess.js'
import { createCommunityAdmission } from '../lib/communityAdmission.js'
const DAY=86400000, now=Date.parse('2026-11-10T12:00:00+03:00')
function expiry(extra={},membership='in'){
 let j={token:'case',paid:true,status:'active',tgUserId:'900000100',lastPaidAt:now-35*DAY,nextPaymentAt:now-5*DAY,payments:[{amount:350,estimated:true}],...extra};const calls=[]
 const patch=(_token,fields)=>j={...j,...fields}
 const reconcile=createExpiryBillingSync({get:()=>j,patch,pendingPayment:async()=>null,stop:async()=>{calls.push('STOP');return{ok:true}},notifyReview:async()=>{calls.push('REVIEW');return true},now:()=>now})
 const worker=createAccessExpiryWorker({list:()=>[j],patch,reconcile,membership:async()=>membership,remove:async()=>{calls.push('REMOVE');return true},now:()=>now})
 return{worker,calls,get:()=>j}
}
test('Diana/Olesya: known expired paid dates close access after grace even without a provider-plan ID; billing is untouched',async()=>{
 const f=expiry({billingReview:{period:now-5*DAY,state:'pending',reason:'provider_plan_unknown',holdUntil:now+DAY}}),history=structuredClone(f.get().payments)
 assert.equal(hasAccess(f.get(),now),false)
 await f.worker();assert.deepEqual(f.calls,['REMOVE']);assert.equal(f.get().status,'active');assert.deepEqual(f.get().payments,history);assert.equal(f.get().cancellation,undefined)
})
test('Ksenia: failed-charge evidence never authorizes automatic withdrawal of recurring consent',async()=>{
 const f=expiry({payments:[{amount:690,at:now-35*DAY,subscriptionId:'2854597'}],lastChargeFailure:{verified:true,periodBound:true,dueAt:now-5*DAY,subscriptionId:'2854597'}})
 await f.worker();assert.ok(!f.calls.includes('STOP'));assert.equal(f.get().cancellation,undefined)
})
test('Pankrat/Artem: already absent people are reconciled once without provider calls or verification spam',async()=>{
 const f=expiry({},'out');await f.worker();await f.worker();assert.deepEqual(f.calls,[]);assert.ok(f.get().accessClosedAt)
})
test('complimentary lifetime access and future paid dates are never removed',async()=>{
 for(const card of [{lifetime:true,complimentary:{nominalAmount:350}},{nextPaymentAt:now+DAY}]){const f=expiry(card);await f.worker();assert.deepEqual(f.calls,[])}
})
test('a signed payment pending application blocks closure without terminating billing',async()=>{
 let j={token:'pending',paid:true,status:'active',tgUserId:'900000100',nextPaymentAt:now-5*DAY},removed=false
 const reconcile=createExpiryBillingSync({get:()=>j,patch:(_t,f)=>j={...j,...f},pendingPayment:async()=> 'unprocessed_payment',notifyReview:async()=>true,stop:async()=>{throw Error('not allowed')},now:()=>now})
 assert.equal(await reconcile(j),false);assert.equal(hasAccess(j,now),true);assert.equal(removed,false)
})
function admission(){
 let cards=[],clock=now,fail=false,dmFails=true;const queue={},calls=[]
 const a=createCommunityAdmission({requests:()=>queue,saveRequest:(k,v)=>queue[k]=v,deleteRequest:k=>delete queue[k],list:()=>cards,find:id=>cards.find(c=>c.tgUserId===String(id)),bind:(t,id)=>cards.find(c=>c.token===t).tgUserId=id,membership:async()=> 'out',approve:async()=>{calls.push('APPROVE');return !fail},joined:(_u,j)=>{cards.find(c=>c.token===j.token).inChat=true},patch:(t,f)=>Object.assign(cards.find(c=>c.token===t),f),sendInvite:async()=>{calls.push('INVITE');return !dmFails},sendMail:async()=>{calls.push('MAIL');return{ok:true}},now:()=>clock})
 return{...a,queue,calls,cards,add:()=>cards.push({token:'paid',paid:true,status:'active',telegram:'https://t.me/Svetik_DI',nextPaymentAt:now+30*DAY,lastPaidAt:now,email:'synthetic@example.invalid',inviteDelivery:{key:'signed-payment',pending:true,mailPending:true}}),tick:()=>clock+=60001,setFail:v=>fail=v,setDmFails:v=>dmFails=v}
}
test('Svetik: request before payment is retained; a later verified payment approves it exactly once by canonical username',async()=>{
 const f=admission();f.remember({from:{id:900000123,username:'svetik_di'}});await f.process();assert.deepEqual(f.calls,[]);assert.equal(Object.keys(f.queue).length,1)
 f.add();await f.process();assert.equal(f.cards[0].tgUserId,'900000123');assert.equal(Object.keys(f.queue).length,0);assert.equal(f.cards[0].inChat,true);assert.equal(f.calls.filter(c=>c==='APPROVE').length,1)
 await f.process();assert.equal(f.calls.filter(c=>c==='APPROVE').length,1)
})
test('approval failure retries with backoff, while mail and invitation delivery are acknowledged independently',async()=>{
 const f=admission();f.add();f.remember({from:{id:900000123,username:'svetik_di'}});f.setFail(true);await f.process();assert.equal(Object.keys(f.queue).length,1);assert.ok(f.cards[0].inviteDelivery.pending);assert.equal(f.cards[0].inviteDelivery.mailPending,false)
 f.tick();f.setFail(false);f.setDmFails(false);await f.process();assert.equal(Object.keys(f.queue).length,0);assert.equal(f.cards[0].inviteDelivery.pending,false);assert.equal(f.calls.filter(c=>c==='MAIL').length,1)
 f.tick();await f.process();assert.equal(f.calls.filter(c=>c==='INVITE').length,2)
})

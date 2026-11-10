import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {HmacHelper} from '../lib/hmac.js'
import {recoveryRequestSignature} from '../lib/subscriptionRecovery.js'
export async function runPaymentCompletion({root,request,hook,read,check,wait,pathToFileURL}){
 const now=Date.parse('2026-11-10T12:00:00+03:00'),at=Date.parse('2026-11-08T23:13:00+03:00'),end=Date.parse('2026-12-08T23:13:00+03:00'),id='1287078598'
 await hook('',{clock:now});fs.writeFileSync(path.join(root,'telegram-ok'),'')
 fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify({[id]:{status:'member',user:{id:Number(id),username:'svetik_di'}}}))
 const joins=await import(pathToFileURL(path.join(root,'lib/store.js'))),bot=await import(pathToFileURL(path.join(root,'lib/botUsers.js')))
 bot.touchBotUser({id,first_name:'Светлана',username:'svetik_di'})
 const token=joins.createPendingJoin({tariffId:'1m',name:'Светлана',phone:'+79000000257',email:'svetik-synthetic@example.invalid',telegram:'@svetik_di'})
 joins.setTgUserId(token,id)
 joins.recordPayment(token,{amount:690,paidAt:at-31*86400000,nextPaymentAt:at,subscriptionId:'2854597',profileId:'svetik-real-profile',orderKey:'old-svetik'})
 const old=structuredClone(joins.getJoin(token))
 const payment={payment_status:'success',date:'2026-11-08 23:13:00',sum:'690',order_id:'svetik-nov8-verified',customer_phone:'+79000000257',subscription:{id:'2854597',profile_id:'svetik-real-profile',payment_num:'2',date_next_payment:'2026-12-08 23:13:00'}}
 fs.writeFileSync(path.join(root,'data/prodamus-webhooks.jsonl'),JSON.stringify({verified:true,receivedAt:at,body:{payment_status:'success',date:'2026-11-08 23:13:00',sum:'350',order_id:'unrelated-order',tg_user_id:'900000009',subscription:{id:'2660000'}}})+'\n')
 let r=await request('/api/prodamus/webhook',payment,{sign:HmacHelper.create(payment,'test-no-real-provider')});await wait(150)
 assert.equal(r.status,200)
 const invoke=async(signed=true)=>{const b={purpose:'community-subscription-recovery',issuedAt:now,nonce:'a'.repeat(24),operation:'complete_billing_audit_20261110',send:false,input:{}};return request('/api/internal/subscription-policy',b,signed?{'X-Recovery-Signature':recoveryRequestSignature(b,'test-no-real-provider')}:undefined)}
 r=await invoke(false)
 check('the complete audit requires an owner signature before any live checkout or ledger action',()=>assert.equal(r.status,403))
 r=await invoke()
 check('the accepted 8 November 23:13 payment is matched to the current Telegram account and ledger',()=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.svetik.amount,690);assert.equal(r.body.svetik.verifiedPaymentAt,at);assert.equal(r.body.svetik.paidUntil,end);assert.equal(r.body.svetik.replayed,false)})
 check('the actual public subscription endpoint creates the payment URL and removes its unpaid probe',()=>{assert.equal(r.body.website.ok,true);assert.equal(r.body.website.paymentPageHost,'legalcareerist.payform.ru');assert.equal(r.body.website.realChargePerformed,false);assert.equal(r.body.website.unpaidProbeRemoved,true);assert.ok(!joins.listJoins().some(j=>String(j.email).startsWith('bot-audit-')))})
 check('verification does not duplicate existing payments or erase the original charge',()=>{const j=joins.getJoin(token);assert.equal(j.payments.length,2);assert.deepEqual(j.payments[0],old.payments[0]);assert.equal(j.inChat,true)})
 r=await invoke();check('repeated completion is idempotent for all real payments',()=>{assert.equal(r.status,200);assert.equal(joins.getJoin(token).payments.length,2)})
 joins.patchJoin(token,{payments:old.payments,lastPaidAt:old.lastPaidAt,nextPaymentAt:old.nextPaymentAt})
 r=await invoke()
 check('an accepted event missing from the ledger is reapplied safely even if its old application marker exists',()=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.svetik.replayed,true);assert.equal(joins.getJoin(token).payments.length,2);assert.deepEqual(joins.getJoin(token).payments[0],old.payments[0])})
 r=await invoke();check('the repaired charge cannot be credited twice',()=>{assert.equal(r.status,200);assert.equal(r.body.svetik.replayed,false);assert.equal(joins.getJoin(token).payments.length,2)})
 fs.renameSync(path.join(root,'data/prodamus-webhooks.jsonl'),path.join(root,'journal.saved'))
 r=await invoke();check('missing original payment evidence cannot yield a false completed result',()=>{assert.equal(r.status,503);assert.equal(r.body.error,'svetik_verified_payment_not_found');assert.equal(joins.getJoin(token).payments.length,2)})
 const stops=path.join(root,'prodamus-stop-requests.jsonl')
 check('the final check never stops or activates a recurring agreement',()=>assert.ok(!fs.existsSync(stops)||!fs.readFileSync(stops,'utf8').trim()))
}

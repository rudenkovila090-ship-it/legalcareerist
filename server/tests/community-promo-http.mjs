import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {HmacHelper} from '../lib/hmac.js'
import {communityPromoKey} from '../lib/communityPromo.js'
export async function runCommunityPromo({root,request,read,check,wait}) {
  fs.writeFileSync(path.join(root,'data/community-promo-rules.json'),JSON.stringify({version:1,rules:{[communityPromoKey('SYNTHETIC350')]:{active:true,tariffId:'1m',baseSubscriptionId:'2854597',subscriptionId:'2611878',amount:350}}}))
  const form={tariffId:'1m',name:'Synthetic Promo',phone:'+79000000880',email:'promo@example.invalid',telegram:'@synthetic_promo',consent:{policy:true,processing:true,marketing:false}}
  const entries=()=>fs.existsSync(path.join(root,'checkout-requests.jsonl'))?fs.readFileSync(path.join(root,'checkout-requests.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[]
  let response=await request('/api/community/subscribe',{...form,promoCode:'  synthetic350  '})
  check('community checkout accepts and returns the normalized code',()=>{assert.equal(response.status,200);assert.equal(response.body.promoCode,'SYNTHETIC350');assert.ok(response.body.url.includes('SYNTHETIC_CHECKOUT'))})
  let card=Object.values(read('pending-joins.json')).find(j=>j.email===form.email)
  check('the code is persisted without marking checkout as payment',()=>{assert.equal(card.promoCode,'SYNTHETIC350');assert.equal(card.paid,false);assert.equal(card.payments,undefined)})
  const checkout=entries().at(-1)
  check('the provider receives the approved recurring 350 plan and a signed code',()=>{assert.ok(checkout.customer_extra.endsWith(' | KY_PROMO:SYNTHETIC350'));assert.equal(checkout.subscription,'2611878');assert.equal(card.checkoutQuote.amount,350);assert.equal(HmacHelper.verify(checkout,'test-no-real-provider',checkout.signature),true)})
  const count=Object.keys(read('pending-joins.json')).length,before=entries().length
  response=await request('/api/community/subscribe',{...form,promoCode:'BAD|CODE'})
  check('malformed code is rejected before creating a card or calling the provider',()=>{assert.equal(response.status,400);assert.equal(response.body.error,'invalid_promo_code');assert.equal(Object.keys(read('pending-joins.json')).length,count);assert.equal(entries().length,before)})
  response=await request('/api/community/subscribe',{...form,promoCode:{code:'REF'}})
  check('an object cannot replace the code string',()=>assert.equal(response.status,400))
  response=await request('/api/community/subscribe',{...form,email:'no-code@example.invalid',promoCode:''})
  check('checkout without a code still works',()=>{assert.equal(response.status,200);assert.ok(!entries().at(-1).customer_extra.includes('KY_PROMO:'))})
  response=await request('/api/community/promo',{tariffId:'1m',promoCode:'synthetic350',amount:1})
  check('preview confirms the same 350 monthly plan as payment generation',()=>{assert.equal(response.status,200);assert.equal(response.body.amount,350);assert.equal(response.body.months,1);assert.equal(response.body.subscriptionId,'2611878')})
  const invoices=entries().length
  response=await request('/api/community/subscribe',{...form,promoCode:'UNKNOWN_CODE'})
  check('unknown codes never silently charge the normal price',()=>{assert.equal(response.status,400);assert.equal(response.body.error,'promo_not_available');assert.equal(entries().length,invoices)})
  response=await request('/api/community/subscribe',{...form,tariffId:'3m',promoCode:'SYNTHETIC350'})
  check('the monthly code cannot reprice a three-month subscription',()=>{assert.equal(response.status,400);assert.equal(entries().length,invoices)})
  // Recover attribution even if the payer edited every contact at checkout.
  const at=Date.now(),body={payment_status:'success',date:new Date(at).toISOString(),sum:'350',order_id:'synthetic-promo-paid',customer_phone:'+79000000881',customer_email:'changed@example.invalid',customer_extra:'Подписка на месяц | Changed | @changed_person | KY_PROMO:SYNTHETIC350',tg_user_id:'900000881',subscription:{id:'2611878',profile_id:'synthetic-promo-profile',payment_num:'1',date_next_payment:new Date(at+30*86400000).toISOString()}}
  response=await request('/api/prodamus/webhook',body,{sign:HmacHelper.create(body,'test-no-real-provider')});await wait(200)
  card=Object.values(read('pending-joins.json')).find(j=>(j.payments||[]).some(p=>p.orderKey===body.order_id))
  check('a signed paid event preserves the code on a recovered orphan card',()=>{assert.equal(response.status,200);assert.equal(card.promoCode,'SYNTHETIC350');assert.equal(card.payments.length,1)})
  await request('/api/prodamus/webhook',body,{sign:HmacHelper.create(body,'test-no-real-provider')});await wait(100)
  check('duplicate paid events do not duplicate money',()=>assert.equal(Object.values(read('pending-joins.json')).find(j=>(j.payments||[]).some(p=>p.orderKey===body.order_id)).payments.length,1))
  const renewal={...body,order_id:'synthetic-promo-renewal',date:new Date(at+30*86400000).toISOString(),subscription:{...body.subscription,payment_num:'2',date_next_payment:new Date(at+60*86400000).toISOString()}}
  await request('/api/prodamus/webhook',renewal,{sign:HmacHelper.create(renewal,'test-no-real-provider')});await wait(150)
  card=Object.values(read('pending-joins.json')).find(j=>(j.payments||[]).some(p=>p.orderKey===renewal.order_id))
  check('a confirmed renewal retains the same 350 amount and original price lock',()=>{assert.equal(card.payments.length,2);assert.ok(card.payments.every(p=>p.amount===350&&String(p.subscriptionId)==='2611878'));assert.equal(card.priceLock.amount,350)})
  for(const [tariffId,plan] of [['1m','2854597'],['3m','3005286'],['6m','3005289']]) {
    response=await request('/api/community/subscribe',{...form,tariffId,promoCode:'',price:1,subscription:'fake'})
    check('public '+tariffId+' checkout preserves its normal server-selected provider plan',()=>{assert.equal(response.status,200);assert.equal(entries().at(-1).subscription,plan)})
  }
  response=await request('/api/community/subscribe',{...form,tariffId:'toString'})
  check('unknown and inherited-object tariff keys remain unavailable',()=>assert.equal(response.status,400))
}

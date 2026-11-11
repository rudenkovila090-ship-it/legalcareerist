import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {HmacHelper} from '../lib/hmac.js'
export async function runCommunityPromo({root,request,read,check,wait}) {
  const form={tariffId:'1m',name:'Synthetic Promo',phone:'+79000000880',email:'promo@example.invalid',telegram:'@synthetic_promo',consent:{policy:true,processing:true,marketing:false}}
  const entries=()=>fs.existsSync(path.join(root,'checkout-requests.jsonl'))?fs.readFileSync(path.join(root,'checkout-requests.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[]
  let response=await request('/api/community/subscribe',{...form,promoCode:'  ref_code  '})
  check('community checkout accepts and returns the normalized code',()=>{assert.equal(response.status,200);assert.equal(response.body.promoCode,'REF_CODE');assert.ok(response.body.url.includes('SYNTHETIC_CHECKOUT'))})
  let card=Object.values(read('pending-joins.json')).find(j=>j.email===form.email)
  check('the code is persisted without marking checkout as payment',()=>{assert.equal(card.promoCode,'REF_CODE');assert.equal(card.paid,false);assert.equal(card.payments,undefined)})
  const checkout=entries().at(-1)
  check('the provider receives the code inside verified signed metadata, without a changed recurring plan',()=>{assert.ok(checkout.customer_extra.endsWith(' | KY_PROMO:REF_CODE'));assert.equal(checkout.subscription,'2854597');assert.equal(HmacHelper.verify(checkout,'test-no-real-provider',checkout.signature),true)})
  const count=Object.keys(read('pending-joins.json')).length,before=entries().length
  response=await request('/api/community/subscribe',{...form,promoCode:'BAD|CODE'})
  check('malformed code is rejected before creating a card or calling the provider',()=>{assert.equal(response.status,400);assert.equal(response.body.error,'invalid_promo_code');assert.equal(Object.keys(read('pending-joins.json')).length,count);assert.equal(entries().length,before)})
  response=await request('/api/community/subscribe',{...form,promoCode:{code:'REF'}})
  check('an object cannot replace the code string',()=>assert.equal(response.status,400))
  response=await request('/api/community/subscribe',{...form,email:'no-code@example.invalid',promoCode:''})
  check('checkout without a code still works',()=>{assert.equal(response.status,200);assert.ok(!entries().at(-1).customer_extra.includes('KY_PROMO:'))})
  // Recover attribution even if the payer edited every contact at checkout.
  const at=Date.now(),body={payment_status:'success',date:new Date(at).toISOString(),sum:'690',order_id:'synthetic-promo-paid',customer_phone:'+79000000881',customer_email:'changed@example.invalid',customer_extra:'Подписка на месяц | Changed | @changed_person | KY_PROMO:REF_CODE',tg_user_id:'900000881',subscription:{id:'2854597',profile_id:'synthetic-promo-profile',payment_num:'1',date_next_payment:new Date(at+30*86400000).toISOString()}}
  response=await request('/api/prodamus/webhook',body,{sign:HmacHelper.create(body,'test-no-real-provider')});await wait(200)
  card=Object.values(read('pending-joins.json')).find(j=>(j.payments||[]).some(p=>p.orderKey===body.order_id))
  check('a signed paid event preserves the code on a recovered orphan card',()=>{assert.equal(response.status,200);assert.equal(card.promoCode,'REF_CODE');assert.equal(card.payments.length,1)})
  await request('/api/prodamus/webhook',body,{sign:HmacHelper.create(body,'test-no-real-provider')});await wait(100)
  check('duplicate paid events do not duplicate money',()=>assert.equal(Object.values(read('pending-joins.json')).find(j=>(j.payments||[]).some(p=>p.orderKey===body.order_id)).payments.length,1))
}

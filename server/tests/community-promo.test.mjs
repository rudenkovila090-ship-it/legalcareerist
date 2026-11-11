import {test} from 'node:test'
import assert from 'node:assert/strict'
import {communityCheckoutQuote,communityPromoKey} from '../lib/communityPromo.js'
const basePlan={subscription:2854597,price:690,months:1}
const rule={active:true,tariffId:'1m',baseSubscriptionId:'2854597',subscriptionId:'2611878',amount:350}
const rules=extra=>({[communityPromoKey('SYNTHETIC350')]:{...rule,...extra}})
test('an approved monthly code selects the existing recurring 350 plan, not a cosmetic first-payment discount',()=>{
 const q=communityCheckoutQuote({tariffId:'1m',promoCode:' synthetic350 ',basePlan},rules())
 assert.equal(q.amount,350);assert.equal(q.months,1);assert.equal(q.subscriptionId,'2611878');assert.equal(q.applied,true)
})
test('all standard prices and plans remain unchanged without a code',()=>{
 for(const [tariffId,subscription,price,months]of [['1m',2854597,690,1],['3m',3005286,1770,3],['6m',3005289,3180,6]]){
  const q=communityCheckoutQuote({tariffId,promoCode:'',basePlan:{subscription,price,months}},{});assert.equal(q.amount,price);assert.equal(q.months,months);assert.equal(q.subscriptionId,String(subscription));assert.equal(q.applied,false)
 }
})
test('unknown, inactive and wrong-tariff codes fail instead of charging the normal price',()=>{
 const input={tariffId:'1m',promoCode:'SYNTHETIC350',basePlan}
 assert.throws(()=>communityCheckoutQuote(input,{}),/promo_not_available/)
 assert.throws(()=>communityCheckoutQuote(input,rules({active:false})),/promo_not_available/)
 assert.throws(()=>communityCheckoutQuote({...input,tariffId:'3m',basePlan:{subscription:3005286,price:1770,months:3}},rules()),/promo_not_available/)
})
test('a fake configured amount cannot claim 350 while linking to a 690 plan',()=>{
 assert.throws(()=>communityCheckoutQuote({tariffId:'1m',promoCode:'SYNTHETIC350',basePlan},rules({subscriptionId:'2854597'})),/promo_configuration_unavailable/)
})

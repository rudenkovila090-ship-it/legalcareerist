import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {HISTORICAL_PLANS} from './subscriptionPricing.js'

export const communityPromoKey = code => crypto.createHash('sha256').update(normalizeCommunityPromo(code)).digest('hex')
export function communityCheckoutQuote({tariffId, promoCode, basePlan}, rules) {
  const code=normalizeCommunityPromo(promoCode)
  if(!basePlan)throw Error('tariff_not_available')
  const normal={applied:false,code:'',amount:basePlan.price,months:basePlan.months,subscriptionId:String(basePlan.subscription)}
  if(!code)return normal
  if(rules===undefined){
    try{const config=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'../data/community-promo-rules.json'),'utf8'));if(config.version!==1||!config.rules||Array.isArray(config.rules))throw Error('invalid');rules=config.rules}
    catch(e){if(e.code==='ENOENT')rules={};else throw Error('promo_configuration_unavailable')}
  }
  const rule=rules[communityPromoKey(code)],plan=rule&&HISTORICAL_PLANS[String(rule.subscriptionId)]
  if(!rule||rule.active!==true||rule.tariffId!==tariffId||String(rule.baseSubscriptionId)!==normal.subscriptionId)throw Error('promo_not_available')
  if(!plan||plan.price!==rule.amount||plan.months!==basePlan.months||rule.amount>=basePlan.price)throw Error('promo_configuration_unavailable')
  return {applied:true,code,amount:plan.price,months:plan.months,subscriptionId:String(rule.subscriptionId)}
}
export function normalizeCommunityPromo(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string' || value.length > 128) throw Error('invalid_promo_code')
  const code = value.trim().toUpperCase().replace(/\s+/g, '')
  if (!code) return ''
  if (!/^[A-ZА-ЯЁ0-9_-]{3,32}$/.test(code)) throw Error('invalid_promo_code')
  return code
}

export function communityPromoFromExtra(extra) {
  const marker = String(extra || '').split(' | ').find(part => part.startsWith('KY_PROMO:'))
  if (!marker) return ''
  try { return normalizeCommunityPromo(marker.slice('KY_PROMO:'.length)) } catch { return '' }
}

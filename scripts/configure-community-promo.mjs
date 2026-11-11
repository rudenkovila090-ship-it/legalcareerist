import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {normalizeCommunityPromo,communityPromoKey,communityCheckoutQuote} from '../server/lib/communityPromo.js'
import {HISTORICAL_PLANS} from '../server/lib/subscriptionPricing.js'
process.umask(0o077)
const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]}
const root=opt('--runtime'),code=normalizeCommunityPromo(opt('--code')),amount=Number(opt('--amount'))
if(!root||!code||!Number.isFinite(amount))throw Error('Required: --runtime /actual/server --code CODE --amount RUB')
if(!fs.existsSync(path.join(root,'data')))throw Error('Existing runtime data directory is required')
const candidates=Object.entries(HISTORICAL_PLANS).filter(([,p])=>p.months===1&&p.price===amount)
if(candidates.length!==1||amount>=690)throw Error('No unique approved monthly provider plan for that price')
const file=path.join(root,'data/community-promo-rules.json')
let previous=null,config={version:1,rules:{}}
try{previous=fs.readFileSync(file,'utf8');config=JSON.parse(previous)}catch(e){if(e.code!=='ENOENT')throw e}
if(config.version!==1||!config.rules||typeof config.rules!=='object'||Array.isArray(config.rules))throw Error('Unknown promo configuration; no overwrite')
const key=communityPromoKey(code),rule={...config.rules[key],active:true,tariffId:'1m',baseSubscriptionId:'2854597',subscriptionId:candidates[0][0],amount,months:1,source:'owner_confirmed_promo',createdAt:config.rules[key]?.createdAt||Date.now()}
const next={...config,rules:{...config.rules,[key]:rule}}
const quote=communityCheckoutQuote({tariffId:'1m',promoCode:code,basePlan:{subscription:2854597,price:690,months:1}},next.rules)
if(quote.amount!==amount||quote.months!==1)throw Error('Quote mismatch; no write')
if(previous&&JSON.stringify(config)===JSON.stringify(next)){console.log('PROMO_RULE_UNCHANGED: '+amount+' ₽ каждый месяц');process.exit(0)}
const base=opt('--backup-root')||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});const backup=fs.mkdtempSync(path.join(base,'promo-rule-'))
if(previous!==null)fs.writeFileSync(path.join(backup,'community-promo-rules.before.json'),previous,{mode:0o600})
const temp=file+'.writing-'+crypto.randomBytes(6).toString('hex')
try{fs.writeFileSync(temp,JSON.stringify(next,null,2),{mode:0o600,flag:'wx'});fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}
console.log('PROMO_RULE_CONFIGURED: '+amount+' ₽ каждый месяц; существующий план '+quote.subscriptionId+'; действующие подписки не изменены.')

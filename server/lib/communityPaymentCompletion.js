import crypto from 'node:crypto'
import {normalizeCommunityUsername as nick} from './communityInvite.js'
import {hasAccess,paidUntil} from './subscriptionAccess.js'
const TARGET='1287078598',USERNAME='svetik_di',WHEN=Date.parse('2026-11-08T23:13:00+03:00'),WINDOW=15*60000
const time=v=>{const s=String(v||'');return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)?s.replace(' ','T')+'+03:00':s)}
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7')
const mail=v=>String(v||'').trim().toLowerCase()
const order=b=>String(b.order_id||'')||(b.subscription?.profile_id&&b.subscription?.payment_num?`sub:${b.subscription.id}:${b.subscription.profile_id}:${b.subscription.payment_num}`:'')
const amount=b=>Number(b.sum??b.subscription?.cost)
const ref=v=>crypto.createHash('sha256').update(String(v)).digest('hex').slice(0,12)
const inside=m=>['member','administrator','creator'].includes(m?.status)||(m?.status==='restricted'&&m.is_member===true)

export async function completeSvetikPayment({list,events,member,apply,bind,patch,sync,expectedEnd,trustedFrom=0,now=Date.now}){
 const m=await member(TARGET)
 if(!inside(m)&&!['left','kicked'].includes(m?.status))throw Error('svetik_membership_unconfirmed')
 const primary=list().filter(j=>String(j.tgUserId||'')===TARGET||(!j.tgUserId&&nick(j.telegram)===USERNAME))
 const identities=b=>{
  if(b.tg_user_id&&String(b.tg_user_id)!==TARGET)return false
  const extra=String(b.customer_extra||'').split(' | ')[2]
  return String(b.tg_user_id||'')===TARGET||nick(extra)===USERNAME||primary.some(j=>
   (b.subscription?.profile_id&&String(b.subscription.profile_id)===String(j.prodamusProfileId||''))||
   (phone(b.customer_phone||b.phone)&&phone(b.customer_phone||b.phone)===phone(j.phone))||
   (mail(b.customer_email)&&mail(b.customer_email)===mail(j.email))||
   (order(b)&&(j.payments||[]).some(p=>p.orderKey===order(b))))
 }
 const candidates=events().filter(r=>(r.verified===true||(trustedFrom>0&&r.receivedAt>=trustedFrom))&&r.body?.payment_status==='success'&&r.body.subscription&&Number.isFinite(time(r.body.date))&&Math.abs(time(r.body.date)-WHEN)<=WINDOW&&amount(r.body)>0&&identities(r.body))
 const unique=[...new Map(candidates.map(r=>[order(r.body)||JSON.stringify([time(r.body.date),amount(r.body),r.body.subscription.id,r.body.tg_user_id,r.body.customer_phone]),r])).values()]
 if(unique.length!==1)throw Error(unique.length?'svetik_multiple_payments_require_review':'svetik_verified_payment_not_found')
 const record=unique[0],b=record.body,key=order(b),at=time(b.date),sum=amount(b),plan=String(b.subscription.id)
 const matches=j=>(j.payments||[]).filter(p=>!p.estimated&&((key&&p.orderKey===key)||(!key&&Number(p.at)===at&&Number(p.amount)===sum&&String(p.subscriptionId||'')===plan)))
 let owners=list().filter(j=>matches(j).length)
 if(owners.some(j=>j.tgUserId&&String(j.tgUserId)!==TARGET))throw Error('svetik_payment_identity_conflict')
 if(owners.length>1)throw Error('svetik_payment_duplicated_in_ledger')
 let replayed=false
 if(!owners.length){
  if(!key)throw Error('svetik_orderless_payment_requires_review')
  await apply(record)
  replayed=true;owners=list().filter(j=>matches(j).length)
 }
 if(owners.length!==1)throw Error('svetik_payment_not_recorded')
 let join=owners[0],payments=matches(join)
 if(payments.length!==1||Number(payments[0].amount)!==sum||Number(payments[0].at)!==at||String(payments[0].subscriptionId||'')!==plan)throw Error('svetik_payment_ledger_mismatch')
 if(join.tgUserId&&String(join.tgUserId)!==TARGET)throw Error('svetik_payment_identity_conflict')
 if(!join.tgUserId)bind(join.token,TARGET)
 let repairedPeriod=false
 if(!(paidUntil(join)>at)&&Number(join.lastPaidAt)<=at){
  const end=expectedEnd(b,at)
  if(!(end>at))throw Error('svetik_paid_period_unknown')
  patch(join.token,{nextPaymentAt:end,nextPaymentSource:'verified_payment_reconciliation'});repairedPeriod=true
 }
 join=list().find(j=>j.token===join.token)
 if(!hasAccess(join,now()))throw Error('svetik_paid_access_not_active')
 patch(join.token,{inChat:inside(m),membershipVerifiedAt:now(),...(inside(m)&&join.inviteDelivery?{inviteDelivery:{...join.inviteDelivery,pending:false}}:!inside(m)&&!join.inviteDelivery?{inviteDelivery:{key:'verified-payment-'+ref(key||at),pending:true,mailPending:false,createdAt:now()}}:{})})
 sync(list().find(j=>j.token===join.token),TARGET)
 return {ok:true,telegramId:TARGET,verifiedPaymentAt:at,amount:sum,subscriptionId:plan,orderRef:ref(key||at),paidUntil:paidUntil(join),inChat:inside(m),replayed,repairedPeriod,financialHistoryReplaced:false}
}

// Exercise the public form route, then remove ONLY its unique, still-unpaid probe.
export async function completeWebsiteCheckout({post,list,remove,cancel,siteUrl,now=Date.now}){
 const id=crypto.randomBytes(10).toString('hex'),email='bot-audit-'+id+'@example.invalid'
 const payload={tariffId:'1m',name:'Техническая проверка оплаты '+id,phone:'+70000000000',email,telegram:'@lc_audit_'+id,howHeard:'operator_billing_audit',consent:{policy:true,processing:true,marketing:false}}
 let result
 try{
  const r=await post(siteUrl.replace(/\/$/,'')+'/api/community/subscribe',payload)
  if(!r.ok||!r.body?.ok||!r.body?.url)throw Error('website_checkout_not_created')
  const u=new URL(r.body.url)
  if(u.protocol!=='https:'||!(u.hostname==='payform.ru'||u.hostname.endsWith('.payform.ru')))throw Error('website_checkout_destination_invalid')
  result={ok:true,paymentPageHost:u.hostname,checkoutCreatedAt:now(),realChargePerformed:false}
 }finally{
  cancel({kind:'join',email,telegram:payload.telegram})
  for(const j of list().filter(j=>mail(j.email)===email&&j.name===payload.name)){
   if(j.paid||(j.payments||[]).some(p=>Number(p.amount)>0)||j.tgUserId)throw Error('website_probe_became_paid_preserved')
   if(j.status!=='pending')throw Error('website_probe_state_changed_preserved')
   remove(j.token)
  }
 }
 if(list().some(j=>mail(j.email)===email))throw Error('website_probe_cleanup_unconfirmed')
 return {...result,unpaidProbeRemoved:true}
}

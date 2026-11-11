import fs from 'node:fs'
import {normalizeCommunityUsername as nick} from './communityInvite.js'
import {paidUntil,hasAccess,accessUntil} from './subscriptionAccess.js'
import {protectedByOtherCard} from './accessExpiry.js'
import {PERMANENT_MEMBER_IDS} from './subscriptionAutomationPolicy.js'
const time=v=>{const s=String(v||'');return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)?s.replace(' ','T')+'+03:00':s)}
export const paymentOrder=b=>String(b.order_id||'')||(b.subscription?.profile_id&&b.subscription?.payment_num?`sub:${b.subscription.id}:${b.subscription.profile_id}:${b.subscription.payment_num}`:'')
const amount=b=>Number(b.sum??b.subscription?.cost)
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7')
const mail=v=>String(v||'').trim().toLowerCase()
export function acceptedPayments(file,trustedFrom=0){
 let text
 try{text=fs.readFileSync(file,'utf8')}catch(e){if(e.code==='ENOENT')return[];throw Error('payment_journal_unreadable')}
 try{return text.split('\n').filter(l=>l.trim()).map(l=>JSON.parse(l)).filter(r=>(r.verified===true||(trustedFrom>0&&r.receivedAt>=trustedFrom))&&r.body?.payment_status==='success'&&r.body.subscription&&amount(r.body)>0&&Number.isFinite(time(r.body.date)))}catch{throw Error('payment_journal_unreadable')}
}
function belongs(b,j){
 if(b.tg_user_id&&j.tgUserId&&String(b.tg_user_id)!==String(j.tgUserId))return false
 return Boolean((j.payments||[]).some(p=>rowMatches(b,p))||(b.tg_user_id&&String(b.tg_user_id)===String(j.tgUserId||''))||(b.subscription?.profile_id&&String(b.subscription.profile_id)===String(j.prodamusProfileId||''))||(phone(b.customer_phone||b.phone)&&phone(b.customer_phone||b.phone)===phone(j.phone))||(mail(b.customer_email)&&mail(b.customer_email)===mail(j.email))||(nick(String(b.customer_extra||'').split(' | ')[2])&&nick(String(b.customer_extra||'').split(' | ')[2])===nick(j.telegram)))
}
function rowMatches(b,p){const k=paymentOrder(b);return !p.estimated&&Number(p.at)===time(b.date)&&Number(p.amount)===amount(b)&&String(p.subscriptionId||'')===String(b.subscription.id)&&(k?p.orderKey===k:!p.orderKey)}
export function removalProblem(join,joins,records,now=Date.now()){
 if(!join?.tgUserId)return'telegram_id_unknown'
 if(PERMANENT_MEMBER_IDS.includes(String(join.tgUserId))||join.lifetime||join.ownerAccess?.active)return'owner_protected'
 if(hasAccess(join,now)||protectedByOtherCard(join,joins,now))return'active_access'
 const due=paidUntil(join)
 if(!due)return'paid_date_unknown'
 const voluntary=join.status==='cancelled'&&join.cancellation?.confirmed&&['bot','website','prodamus'].includes(join.cancellation.source)
 if(now<Math.max(accessUntil(join)||0,due+(voluntary?0:4*86400000)))return'grace_not_finished'
 const related=records.filter(r=>belongs(r.body,join))
 for(const r of related){
  const key=paymentOrder(r.body)
  if(time(r.body.date)<Number(join.lastPaidAt||0))continue
  const owners=joins.filter(j=>(j.payments||[]).some(p=>rowMatches(r.body,p)))
  if(!owners.length)return'unprocessed_payment'
  if(owners.length>1)return'payment_identity_conflict'
  if(owners.some(j=>j.tgUserId&&String(j.tgUserId)!==String(join.tgUserId)))return'payment_identity_conflict'
  if(key&&joins.some(j=>(j.payments||[]).some(p=>p.orderKey===key&&!rowMatches(r.body,p))))return'payment_ledger_conflict'
 }
 const latest=(join.payments||[]).filter(p=>!p.estimated&&Number(p.at)===Number(join.lastPaidAt)&&Number(p.amount)>0)
 if(!latest.some(p=>related.some(r=>rowMatches(r.body,p))))return'paid_period_unverified'
 return null
}

export function createAutomationReconciliation({list,records,apply,patch,expectedEnd,bind,sync,processing=()=>false,now=Date.now}){
 let running=false
 return async()=>{
  if(running||processing())return{ok:false,reason:'payment_processing'}
  running=true
  try{
   const events=records().sort((a,b)=>time(a.body.date)-time(b.body.date));let replayed=0,repairedPeriods=0,retiredGrants=0
   for(const r of events){
    if(processing())return{ok:false,reason:'payment_processing'}
    const key=paymentOrder(r.body)
    let owners=list().filter(j=>(j.payments||[]).some(p=>rowMatches(r.body,p)))
    if(key&&list().some(j=>(j.payments||[]).some(p=>p.orderKey===key&&!rowMatches(r.body,p))))return{ok:false,reason:'payment_ledger_conflict'}
    if(!owners.length&&key){await apply(r);replayed++;owners=list().filter(j=>(j.payments||[]).some(p=>rowMatches(r.body,p)));if(owners.length!==1)return{ok:false,reason:'payment_replay_unconfirmed'}}
    if(owners.length>1)return{ok:false,reason:'payment_identity_conflict'}
    const join=owners[0];if(!join)continue
    if(join.tgUserId&&r.body.tg_user_id&&String(join.tgUserId)!==String(r.body.tg_user_id))return{ok:false,reason:'payment_identity_conflict'}
    // An owner-confirmed payer's temporary admission must not become a permanent free membership.
    const grants=list().filter(g=>g.ownerAccess?.active&&
      (g.ownerAccess.reason==='owner_confirmed_payment'||(g.ownerAccess.source==='owner_roster_20261111'&&!['free','ambassador'].includes(g.ownerAccess.kind)&&!PERMANENT_MEMBER_IDS.includes(String(g.tgUserId))))&&
      ((g.tgUserId&&String(g.tgUserId)===String(join.tgUserId||''))||(!join.tgUserId&&nick(g.telegram)&&nick(g.telegram)===nick(join.telegram))))
    if(!join.tgUserId){const ids=[...new Set(grants.map(g=>g.tgUserId).filter(Boolean).map(String))];if(ids.length>1)return{ok:false,reason:'payment_identity_conflict'};if(ids.length===1){bind(join.token,ids[0]);join.tgUserId=ids[0]}}
    if(time(r.body.date)===Number(join.lastPaidAt)){
     const end=expectedEnd(r.body,time(r.body.date))
     if(end>time(r.body.date)&&!(paidUntil(join)>=end)){patch(join.token,{nextPaymentAt:end,nextPaymentSource:'verified_automation_reconciliation'});repairedPeriods++}
     const fresh=list().find(j=>j.token===join.token)
     if(hasAccess(fresh,now()))for(const g of grants){patch(g.token,{ownerAccess:{...g.ownerAccess,active:false,paymentVerificationPending:false,fulfilledAt:now(),paidCardRef:join.token}});retiredGrants++}
     if(fresh?.tgUserId&&hasAccess(fresh,now())&&fresh.automationSyncedFor!==fresh.lastPaidAt){sync?.(fresh,fresh.tgUserId);patch(fresh.token,{automationSyncedFor:fresh.lastPaidAt})}
    }
   }
   return{ok:true,replayed,repairedPeriods,retiredGrants}
  }catch(e){return{ok:false,reason:/^[a-z_]+$/.test(e.message)?e.message:'payment_reconciliation_unavailable'}}finally{running=false}
 }
}

export function createClosureDelivery({list,patch,send,now=Date.now}){
 let running=false
 return async()=>{
  if(running)return
  running=true
  try{for(const j of list()){
   const n=j.accessClosureNotice;if(!n||n.done||n.retryAt>now())continue
   if(hasAccess(j,now())||protectedByOtherCard(j,list(),now())||n.period!==paidUntil(j)){patch(j.token,{accessClosureNotice:{...n,done:true,supersededAt:now()}});continue}
   let result={};try{result=await send(j,n,{bot:!n.botDone,admin:!n.adminDone})}catch{}
   const fresh=list().find(c=>c.token===j.token);if(!fresh||fresh.accessClosureNotice?.period!==n.period)continue
   const next={...fresh.accessClosureNotice,botDone:n.botDone||result.bot===true,adminDone:n.adminDone||result.admin===true,retryAt:now()+60000}
   patch(j.token,{accessClosureNotice:{...next,done:next.botDone&&next.adminDone}})
  }}finally{running=false}
 }
}

export function createFailureDelivery({list,patch,send,now=Date.now}){
 let running=false
 return async()=>{
  if(running)return
  running=true
  try{for(const j of list()){
   const n=j.chargeFailureDelivery;if(!n||n.done||n.retryAt>now())continue
   if(n.period!==paidUntil(j)||Number(j.lastPaidAt)>Number(n.failedAt)||j.accessClosedFor===n.period){patch(j.token,{chargeFailureDelivery:{...n,done:true,supersededAt:now()}});continue}
   const channels={bot:!n.botDone&&Boolean(j.tgUserId),mail:!n.mailDone&&Boolean(j.email),admin:!n.adminDone,last:n.last&&!n.lastDone}
   let result={};try{result=await send(j,n,channels)}catch{}
   const fresh=list().find(c=>c.token===j.token);if(!fresh||fresh.chargeFailureDelivery?.period!==n.period)continue
   const next={...fresh.chargeFailureDelivery,botDone:n.botDone||result.bot===true||!j.tgUserId,mailDone:n.mailDone||result.mail===true||!j.email,adminDone:n.adminDone||result.admin===true,lastDone:n.lastDone||result.last===true,retryAt:now()+60000}
   patch(j.token,{chargeFailureDelivery:{...next,done:next.botDone&&next.mailDone&&next.adminDone&&(!next.last||next.lastDone)},...(next.botDone||next.mailDone?{chargeFailedNoticeFor:n.period}:{}),...(next.lastDone?{chargeLastAttemptFor:n.period}:{})})
  }}finally{running=false}
 }
}

import {normalizeCommunityUsername as nick} from './communityInvite.js'
import {hasAccess,paidUntil,accessUntil} from './subscriptionAccess.js'
import {removalProblem,paymentOrder} from './subscriptionAutomation.js'
import {HmacHelper} from './hmac.js'
const inside=m=>['member','administrator','creator'].includes(m?.status)||(m?.status==='restricted'&&m.is_member===true)
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7')
const mail=v=>String(v||'').trim().toLowerCase()
const date=v=>{const s=String(v||'');return Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)?s.replace(' ','T')+'+03:00':s)}
export const completionTargets=[
 {id:'376201355',username:'ognevushaa',name:'Анастасия Шемонаева'},
 {id:'1955667679',username:'mulanka_7',name:'Диана Плиева'},
 {username:'civillaw_civile',name:'Кристина Брехова'},
 {username:'vmashik',name:'Мария Лапшина'},
]
export async function inspectAutomationPlan({list,records,membership,now=Date.now}){
 const plan=[],historical=[],states=new Map(),all=list()
 for(const j of all.filter(j=>j.paid&&j.tgUserId&&!j.lifetime&&paidUntil(j)&&paidUntil(j)<=now())){
  const id=String(j.tgUserId),problem=removalProblem(j,all,records,now())
  if(['owner_protected','active_access'].includes(problem)){plan.push({telegramId:id,name:j.name,paidUntil:paidUntil(j),accessUntil:accessUntil(j),reason:problem});continue}
  if(!states.has(id))states.set(id,await membership(id))
  const state=states.get(id),row={telegramId:id,name:j.name,paidUntil:paidUntil(j),accessUntil:accessUntil(j),membership:state}
  if(state==='out'){historical.push({...row,reason:'already_absent'});continue}
  const reason=state==='unknown'?'membership_unknown':state==='admin'?'chat_administrator':problem||'eligible_after_membership_check'
  plan.push({...row,reason})
 }
 return{plan,historical,unverifiedCards:new Set(plan.filter(c=>!['eligible_after_membership_check','owner_protected','active_access','grace_not_finished','chat_administrator'].includes(c.reason)).map(c=>c.telegramId)).size}
}
function identity(body,target,cards){
 if(body.tg_user_id&&target.id&&String(body.tg_user_id)!==target.id)return false
 return Boolean(target.id&&String(body.tg_user_id||'')===target.id)||nick(String(body.customer_extra||'').split(' | ')[2])===target.username||cards.some(j=>
  (body.subscription?.profile_id&&String(body.subscription.profile_id)===String(j.prodamusProfileId||''))||
  (phone(body.customer_phone||body.phone)&&phone(body.customer_phone||body.phone)===phone(j.phone))||
  (mail(body.customer_email)&&mail(body.customer_email)===mail(j.email)))
}
export function recoverTargetedSignedEvents({raw,list,users,keys,append,expectedEnd,now=Date.now}){
 const known=new Set(raw.filter(r=>r.verified===true).map(r=>HmacHelper.create(r.body,'completion-event-key')));let recovered=0
 for(const target of completionTargets.filter(t=>['vmashik','civillaw_civile'].includes(t.username))){
  const ids=[...new Set([...list().filter(j=>nick(j.telegram)===target.username).map(j=>j.tgUserId),...users().filter(u=>nick(u.username)===target.username).map(u=>u.id)].filter(Boolean).map(String))]
  if(ids.length>1)continue
  const wanted={...target,id:ids[0]},cards=list().filter(j=>wanted.id&&String(j.tgUserId||'')===wanted.id||!j.tgUserId&&nick(j.telegram)===target.username)
  for(const r of raw){
   const b=r.body,signature=r.sign||r.signature||r.headers?.sign||b?.signature
   if(!b?.subscription||b.payment_status!=='success'||!(Number(b.sum??b.subscription.cost)>0)||!Number.isFinite(date(b.date))||!signature||!identity(b,wanted,cards))continue
   if(!keys.some(key=>HmacHelper.verify(b,key,signature)))continue
   if(expectedEnd&&!(expectedEnd(b,date(b.date))>now()))continue
   const id=HmacHelper.create(b,'completion-event-key');if(known.has(id))continue
   append({...r,verified:true,recoveredAt:now(),recoverySource:'validated_original_signature',receivedAt:Number(r.receivedAt)||date(b.date)})
   known.add(id);recovered++
  }
 }
 return recovered
}
function errorDetails(error,stage){
 const code=error?.code||error?.cause?.code
 return {stage,errorClass:/^[a-zA-Z]+$/.test(error?.name||'')?error.name:'Error',errorCode:/^[a-zA-Z0-9_]+$/.test(String(code||''))?String(code):null,property:String(error?.message||'').match(/\(reading '([a-zA-Z0-9_]+)'\)/)?.[1]||null,line:Number(String(error?.stack||'').match(/communityCompletion\.js:(\d+):/)?.[1])||null}
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function readFollowupMember(member,id,wait){
 for(let attempt=0;attempt<2;attempt++){
  try{const state=await member(id);if(state||attempt===1)return state}
  catch(error){if(attempt===1)throw error}
  await wait(150)
 }
}
function followupPayment(records,cards,target,now){
 const safe=Array.isArray(records)?records:[]
 const rows=j=>Array.isArray(j?.payments)?j.payments.filter(p=>p&&typeof p==='object'):[]
 const real=safe.filter(r=>r?.body&&r.body.subscription&&identity(r.body,target,cards)).filter(r=>cards.some(j=>rows(j).some(p=>!p.estimated&&p.orderKey&&p.orderKey===paymentOrder(r.body)&&Number(p.amount)===Number(r.body.sum??r.body.subscription?.cost)&&Number(p.at)===date(r.body.date)))).sort((a,b)=>date(a.body.date)-date(b.body.date))
 const receipt=real.at(-1)
 const currentPaid=Boolean(receipt&&cards.some(j=>j.paid&&!j.ownerAccess&&!j.lifetime&&paidUntil(j)>now&&rows(j).some(p=>!p.estimated&&p.orderKey===paymentOrder(receipt.body)&&Number(p.at)===Number(j.lastPaidAt))))
 return {currentPaid,receipt}
}
export async function completeResidentFollowup({list,users,records,member,patch,processAdmission,sendReminder,unban,now=Date.now,wait=pause}){
 const cases=[]
 for(const target of completionTargets){
  let stage='identity'
  try{
   const ids=[...new Set(target.id?[target.id]:[...list().filter(j=>nick(j.telegram)===target.username).map(j=>j.tgUserId),...users().filter(u=>nick(u.username)===target.username).map(u=>u.id)].filter(Boolean).map(String))]
   if(ids.length!==1){cases.push({name:target.name,username:target.username,ok:false,reason:ids.length?'identity_ambiguous':'telegram_id_missing',stage});continue}
   const id=ids[0],mine=()=>list().filter(j=>String(j.tgUserId||'')===id)
   stage='membership_read'
   let state=await readFollowupMember(member,id,wait)
   if(!state||!['member','administrator','creator','restricted','left','kicked'].includes(state.status)){cases.push({name:target.name,username:target.username,ok:false,reason:'membership_unknown',stage});continue}
   if(!target.id&&state.user?.username&&nick(state.user.username)!==target.username){cases.push({name:target.name,username:target.username,ok:false,reason:'identity_changed',stage});continue}
   stage='access_selection'
   const cards=mine(),join=cards.filter(j=>hasAccess(j,now())).sort((a,b)=>Number(Boolean(b.lifetime))-Number(Boolean(a.lifetime))||Number(Boolean(b.ownerAccess?.active))-Number(Boolean(a.ownerAccess?.active))||(paidUntil(b)||0)-(paidUntil(a)||0))[0]
   if(!join){cases.push({name:target.name,username:target.username,ok:false,reason:'access_not_active',stage});continue}
   const fresh=()=>{const j=list().find(j=>j.token===join.token&&String(j.tgUserId||'')===id);if(!j){const e=Error('Access record changed');e.code='ACCESS_RECORD_CHANGED';throw e}return j}
   stage='unban'
   if(state.status==='kicked'){
    if(!unban||!await unban(fresh())){cases.push({ok:false,name:target.name,username:target.username,reason:'unban_unconfirmed',stage});continue}
    state=await readFollowupMember(member,id,wait)
    if(!state||state.status==='kicked'){cases.push({ok:false,name:target.name,username:target.username,reason:'unban_unconfirmed',stage});continue}
   }
   const joined=inside(state)
   stage='membership_metadata'
   for(const j of cards)patch(j.token,{inChat:joined,membershipVerifiedAt:now(),...(joined&&j.inviteDelivery?{inviteDelivery:{...j.inviteDelivery,pending:false}}:{})})
   stage='invitation_queue'
   const delivered=cards.some(j=>Boolean(j.inviteDelivery?.deliveredAt))
   if(!joined&&!delivered){
    for(const other of mine())if(other.token!==join.token&&other.inviteDelivery?.pending)patch(other.token,{inviteDelivery:{...other.inviteDelivery,pending:false,supersededBy:join.token}})
    const current=fresh(),notice=current.inviteDelivery&&typeof current.inviteDelivery==='object'?current.inviteDelivery:{}
    if(!notice.pending)patch(join.token,{inviteDelivery:{...notice,key:'completion-invite-20261110-'+id,pending:true,mailPending:notice.mailPending||false,retryAt:0,createdAt:now()}})
    else if(notice.retryAt>now())patch(join.token,{inviteDelivery:{...notice,retryAt:0}})
   }
   // A banking-history problem must not suppress an authorized operational reminder.
   stage='reminder_queue'
   if(id==='1955667679'&&!mine().some(j=>j.ownerPaymentReminder?.id==='diana-350-20261110'))patch(join.token,{ownerPaymentReminder:{id:'diana-350-20261110',amount:350,createdAt:now(),done:false,retryAt:0}})
   const ownerConfirmed=cards.some(j=>j.ownerAccess?.reason==='owner_confirmed_payment')
   stage='bank_evidence'
   let currentPaid=false,receipt=null,bankEvidenceError=null
   try{({currentPaid,receipt}=followupPayment(records,mine(),{...target,id},now()))}catch(error){bankEvidenceError=errorDetails(error,stage)}
   stage='bank_review_metadata'
   if(target.username==='civillaw_civile'&&ownerConfirmed)patch(join.token,{paymentReview:{state:currentPaid?'verified_current':'owner_confirmed_without_bank_receipt',checkedAt:now(),source:currentPaid?'accepted_prodamus_event':'owner_statement_20261110',financialEntryCreated:false,...(bankEvidenceError?{error:bankEvidenceError}:{})}})
   cases.push({ok:true,name:target.name,username:target.username,telegramId:id,joined,inviteAcceptedByTelegram:delivered,currentPaymentVerified:currentPaid,paymentSource:currentPaid?'prodamus':ownerConfirmed?'owner_confirmation':target.id==='376201355'?'complimentary':'owner_keep_member',latestVerifiedPayment:receipt?{amount:Number(receipt.body.sum??receipt.body.subscription?.cost),at:date(receipt.body.date)}:null,...(bankEvidenceError?{bankEvidenceError}:{})})
  }catch(error){const details=errorDetails(error,stage);cases.push({ok:false,name:target.name,username:target.username,reason:details.errorCode==='ACCESS_RECORD_CHANGED'?'access_record_changed':stage==='membership_read'?'membership_read_failed':'followup_step_failed',...details})}
 }
 const deliveryErrors=[]
 try{await processAdmission()}catch(error){deliveryErrors.push(errorDetails(error,'invitation_delivery'))}
 try{await sendReminder()}catch(error){deliveryErrors.push(errorDetails(error,'reminder_delivery'))}
 for(const c of cases.filter(c=>c.ok)){
  const mine=list().filter(j=>String(j.tgUserId||'')===c.telegramId)
  c.inviteAcceptedByTelegram=c.joined||mine.some(j=>Boolean(j.inviteDelivery?.deliveredAt))
  if(c.telegramId==='1955667679'){const notes=mine.map(j=>j.ownerPaymentReminder).filter(Boolean),r=notes.find(n=>n.done&&n.deliveredAt)||notes.find(n=>n.done)||notes[0];c.reminder350=r?.suppressed?'already_paid':r?.done?'sent':'pending'}
 }
 return{followupVersion:2,cases,deliveryErrors,pendingDeliveries:cases.filter(c=>c.ok&&!c.inviteAcceptedByTelegram).length,pendingReminders:cases.filter(c=>c.reminder350==='pending').length,bankEvidenceMissing:cases.filter(c=>c.paymentSource==='owner_confirmation'&&!c.currentPaymentVerified).map(c=>c.username)}
}

export function createOwnerPaymentReminderDelivery({list,patch,send,now=Date.now}){
 let running=false
 return async()=>{
  if(running)return
  running=true
  try{
   const jobs=list().filter(j=>String(j.tgUserId)==='1955667679'&&j.ownerPaymentReminder),groups=new Map()
   for(const j of jobs){const key=j.ownerPaymentReminder.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(j)}
   for(const group of groups.values()){
    const already=group.find(j=>j.ownerPaymentReminder.done)
    if(already){for(const j of group)if(!j.ownerPaymentReminder.done)patch(j.token,{ownerPaymentReminder:{...j.ownerPaymentReminder,...already.ownerPaymentReminder}});continue}
    const j=group[0],r=j.ownerPaymentReminder;if(r.retryAt>now())continue
    if(list().some(c=>String(c.tgUserId)===String(j.tgUserId)&&c.paid&&!c.ownerAccess&&!c.lifetime&&paidUntil(c)>now())){for(const entry of group)patch(entry.token,{ownerPaymentReminder:{...entry.ownerPaymentReminder,done:true,suppressed:'already_paid',checkedAt:now()}});continue}
    let delivered=false;try{delivered=await send(j,r)===true}catch{}
    for(const entry of group){const fresh=list().find(c=>c.token===entry.token);if(fresh?.ownerPaymentReminder?.id!==r.id)continue;patch(entry.token,{ownerPaymentReminder:{...fresh.ownerPaymentReminder,done:delivered,retryAt:now()+60000,...(delivered?{deliveredAt:now()}:{} )}})}
   }
  }finally{running=false}
 }
}

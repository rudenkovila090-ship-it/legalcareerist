import { normalizeCommunityUsername as nick } from './communityInvite.js'
import { hasAccess } from './subscriptionAccess.js'

export const rescueTargets = [
  { id:'376201355', username:'ognevushaa', name:'Анастасия Шемонаева', kind:'lifetime' },
  { id:'1955667679', username:'mulanka_7', name:'Диана Плиева', kind:'keep_member' },
  { username:'civillaw_civile', name:'Кристина Брехова', kind:'owner_confirmed_payment' },
  { username:'vmashik', name:'Мария Лапшина', kind:'owner_confirmed_payment' },
]
import { ownerAccessAllowed } from './communityAccessPolicy.js'
export { ownerAccessAllowed } from './communityAccessPolicy.js'
// A ban, an administrator removal, or an unban event is NOT voluntary departure.
export const voluntaryDeparture = event => event.new_chat_member?.status === 'left' &&
  String(event.from?.id || '') === String(event.new_chat_member?.user?.id || '')
const inside = m => ['member','administrator','creator'].includes(m?.status) || (m?.status === 'restricted' && m.is_member === true)
const order = b => String(b.order_id || '') || (b.subscription?.profile_id && b.subscription?.payment_num ? `sub:${b.subscription.id}:${b.subscription.profile_id}:${b.subscription.payment_num}` : '')
const phone = v => String(v || '').replace(/\D/g,'').replace(/^8(?=\d{10}$)/,'7')
const mail = v => String(v || '').trim().toLowerCase()
const norm = v => String(v || '').toLowerCase().replace(/ё/g,'е').replace(/[^а-яa-z]+/g,' ').trim().split(/\s+/).sort().join(' ')
const label = u => u.name || [u.firstName || u.first_name,u.lastName || u.last_name].filter(Boolean).join(' ')

// A receipt must survive a Telegram outage independently of payment idempotency.
export function createPaymentAdminDelivery({list,patch,send,now=Date.now}) {
  let running=false
  return async () => {
    if(running)return
    running=true
    try {
      for(const card of list())for(const notice of card.adminPaymentNotices || []) {
        if(notice.done || notice.retryAt > now())continue
        let ok=false
        try {ok=await send(card,notice)===true}catch{}
        const latest=list().find(j=>j.token===card.token)
        if(!latest)continue
        patch(card.token,{adminPaymentNotices:(latest.adminPaymentNotices || []).map(n=>n.id===notice.id ? {...n,done:ok,...(ok?{deliveredAt:now()}:{retryAt:now()+60000})} : n)})
      }
    } finally {running=false}
  }
}

export function bindOwnerAccess(from,{list,bind,patch}) {
  if(!from?.id || !nick(from.username))return null
  const grants=list().filter(j=>ownerAccessAllowed(j)&&!j.tgUserId&&nick(j.telegram)===nick(from.username))
  if(grants.length!==1)return null
  bind(grants[0].token,String(from.id))
  patch(grants[0].token,{inviteDelivery:{key:'owner-access-'+from.id,pending:true,mailPending:false,createdAt:Date.now()}})
  return list().find(j=>j.token===grants[0].token)
}

// Owner-authorized membership is a separate entitlement, never a fabricated payment.
export async function rescueCommunityAccess({list,users,requests,events,create,createLifetime,bind,patch,member,unban,approve,sync,apply,now=Date.now,trustedFrom=0}) {
  const result=[]
  for(const target of rescueTargets) {
    try {
      const all=list(),contacts=[...users(),...Object.values(requests()).map(r=>r.from)]
      const exact=[...all.filter(j=>nick(j.telegram)===target.username).map(j=>j.tgUserId),...contacts.filter(u=>nick(u.username)===target.username).map(u=>u.id)].filter(Boolean).map(String)
      const named=[...contacts,...all].filter(u=>norm(label(u))===norm(target.name)).map(u=>String(u.id || u.tgUserId)).filter(id=>/^\d{5,16}$/.test(id))
      const ids=[...new Set(target.id?[target.id]:exact.length?exact:named)]
      if(ids.length>1)throw Error('identity_ambiguous')
      const id=ids[0] || null
      let currentMember=id?await member(id):null
      if(id&&!target.id&&currentMember?.user?.username&&nick(currentMember.user.username)!==target.username)throw Error('telegram_identity_conflict')
      const mine=()=>list().filter(j=>(id&&String(j.tgUserId || '')===id)||(!j.tgUserId&&nick(j.telegram)===target.username))
      const accepted=events().filter(r=>(r.verified===true||(trustedFrom>0&&r.receivedAt>=trustedFrom))&&r.body?.subscription&&r.body.payment_status==='success'&&Number(r.body.sum??r.body.subscription.cost)>0).filter(r=>{
        const b=r.body
        if(id&&b.tg_user_id&&String(b.tg_user_id)!==id)return false
        return (id&&String(b.tg_user_id || '')===id)||nick(String(b.customer_extra || '').split(' | ')[2])===target.username||mine().some(j=>
          (b.subscription.profile_id&&String(b.subscription.profile_id)===String(j.prodamusProfileId || ''))||
          (phone(b.customer_phone || b.phone)&&phone(b.customer_phone || b.phone)===phone(j.phone))||
          (mail(b.customer_email)&&mail(b.customer_email)===mail(j.email)))
      }).sort((a,b)=>a.receivedAt-b.receivedAt)
      let paymentReplayed=0,paymentError=null
      for(const r of accepted){
        const key=order(r.body)
        if(!key)continue // Do not duplicate orderless legacy charges.
        const owners=list().filter(j=>(j.payments || []).some(p=>p.orderKey===key))
        if(owners.some(j=>id&&j.tgUserId&&String(j.tgUserId)!==id)){paymentError='payment_identity_conflict';continue}
        if(!owners.length){try{await apply(r);paymentReplayed++}catch{paymentError='payment_replay_unconfirmed'}}
      }
      if(id)for(const j of mine().filter(j=>!j.tgUserId))if(accepted.some(r=>order(r.body)&&(j.payments||[]).some(p=>p.orderKey===order(r.body))))bind(j.token,id)
      let grant=mine().find(j=>target.kind==='lifetime'?j.lifetime||j.complimentary:ownerAccessAllowed(j))
      if(!grant){const token=target.kind==='lifetime'?createLifetime({tgUserId:id,name:target.name,telegram:'@'+target.username}):create({tariffId:null,name:target.name,phone:'',email:'',telegram:'@'+target.username});grant=list().find(j=>j.token===token)}
      if(!grant)throw Error('access_grant_not_saved')
      if(id&&!grant.tgUserId)bind(grant.token,id)
      if(target.kind==='lifetime')patch(grant.token,{lifetime:true,status:'active',complimentary:{...grant.complimentary,nominalAmount:350,currency:'RUB',untilDeparture:true,revokedAt:undefined,source:'owner_access_rescue_20261110',grantedAt:grant.complimentary?.grantedAt || now()}})
      else patch(grant.token,{ownerAccess:{...grant.ownerAccess,active:true,source:'owner_access_rescue_20261110',reason:target.kind,grantedAt:grant.ownerAccess?.grantedAt || now(),paymentVerificationPending:target.kind==='owner_confirmed_payment'&&!accepted.length},status:'active'})
      let unblocked=id?false:null,joined=inside(currentMember)
      if(id){
        unblocked=await unban(id)===true
        if(!unblocked)throw Error('telegram_unban_not_confirmed')
        if(!joined){await approve(id);currentMember=await member(id);joined=inside(currentMember)}
        patch(grant.token,{inChat:joined,accessUnbanPending:undefined,membershipVerifiedAt:now(),...(!joined&&!grant.inviteDelivery?{inviteDelivery:{key:'owner-rescue-'+id,pending:true,mailPending:false,createdAt:now()}}:{})})
        sync(list().find(j=>j.token===grant.token),id)
      }
      // Catch up the latest accepted real payment notice without rewriting money.
      const recent=accepted.at(-1),key=recent&&order(recent.body)
      if(key){const charged=list().find(j=>(j.payments || []).some(p=>p.orderKey===key));if(charged&&!(charged.adminPaymentNotices || []).some(n=>n.id===key)){
        const p=charged.payments.find(p=>p.orderKey===key)
        patch(charged.token,{adminPaymentNotices:[...(charged.adminPaymentNotices || []),{id:key,kind:p.kind || 'renewal',number:p.paymentNum || charged.payments.length,amount:p.amount,paidAt:p.at,nextPaymentAt:charged.nextPaymentAt,subscriptionId:p.subscriptionId,tariffId:p.tariffId,done:false,recovered:true}]})
      }}
      const latest=list().find(j=>j.token===grant.token),noticeId='owner-rescue-20261110-'+target.username
      if(!(latest.adminPaymentNotices || []).some(n=>n.id===noticeId))patch(grant.token,{adminPaymentNotices:[...(latest.adminPaymentNotices || []),{id:noticeId,type:'access_rescue',name:target.name,username:target.username,realPaymentFound:Boolean(accepted.length),done:false}]})
      result.push({ok:true,name:target.name,username:target.username,telegramId:id,unblocked,joined,awaitingIdentity:!id,accessGranted:hasAccess(list().find(j=>j.token===grant.token),now()),lifetime:target.kind==='lifetime',realPaymentFound:Boolean(accepted.length),paymentReplayed,paymentError})
    } catch(error) {result.push({ok:false,name:target.name,username:target.username,error:/^[a-z_]+$/.test(error.message)?error.message:'rescue_unavailable'})}
  }
  return result
}

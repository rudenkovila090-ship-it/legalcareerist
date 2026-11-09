import { normalizeCommunityUsername } from './communityInvite.js'
import { hasAccess } from './subscriptionAccess.js'
const inside = member => ['member','administrator','creator'].includes(member?.status)
const name = v => String(v || '').toLowerCase().replace(/ё/g,'е')
// Owner-authorized courtesy access, resolved only to one verified Telegram identity.
export async function repairCommunityCards({ list, users, member, bind, patch, createLifetime, updateUser, syncMetadata, now = Date.now }) {
  const result = { complimentary: 'not_found', linkedPaidCards: 0, absentReviewsClosed: 0, financialHistoryReplaced: false }
  const named = u => { const text=name([u.name,u.firstName,u.lastName].filter(Boolean).join(' '));return /шеманаев/.test(text)&&/анастас/.test(text) }
  const candidates=[...new Set([...list().filter(named).map(c=>c.tgUserId),...users().filter(named).map(u=>u.id)].filter(Boolean).map(String))]
  if(candidates.length>1) result.complimentary='ambiguous_identity'
  else if(candidates.length===1){
    const id=candidates[0], m=await member(id)
    if(list().some(c=>String(c.tgUserId)===id&&c.complimentary?.untilDeparture&&c.complimentary.revokedAt)) result.complimentary='grant_ended_on_departure'
    else if(m?.status==='member'){
      let join=list().find(c=>String(c.tgUserId)===id&&c.lifetime)
      if(!join){const token=createLifetime({tgUserId:id,name:[m.user?.first_name,m.user?.last_name].filter(Boolean).join(' ')||'Анастасия Шеманаева',telegram:m.user?.username?'@'+m.user.username:''});join=list().find(c=>c.token===token)}
      if(!join)throw Error('courtesy_card_not_created')
      patch(join.token,{complimentary:{...join.complimentary,nominalAmount:350,currency:'RUB',untilDeparture:true,source:'owner_instruction_20261110',grantedAt:join.complimentary?.grantedAt||now()},inChat:true})
      syncMetadata?.(list().find(c=>c.token===join.token),id)
      const old=users().find(u=>String(u.id)===id)
      if(old)updateUser(id,{tags:[...new Set([...(old.tags||[]).filter(t=>!t.startsWith('тариф_')&&!t.startsWith('цена_')&&!['проверка_подписки','контроль_списания','бывший_резидент','доступ_закрыт'].includes(t)),'резидент_сообщества','тариф_1m','цена_350','бессрочный_доступ'])],subscriptionLockedAmount:350,subscriptionTariffId:'1m',communityAccessStatus:'active'})
      result.complimentary='lifetime_nominal_350'
    }else result.complimentary=m?.status==='unknown'?'membership_unavailable':'not_current_member'
  }
  for(const card of list().filter(c=>!c.tgUserId&&hasAccess(c,now())&&(c.payments||[]).some(p=>!p.estimated&&Number(p.amount)>0))){
    const nick=normalizeCommunityUsername(card.telegram);if(!nick)continue
    const matches=users().filter(u=>normalizeCommunityUsername(u.username)===nick)
    if(matches.length!==1)continue
    const id=String(matches[0].id),m=await member(id)
    if(!inside(m)||normalizeCommunityUsername(m.user?.username)!==nick)continue
    bind(card.token,id);patch(card.token,{inChat:true,membershipVerifiedAt:now()});syncMetadata?.(list().find(c=>c.token===card.token),id);result.linkedPaidCards++
  }
  for(const card of list().filter(c=>c.tgUserId&&c.billingReview?.state==='pending').slice(0,30)){
    const m=await member(String(card.tgUserId));if(!['left','kicked'].includes(m?.status))continue
    patch(card.token,{inChat:false,billingReview:{...card.billingReview,state:'resolved',holdUntil:0,resolvedAt:now()}})
    const old=users().find(u=>String(u.id)===String(card.tgUserId));if(old)updateUser(card.tgUserId,{tags:(old.tags||[]).filter(t=>t!=='проверка_подписки')})
    result.absentReviewsClosed++
  }
  return result
}

export const NEWCOMER_DELAY_MS = 10 * 60 * 1000
export const NEWCOMER_CAPTION = 'Добро пожаловать в «Карьерный юрист»! 💛\n\nЧтобы тебе было легче освоиться в сообществе, отправляю чек-лист «Квест новичка». Пройди его в удобном темпе: он поможет познакомиться с резидентами, найти полезные возможности и получить первую пользу от сообщества.'

// One durable record per Telegram person, independently of their payment cards.
// Unknown send outcomes are held for review: the Bot API has no idempotency key.
export function createCommunityOnboarding({load,save,membership,send,now=Date.now}) {
  let running=false
  const idOf=id=>/^\d{5,16}$/.test(String(id||''))?String(id):null
  function joined(id,at=now(),historical=false) {
    const key=idOf(id);if(!key)return false
    const data=load(),existing=data[key]
    if(existing&&!(existing.state==='cancelled'&&existing.reason==='left'))return false
    if(!existing&&historical)return false
    const joinedAt=Number.isFinite(at)&&at>0&&at<=now()+60000?at:now()
    if(existing&&joinedAt<=Number(existing.lastEventAt||0))return false
    data[key]={version:1,telegramId:key,joinedAt,lastEventAt:joinedAt,dueAt:joinedAt+NEWCOMER_DELAY_MS,state:'pending',attempts:existing?.attempts||0,retryAt:0}
    save(data);return true
  }
  function left(id,at=now()) {
    const key=idOf(id),data=load(),job=data[key]
    if(!job||job.state==='delivered'||job.state==='uncertain'||job.state==='sending'||at<Number(job.lastEventAt||0))return
    data[key]={...job,state:'cancelled',reason:'left',lastEventAt:at,cancelledAt:now()};save(data)
  }
  function contact(id) {
    const key=idOf(id),data=load(),job=data[key]
    if(job?.state==='pending'&&job.errorCode==='dm_unavailable'){data[key]={...job,retryAt:0};save(data)}
  }
  const patch=(id,fields)=>{const data=load();if(data[id]){data[id]={...data[id],...fields};save(data)}}
  async function process() {
    if(running)return
    running=true
    try {
      for(const [id,initial]of Object.entries(load())){
        if(!idOf(id)||initial.version!==1||!Number.isFinite(initial.dueAt)||initial.dueAt<initial.joinedAt+NEWCOMER_DELAY_MS)throw Error('invalid_onboarding_queue')
        if(initial.state==='sending'){
          if(now()-Number(initial.sendingAt||0)>60000)patch(id,{state:'uncertain',errorCode:'interrupted_delivery',reviewAt:now()})
          continue
        }
        if(initial.state!=='pending'||initial.dueAt>now()||initial.retryAt>now())continue
        let state='unknown';try{state=await membership(id)}catch{}
        const current=load()[id]
        if(!current||current.state!=='pending'||current.dueAt>now())continue
        if(state==='out'){left(id,now());continue}
        if(!['in','admin'].includes(state)){patch(id,{retryAt:now()+60000,errorCode:'membership_unknown'});continue}
        // Persist intent before calling Telegram so a crash cannot blindly resend.
        patch(id,{state:'sending',sendingAt:now(),attempts:(current.attempts||0)+1})
        let result
        try{result=await send(id,NEWCOMER_CAPTION)}catch{result={uncertain:true,errorCode:'delivery_unknown'}}
        if(result?.ok===true&&result.messageId){patch(id,{state:'delivered',sentAt:now(),messageId:result.messageId,errorCode:null,retryAt:0});continue}
        if(result?.retryable===true){patch(id,{state:'pending',errorCode:result.errorCode||'send_rejected',retryAt:now()+Math.max(30000,Number(result.retryAfterMs)||60000)});continue}
        patch(id,{state:'uncertain',errorCode:result?.errorCode||'delivery_unknown',reviewAt:now()})
      }
    } finally {running=false}
  }
  return {joined,left,contact,process}
}

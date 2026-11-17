// Owner-authorized one-off message. No access grants, cancellations, charges or payment-record writes.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import {runtimeSettings} from './lib/bot-runtime-settings.mjs'

const target={id:'1955667679',username:'mulanka_7',name:'Диана Плиева',amount:350,plan:'2611878'}
const stop=code=>{const error=Error(code);error.safeCode=code;throw error}
const paidNow=root=>{
  let records
  try{records=JSON.parse(fs.readFileSync(path.join(root,'data/pending-joins.json'),'utf8'))}catch{stop('PAYMENT_REGISTER_UNAVAILABLE')}
  if(!records||typeof records!=='object')stop('PAYMENT_REGISTER_UNAVAILABLE')
  return Object.values(records).some(j=>String(j?.tgUserId)===target.id&&j.paid&&!j.lifetime&&!j.ownerAccess&&['active','cancelled'].includes(j.status)&&Number(j.nextPaymentAt??j.endsAt)>Date.now()&&(j.payments||[]).some(p=>!p.estimated&&p.orderKey&&Number(p.amount)>0&&Number(p.at)===Number(j.lastPaidAt)))
}
const save=(file,data)=>{
  const temp=file+'.tmp-'+process.pid
  try{fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});if(process.getuid?.()===0){const owner=fs.statSync(path.dirname(file));fs.chownSync(temp,owner.uid,owner.gid)}fs.renameSync(temp,file)}finally{fs.rmSync(temp,{force:true})}
}

async function main(){
  process.umask(0o077)
  let apps
  try{apps=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:15000,maxBuffer:16*1024*1024})).filter(a=>a.name==='legalcareerist-api')}catch{stop('BOT_RUNTIME_UNAVAILABLE')}
  if(apps.length!==1||apps[0].pm2_env.status!=='online')stop('BOT_RUNTIME_UNAVAILABLE')
  const config=runtimeSettings(apps[0].pm2_env,{}),root=config.runtime
  const token=config.value('TELEGRAM_BOT_TOKEN'),secret=config.value('PRODAMUS_SECRET_KEY')
  if(!token||!secret)stop('BOT_OR_PAYMENT_KEY_UNAVAILABLE')
  const dir=path.join(root,'data/operator-notices'),file=path.join(dir,'diana-payment-link-20261117.json'),lock=file+'.lock'
  if(!fs.existsSync(dir)){
    fs.mkdirSync(dir,{recursive:true,mode:0o700})
    if(process.getuid?.()===0){const owner=fs.statSync(path.join(root,'data'));fs.chownSync(dir,owner.uid,owner.gid)}
  }
  let locked=false,journal={}
  try{
    try{fs.writeFileSync(lock,String(process.pid),{mode:0o600,flag:'wx'});locked=true}catch{stop('SEND_ALREADY_RUNNING')}
    if(process.getuid?.()===0){const owner=fs.statSync(dir);fs.chownSync(lock,owner.uid,owner.gid)}
    if(fs.existsSync(file))try{journal=JSON.parse(fs.readFileSync(file,'utf8'))}catch{stop('DELIVERY_JOURNAL_INVALID')}
    if(journal.state&&(!['prepared','failed','sending','unknown','sent'].includes(journal.state)||journal.target!==target.id||journal.amount!==target.amount||journal.plan!==target.plan))stop('DELIVERY_JOURNAL_INVALID')
    if(journal.state==='sent'){
      console.log('DIANA_PAYMENT_LINK_SENT: ранее отправлено @mulanka_7, 350 ₽/месяц; message_id='+journal.messageId+'. Повторного сообщения нет.');return
    }
    if(['sending','unknown'].includes(journal.state))stop('PREVIOUS_DELIVERY_UNCERTAIN_NO_RESEND')
    journal={...journal,target:target.id,username:target.username,amount:target.amount,plan:target.plan}
    if(paidNow(root)){console.log('DIANA_ALREADY_PAID: найден действующий оплаченный период; новая ссылка не отправлялась.');return}
    const telegram=async(method,body)=>{
      let response,data
      try{response=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});data=await response.json()}catch{stop(method==='sendMessage'?'DELIVERY_UNCERTAIN_NO_RESEND':'TELEGRAM_READ_UNAVAILABLE')}
      if(!response.ok||data.ok!==true){
        if(method==='sendMessage'){journal={...journal,state:'failed',telegramErrorCode:Number(data.error_code)||response.status,failedAt:Date.now()};save(file,journal)}
        stop('TELEGRAM_'+method.toUpperCase()+'_REJECTED_'+(Number(data.error_code)||response.status))
      }
      return data.result
    }
    const me=await telegram('getMe',{})
    if(String(me?.username||'').toLowerCase()!=='legalcareerist_bot')stop('WRONG_BOT')
    const chat=await telegram('getChat',{chat_id:Number(target.id)})
    if(String(chat?.id)!==target.id||chat.type!=='private'||String(chat.username||'').toLowerCase()!==target.username)stop('RECIPIENT_IDENTITY_UNCONFIRMED')
    for(const key of ['PRODAMUS_SECRET_KEY','PRODAMUS_DOMAIN','SITE_URL']){
      const value=config.value(key)
      if(value!==undefined)process.env[key]=String(value);else delete process.env[key]
    }
    const pricing=await import(pathToFileURL(path.join(root,'lib/subscriptionPricing.js')).href)
    if(pricing.HISTORICAL_PLANS?.[target.plan]?.price!==target.amount||pricing.HISTORICAL_PLANS[target.plan].months!==1)stop('HISTORICAL_350_PLAN_UNCONFIRMED')
    const prodamus=await import(pathToFileURL(path.join(root,'lib/prodamus.js')).href)
    const params={tariffId:'1m',lockedPlan:{subscriptionId:target.plan,amount:target.amount},tgUserId:target.id,name:target.name,telegram:'@'+target.username,urlSuccess:'https://legalcareerist.ru/cabinet/resident'}
    let request
    try{request=new URL(prodamus.buildSubscriptionLink(params))}catch{stop('PAYMENT_LINK_CONFIGURATION_INVALID')}
    if(request.searchParams.get('subscription')!==target.plan||request.searchParams.get('tg_user_id')!==target.id)stop('SIGNED_PAYMENT_IDENTITY_OR_PRICE_WRONG')
    let url=journal.paymentUrl
    if(!url)try{url=await prodamus.createPaymentLink(params)}catch{stop('PAYMENT_LINK_GENERATION_FAILED')}
    let ready
    try{ready=new URL(url)}catch{stop('PAYMENT_LINK_INVALID')}
    if(ready.protocol!=='https:'||ready.username||ready.password||!(ready.hostname==='payform.ru'||ready.hostname.endsWith('.payform.ru')))stop('PAYMENT_LINK_INVALID')
    journal={...journal,state:'prepared',paymentUrl:ready.href,preparedAt:Date.now()};save(file,journal)
    if(paidNow(root)){console.log('DIANA_ALREADY_PAID: оплата обнаружена перед отправкой; сообщение не отправлялось.');return}
    journal={...journal,state:'sending',attemptedAt:Date.now()};save(file,journal)
    const sent=await telegram('sendMessage',{
      chat_id:Number(target.id),
      text:'Диана, здравствуйте! Отправляем ссылку на оплату подписки на сообщество «Карьерный юрист» по вашему тарифу — 350 ₽ в месяц.\n\nЕсли вы уже оплатили или при оплате появляется ошибка, напишите в поддержку — поможем разобраться.',
      reply_markup:{inline_keyboard:[[{text:'Оплатить подписку — 350 ₽/месяц',url:ready.href}],[{text:'Поддержка',url:'https://t.me/legalcareerist_support'}]]},
    })
    if(!Number.isInteger(sent?.message_id)||String(sent?.chat?.id)!==target.id)stop('DELIVERY_UNCERTAIN_NO_RESEND')
    journal={...journal,state:'sent',messageId:sent.message_id,sentAt:Date.now()};save(file,journal)
    console.log('DIANA_PAYMENT_LINK_SENT: Telegram подтвердил отправку @mulanka_7, 350 ₽/месяц; message_id='+sent.message_id+'.')
  }catch(error){
    if(journal.state==='sending')try{save(file,{...journal,state:'unknown',checkedAt:Date.now()})}catch{}
    throw error
  }finally{if(locked)fs.rmSync(lock,{force:true})}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{
  const safe=typeof error.safeCode==='string'&&/^[A-Z][A-Z0-9_]*$/.test(error.safeCode)?error.safeCode:'SEND_UNAVAILABLE'
  console.error('ОТПРАВКА НЕ ПОДТВЕРЖДЕНА: '+safe+'. Автоматического повторения нет; доступ и история оплат не изменялись.');process.exitCode=1
})

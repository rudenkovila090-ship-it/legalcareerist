import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { HmacHelper } from '../lib/hmac.js'
export async function runEventTickets({root,request,hook,check,wait,pathToFileURL}) {
  fs.writeFileSync(path.join(root,'telegram-ok'),'')
  const event={slug:'dzhazovyy-vecher-dlya-yuristov-2',title:'Synthetic Legal Night Jazz 2',status:'open',collectTicketLead:true,registrationLink:'https://payform.ru/obcMOZJ/',dateTime:'2026-11-28T18:00:00+03:00',city:'Test',tariffs:[{id:'light',name:'Билет',price:3990}]}
  fs.writeFileSync(path.join(root,'data/event-catalog.json'),JSON.stringify([event]))
  const leads=await import(pathToFileURL(path.join(root,'lib/eventLeads.js')))
  const lines=name=>{try{return fs.readFileSync(path.join(root,name),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)}catch{return []}}
  const mail=n=>lines('ticket-mails.jsonl').filter(m=>m.to===`guest${n}@example.invalid`)
  const docs=id=>lines('telegram-calls.jsonl').filter(c=>c.method==='sendDocument'&&String(c.body.chat_id)===String(id))
  const until=async fn=>{for(let i=0;i<150;i++){if(fn())return;await wait(30)}throw Error('ticket state timeout')}
  const checkout=async()=>{
    const n=leads.listEventLeads().length+1
    const r=await request('/api/event/'+event.slug+'/checkout',{tariffId:'light',name:'Synthetic Guest '+n,email:`guest${n}@example.invalid`,phone:'+79000000000',telegram:'@synthetic',consent:{policy:true,processing:true,marketing:false}})
    assert.equal(r.status,200,JSON.stringify(r.body));return leads.listEventLeads().find(l=>l.number===n)
  }
  const pay=async(lead,extra={})=>{
    const body={payment_status:'success',sum:'3990',order_id:'bank-'+lead.number,order_num:'ev-'+lead.number,...extra}
    const r=await request('/api/prodamus/webhook',body,{sign:HmacHelper.create(body,'test-no-real-provider')})
    assert.equal(r.status,200);return body
  }
  const start=async(lead,id,messageId=100)=>{
    const r=await request('/api/telegram/webhook',{update_id:messageId,message:{message_id:messageId,chat:{id,type:'private'},from:{id,first_name:'Synthetic'},text:'/start ticket_'+lead.token}})
    assert.equal(r.status,200);return r
  }
  const first=await checkout()
  let r=await request('/api/prodamus/webhook',{payment_status:'success',order_num:'ev-1',sum:'3990'},{sign:'bad'})
  check('unverified payments never mark the registration paid or send a ticket',()=>{assert.equal(r.status,400);assert.equal(leads.getEventLead(1).status,'registered');assert.equal(mail(1).length,0)})
  const body=await pay(first)
  await until(()=>leads.getEventLead(1).ticketDelivery?.email.state==='sent')
  r=await request('/api/ticket/receipt?token='+first.token)
  check('signed payment sends a real PDF to the checkout email and returns a private bot link',()=>{assert.equal(mail(1).length,1);assert.equal(mail(1)[0].attachments[0].pdf,true);assert.ok(mail(1)[0].attachments[0].size>100000);assert.equal(r.body.botUrl,'https://t.me/synthetic_bot?start=ticket_'+first.token);assert.equal(leads.getEventLead(1).ticketDelivery.telegram.state,'waiting')})
  await start(first,900000001);await until(()=>docs(900000001).length===1)
  await until(()=>leads.getEventLead(1).ticketDelivery.telegram.state==='sent')
  check('buyer starts the bot and receives their personalized PDF document',()=>{assert.equal(docs(900000001)[0].body.document.filename.includes('.pdf'),true);assert.equal(leads.getEventLead(1).tgUserId,'900000001')})
  await start(first,900000001);await wait(100)
  await request('/api/prodamus/webhook',body,{sign:HmacHelper.create(body,'test-no-real-provider')});await wait(100)
  check('duplicate provider and Telegram updates do not duplicate paid tickets',()=>{assert.equal(mail(1).length,1);assert.equal(docs(900000001).length,1);assert.equal(leads.getEventLead(1).amount,3990)})
  await start(first,900000002,101);await wait(100)
  check('the same ticket cannot be rebound to another Telegram account',()=>{assert.equal(leads.getEventLead(1).tgUserId,'900000001');assert.equal(docs(900000002).length,0)})
  fs.writeFileSync(path.join(root,'smtp-fail'),'')
  const second=await checkout();await pay(second)
  await until(()=>leads.getEventLead(2).ticketDelivery?.email.state==='retry')
  fs.rmSync(path.join(root,'smtp-fail'));await hook('',{clock:Date.now()+3600001});await hook('processEventTicketDelivery')
  check('a temporary SMTP failure remains pending and sends the PDF through the independent worker',()=>{assert.equal(mail(2).length,1);assert.equal(leads.getEventLead(2).ticketDelivery.email.state,'sent')})
  const third=await checkout();await start(third,900000003,102);await wait(100)
  check('starting the bot before payment never issues an unpaid ticket',()=>assert.equal(docs(900000003).length,0))
  fs.writeFileSync(path.join(root,'document-blocked'),'');await pay(third)
  await until(()=>leads.getEventLead(3).ticketDelivery?.telegram.state==='retry')
  fs.rmSync(path.join(root,'document-blocked'));await hook('',{clock:Date.now()+7200002});await hook('processEventTicketDelivery')
  check('Telegram recovers independently without mailing the PDF a second time',()=>{assert.equal(mail(3).length,1);assert.equal(docs(900000003).length,2);assert.equal(leads.getEventLead(3).ticketDelivery.telegram.state,'sent')})
  const fourth=await checkout();await pay(fourth,{order_id:'ev-4',order_num:'',customer_extra:''})
  await until(()=>leads.getEventLead(4).ticketDelivery?.email.state==='sent')
  check('event references sent in order_id alone are recognized without falling into material checkout',()=>assert.equal(mail(4).length,1))
  const fifth=await checkout(),sixth=await checkout()
  await pay(fifth,{customer_extra:'ev-'+sixth.number});await wait(100)
  check('conflicting event references cannot credit a different buyer',()=>{assert.equal(leads.getEventLead(5).status,'registered');assert.equal(leads.getEventLead(6).status,'registered');assert.equal(mail(5).length,0)})
  r=await request('/api/health')
  check('the running API exposes the installed ticket delivery version',()=>assert.equal(r.body.eventTicketDelivery,1))
}

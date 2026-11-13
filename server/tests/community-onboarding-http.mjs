import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
export async function runCommunityOnboarding({root,request,hook,read,check,wait,pathToFileURL}) {
 const start=Date.parse('2026-11-13T18:00:00+03:00'),chat=-100900000001,id='900007001',manual='900007002',left='900007003',blocked='900007004',old='900007005'
 const pdf=Buffer.from('%PDF-1.4\nSYNTHETIC QUEST BYTES\n%%EOF'),assets=path.join(root,'data/community-assets');fs.mkdirSync(assets,{recursive:true});fs.writeFileSync(path.join(assets,'newcomer-quest.pdf'),pdf)
 const docs=()=>fs.existsSync(path.join(root,'telegram-calls.jsonl'))?fs.readFileSync(path.join(root,'telegram-calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(c=>c.method==='sendDocument'):[]
 const queue=()=>read('community-onboarding.json')
 fs.writeFileSync(path.join(root,'telegram-ok'),'')
 const members=Object.fromEntries([id,manual,left,blocked,old].map(id=>[id,{status:'left',user:{id:Number(id),first_name:'Synthetic',username:'synthetic_'+id}}]))
 const saveMembers=()=>fs.writeFileSync(path.join(root,'telegram-members.json'),JSON.stringify(members));saveMembers()
 const joins=await import(pathToFileURL(path.join(root,'lib/store.js'))),users=await import(pathToFileURL(path.join(root,'lib/botUsers.js')))
 const token=joins.createPendingJoin({tariffId:'1m',name:'Synthetic',phone:'+79000007001',telegram:'@synthetic_'+id});joins.setTgUserId(token,id);joins.recordPayment(token,{amount:690,subscriptionId:'2854597',paidAt:start,nextPaymentAt:start+30*86400000,orderKey:'newcomer-real-fixture'})
 check('payment alone does not schedule or send the quest',()=>{assert.equal(fs.existsSync(path.join(root,'data/community-onboarding.json')),false);assert.equal(docs().length,0)})
 await hook('',{clock:start})
 await request('/api/telegram/webhook',{update_id:77001,chat_join_request:{chat:{id:chat},from:members[id].user,user_chat_id:Number(id),date:start/1000}})
 await wait(100)
 check('approval creates one durable job for ten minutes after entry',()=>{assert.equal(queue()[id].dueAt,start+600000);assert.equal(queue()[id].state,'pending');assert.equal(docs().length,0)})
 const event=(who,at,was='left',state='member')=>({update_id:77002,chat_member:{chat:{id:chat},from:members[who].user,date:Math.floor(at/1000),old_chat_member:{status:was,user:members[who].user},new_chat_member:{status:state,is_member:state==='restricted',user:members[who].user},via_join_request:true}})
 await request('/api/telegram/webhook',event(id,start));await wait(50)
 check('the subsequent chat_member update does not enqueue a duplicate',()=>assert.equal(Object.keys(queue()).length,1))
 await hook('processCommunityOnboarding',{clock:start+599999})
 check('no PDF is sent before ten full minutes',()=>assert.equal(docs().length,0))
 await hook('processCommunityOnboarding',{clock:start+600000})
 check('one PDF with the expected bytes, filename and welcome caption is sent',()=>{const sent=docs();assert.equal(sent.length,1);assert.equal(sent[0].body.chat_id,id);assert.equal(sent[0].body.document.filename,'Квест новичка.pdf');assert.equal(sent[0].body.document.sha256,crypto.createHash('sha256').update(pdf).digest('hex'));assert.ok(sent[0].body.caption.includes('Квест новичка'));assert.equal(queue()[id].state,'delivered')})
 await hook('processCommunityOnboarding');await request('/api/telegram/webhook',event(id,start+600000));await hook('processCommunityOnboarding')
 check('repeat ticks and repeated entry events do not resend the PDF',()=>assert.equal(docs().length,1))
 members[manual].status='restricted';members[manual].is_member=true;saveMembers();await request('/api/telegram/webhook',event(manual,start+600000,'left','restricted'));await wait(50)
 check('a manually admitted free resident also receives a job without a payment card',()=>assert.equal(queue()[manual].dueAt,start+1200000))
 members[left].status='member';saveMembers();await request('/api/telegram/webhook',event(left,start+600000));await wait(50);members[left].status='left';saveMembers();await request('/api/telegram/webhook',event(left,start+601000,'member','left'));await wait(50)
 await hook('processCommunityOnboarding',{clock:start+1200000})
 check('the free resident receives the PDF while the resident who left does not',()=>{assert.equal(queue()[manual].state,'delivered');assert.equal(queue()[left].state,'cancelled');assert.equal(docs().filter(c=>c.body.chat_id===left).length,0)})
 users.touchBotUser(members[old].user);users.updateBotUser(old,{communityJoinedAt:start-86400000});members[old].status='member';saveMembers();await request('/api/telegram/webhook',event(old,start+1200000));await wait(50)
 check('a returning historical resident does not receive a new onboarding job',()=>assert.equal(queue()[old],undefined))
 members[blocked].status='member';saveMembers();await request('/api/telegram/webhook',event(blocked,start+1200000));await wait(50);fs.writeFileSync(path.join(root,'document-blocked'),'');await hook('processCommunityOnboarding',{clock:start+1800000})
 check('a blocked private chat is retained for retry, never marked delivered',()=>{assert.equal(queue()[blocked].state,'pending');assert.equal(queue()[blocked].errorCode,'dm_unavailable')})
 fs.rmSync(path.join(root,'document-blocked'));await request('/api/telegram/webhook',{update_id:77003,message:{from:members[blocked].user,chat:{id:Number(blocked),type:'private'},text:'/start'}});await wait(200)
 check('starting the bot resumes the overdue quest delivery',()=>assert.equal(queue()[blocked].state,'delivered'))
 const health=await request('/api/health')
 check('health identifies the installed onboarding feature and PDF readiness',()=>{assert.equal(health.body.communityOnboarding,1);assert.equal(health.body.newcomerQuestReady,true)})
}

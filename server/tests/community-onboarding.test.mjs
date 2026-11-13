import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createCommunityOnboarding,NEWCOMER_DELAY_MS} from '../lib/communityOnboarding.js'
const start=Date.parse('2026-11-13T18:00:00+03:00'),id='900000123'
function fixture(){let data={},at=start,calls=0,state='in',result={ok:true,messageId:42};const deps={load:()=>structuredClone(data),save:x=>{data=structuredClone(x)},now:()=>at,membership:async()=>state,send:async()=>{calls++;return result}};return{deps,get data(){return data},get calls(){return calls},clock:n=>at=n,state:s=>state=s,result:r=>result=r,worker:()=>createCommunityOnboarding(deps)}}
test('no send before ten minutes; the confirmed due task sends exactly once with a caption',async()=>{
 const f=fixture(),w=f.worker();w.joined(id,start);f.clock(start+NEWCOMER_DELAY_MS-1);await w.process();assert.equal(f.calls,0)
 f.clock(start+NEWCOMER_DELAY_MS);await w.process();assert.equal(f.calls,1);assert.equal(f.data[id].state,'delivered');assert.equal(f.data[id].messageId,42)
 await w.process();w.joined(id,start+NEWCOMER_DELAY_MS);await w.process();assert.equal(f.calls,1)
})
test('the due date survives a restart and duplicate join events do not postpone it',async()=>{
 const f=fixture(),first=f.worker();first.joined(id,start);f.clock(start+300000);assert.equal(first.joined(id,start+300000),false);assert.equal(f.data[id].dueAt,start+NEWCOMER_DELAY_MS)
 const second=f.worker();f.clock(start+NEWCOMER_DELAY_MS);await second.process();assert.equal(f.calls,1)
})
test('historical members do not get a new job on rollout, and payments alone cannot enqueue one',async()=>{
 const f=fixture(),w=f.worker();assert.equal(w.joined(id,start,true),false);f.clock(start+20*NEWCOMER_DELAY_MS);await w.process();assert.deepEqual(f.data,{});assert.equal(f.calls,0)
})
test('leaving cancels the job; a return before receiving the quest starts a fresh ten minutes',async()=>{
 const f=fixture(),w=f.worker();w.joined(id,start);f.clock(start+1000);w.left(id,start+1000);f.clock(start+NEWCOMER_DELAY_MS);await w.process();assert.equal(f.calls,0)
 assert.equal(w.joined(id,start+NEWCOMER_DELAY_MS,true),true);f.clock(start+2*NEWCOMER_DELAY_MS-1);await w.process();assert.equal(f.calls,0);f.clock(start+2*NEWCOMER_DELAY_MS);await w.process();assert.equal(f.calls,1)
})
test('fresh membership is required; unknown membership retries and absence cancels without sending',async()=>{
 const f=fixture(),w=f.worker();w.joined(id,start);f.clock(start+NEWCOMER_DELAY_MS);f.state('unknown');await w.process();assert.equal(f.calls,0);assert.equal(f.data[id].state,'pending')
 f.clock(start+NEWCOMER_DELAY_MS+60000);f.state('out');await w.process();assert.equal(f.calls,0);assert.equal(f.data[id].state,'cancelled')
})
test('explicit Telegram rejection retries; starting the bot can resume an overdue blocked DM',async()=>{
 const f=fixture(),w=f.worker();w.joined(id,start);f.clock(start+NEWCOMER_DELAY_MS);f.result({retryable:true,errorCode:'dm_unavailable',retryAfterMs:900000});await w.process();assert.equal(f.data[id].state,'pending');assert.equal(f.calls,1)
 f.result({ok:true,messageId:99});w.contact(id);await w.process();assert.equal(f.calls,2);assert.equal(f.data[id].state,'delivered')
})
test('uncertain response and interrupted send do not automatically duplicate a document',async()=>{
 const f=fixture(),w=f.worker();w.joined(id,start);f.clock(start+NEWCOMER_DELAY_MS);f.result({uncertain:true});await w.process();assert.equal(f.data[id].state,'uncertain');await f.worker().process();assert.equal(f.calls,1)
 const g=fixture();g.worker().joined(id,start);const data=g.deps.load();data[id]={...data[id],state:'sending',sendingAt:start};g.deps.save(data);g.clock(start+NEWCOMER_DELAY_MS);await g.worker().process();assert.equal(g.data[id].state,'uncertain');assert.equal(g.calls,0)
})
test('concurrent ticks cannot send twice and a leave during membership check cancels delivery',async()=>{
 const f=fixture();let release;f.deps.membership=()=>new Promise(r=>release=r);const w=f.worker();w.joined(id,start);f.clock(start+NEWCOMER_DELAY_MS);const first=w.process();await w.process();w.left(id,start+NEWCOMER_DELAY_MS);release('in');await first;assert.equal(f.calls,0)
})
test('the queue participates in existing person-data erasure and retention',async()=>{
 const {SOURCES,TERMS}=await import('../lib/personData.js'),{personKeys}=await import('../lib/consentLog.js')
 const source=SOURCES.find(s=>s.id==='communityOnboarding');assert.ok(source)
 assert.deepEqual(source.keysOf({telegramId:id}),personKeys({tgId:id}));assert.equal(source.hasMoney({}),false)
 assert.equal(source.due({telegramId:id,joinedAt:start,sentAt:start},{now:start+TERMS.botInactive+1,joinBaselineByTg:new Map()}).action,'delete')
})

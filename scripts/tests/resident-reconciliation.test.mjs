import {test} from 'node:test'
import assert from 'node:assert/strict'
import {reconcileResidents,moscowDate,usernameKey} from '../lib/resident-reconciliation.mjs'
import {hasAccess,paidUntil,accessPeriodEnded} from '../../server/lib/subscriptionAccess.js'
import {sameSubscriber,protectedByOtherCard} from '../../server/lib/accessExpiry.js'
import {createAutomationReconciliation} from '../../server/lib/subscriptionAutomation.js'
const now=Date.parse('2026-11-11T12:00:00+03:00')
const row=(key,id='900001',extra={})=>({key,'Телефон':'+79990000001','TG ID':id,ID:'2611878','Стоимость':'350.00','Дата подписки':'2026-10-11 12:00:00','Будущий платеж':'11.12.2026 12:00','Активность (пользователь)':'активна','Активность (менеджер)':'активна',...extra})
const bundle=(csvRows=[],screenshotRows=[],ownerRows=[])=>({version:1,sourceDate:'2026-11-11',csvRows,screenshotRows,ownerRows})
test('every CSV contract survives while identity is deduplicated by Telegram ID, not plan ID',()=>{
 const b=bundle([row('csv:2'),row('csv:3','900001',{'Активность (менеджер)':'деактивирована'}),row('csv:4','900002',{'Телефон':'+79990000002'})])
 const r=reconcileResidents(b,{now});assert.equal(r.rows.length,2);assert.equal(r.rows[0].contracts.length,2);assert.equal(r.coverage.accountedRows,3);assert.equal(r.coverage.uniqueCsvTelegramIds,2)
 assert.equal(r.registry.authorizations['2611878'],undefined)
 assert.equal(r.rows[0].lastRecordedPayment,null);assert.equal(r.rows[0].payments.length,0)
 assert.equal(r.registry.authorizations['900001'].until,moscowDate('11.12.2026 12:00'))
})
test('all screenshot rows survive, shared phone and name never choose a person',()=>{
 const images=[{key:'image:1',name:'A',usernameRaw:'alpha_person',phone:'79990000001',kind:'paid',amount:350},{key:'image:2',name:'B',usernameRaw:'bravo_person',phone:'79990000001',kind:'paid',amount:350}]
 const r=reconcileResidents(bundle([row('csv:2')],images),{now})
 assert.equal(r.rows.length,3);assert.equal(r.coverage.accountedRows,3)
 assert.equal(r.rows.find(e=>e.name==='A').telegramId,null)
})
test('old Ksenia ID remains separate from the CSV ID even with an identical phone',()=>{
 const r=reconcileResidents(bundle([row('csv:2','900002')],[{key:'image:1',name:'K',phone:'79990000001',usernameRaw:'ksenia_person',kind:'paid',amount:350}],[{key:'owner:k',name:'K',phone:'79990000001',telegramId:'900001',kind:'paid'}]),{now})
 assert.equal(r.rows.length,2);assert.equal(r.rows.find(e=>e.telegramId==='900002').evidence.length,2);assert.equal(r.rows.find(e=>e.telegramId==='900001').evidence.length,1)
})
test('free and ambassador IDs require a fresh matching username; stale bot contact is insufficient',()=>{
 const b=bundle([],[{key:'image:free:1',name:'F',usernameRaw:'free_person',kind:'free',amount:0}])
 const users=[{id:'900001',username:'@free_person'}]
 const pending=reconcileResidents(b,{users,now});assert.deepEqual(pending.registry.authorizations,{})
 const stale=reconcileResidents(b,{users,now,memberships:{'900001':{ok:true,result:{status:'member',user:{id:900001,username:'changed_person'}}}}});assert.deepEqual(stale.registry.authorizations,{})
 const valid=reconcileResidents(b,{users,now,memberships:{'900001':{ok:true,result:{status:'member',user:{id:900001,username:'free_person'}}}}});assert.equal(valid.rows[0].presence,'in');assert.equal(valid.registry.authorizations['900001'].kind,'free')
})
test('a disabled contract and a formerly absent person do not receive an automatic permission',()=>{
 const r=reconcileResidents(bundle([row('csv:2','900001',{'Активность (менеджер)':'деактивирована','Будущий платеж':'—'}),row('csv:3','900002')],[],[{key:'owner:old',telegramId:'900002',kind:'former'}]),{now})
 assert.deepEqual(r.registry.authorizations,{})
})
test('invalid screenshot usernames remain source evidence, never guessed by dropping a suffix',()=>{
 assert.equal(usernameKey('@person:16:40'),null)
 const r=reconcileResidents(bundle([],[{key:'image:1',name:'A',usernameRaw:'person:16:40',kind:'paid',amount:690}]),{now})
 assert.equal(r.coverage.accountedRows,1);assert.equal(r.rows[0].username,'не найден');assert.ok(r.rows[0].issues.includes('invalid_screenshot_username'))
})
test('dates are parsed in Moscow, malformed dates and duplicate source keys fail closed',()=>{
 assert.equal(moscowDate('11.12.2026 12:00'),Date.parse('2026-12-11T12:00:00+03:00'))
 assert.throws(()=>moscowDate('31.02.2026 12:00'))
 assert.throws(()=>reconcileResidents(bundle([row('csv:2'),row('csv:2')]),{now}))
})
test('owner roster permissions expire at the boundary without creating a paid period',()=>{
 const until=now+1000,j={tgUserId:'900001',status:'active',paid:false,ownerAccess:{active:true,source:'owner_roster_20261111',telegramId:'900001',until,kind:'provider_snapshot_access'}}
 assert.equal(hasAccess(j,now),true);assert.equal(hasAccess(j,until),false);assert.equal(paidUntil(j),null)
 assert.equal(hasAccess({...j,tgUserId:'900002'},now),false)
 assert.equal(hasAccess({...j,ownerAccess:{...j.ownerAccess,until:null,kind:'free'}},until+1),true)
})
test('a separate grant protects only the matching Telegram person, despite a shared phone',()=>{
 const old={token:'old',tgUserId:'900001',phone:'79990000001',paid:true,status:'active',nextPaymentAt:now-10*86400000}
 const grant={token:'grant',tgUserId:'900001',phone:'79990000001',paid:false,ownerAccess:{active:true,source:'owner_roster_20261111',telegramId:'900001',until:now+1000}}
 assert.equal(protectedByOtherCard(old,[old,grant],now),true)
 assert.equal(sameSubscriber(old,{...grant,tgUserId:'900002'}),false)
 assert.equal(protectedByOtherCard(old,[old,{...grant,tgUserId:'900002',ownerAccess:{...grant.ownerAccess,telegramId:'900002'}}],now),false)
 assert.equal(accessPeriodEnded(old,now),true)
})
test('explicit demo payments stay in evidence but never enter real payment totals',()=>{
 const cards=[{token:'demo',tgUserId:'900001',paid:true,demo:true,payments:[{at:now,amount:690,orderKey:'DEMO-X'}]}]
 const r=reconcileResidents(bundle(),{cards,now});assert.equal(r.rows[0].category,'test_or_demo');assert.equal(r.rows[0].payments.length,0);assert.deepEqual(r.registry.authorizations,{})
})
test('a current verified receipt retires roster payment review, while free membership survives',async()=>{
 const paid={token:'paid',tgUserId:'900001',paid:true,status:'active',lastPaidAt:now-1000,nextPaymentAt:now+86400000,payments:[{at:now-1000,amount:350,subscriptionId:'2611878',orderKey:'real'}]}
 const grant=kind=>({token:kind,tgUserId:'900001',ownerAccess:{active:true,source:'owner_roster_20261111',kind,until:null,telegramId:'900001'}})
 const temporary=grant('owner_roster_pending_payment_review'),free=grant('free'),cards=[paid,temporary,free]
 const records=[{verified:true,body:{payment_status:'success',date:new Date(now-1000).toISOString(),sum:'350',order_id:'real',tg_user_id:'900001',subscription:{id:'2611878'}}}]
 const task=createAutomationReconciliation({list:()=>cards,records:()=>records,apply:async()=>assert.fail('already in ledger'),patch:(key,fields)=>Object.assign(cards.find(c=>c.token===key),fields),expectedEnd:()=>now+86400000,now:()=>now})
 const r=await task();assert.equal(r.ok,true);assert.equal(temporary.ownerAccess.active,false);assert.equal(free.ownerAccess.active,true);assert.equal(paid.payments.length,1)
})

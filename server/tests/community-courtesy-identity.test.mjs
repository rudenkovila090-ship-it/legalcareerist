import {test} from 'node:test'
import assert from 'node:assert/strict'
import {repairCommunityCards} from '../lib/communityMaintenance.js'
function fixture({id='376201355',name='Шемонаева Анастасия',status='member'}={}){
 const history=[{at:1,amount:350,subscriptionId:'legacy',orderKey:'real-old'}]
 const cards=[{token:'old',tgUserId:id,name,paid:true,status:'active',payments:history,nextPaymentAt:1}],users=[{id,firstName:'Анастасия 🔥',tags:['бывший_резидент']}]
 const work=()=>repairCommunityCards({list:()=>cards,users:()=>users,member:async()=>({status,user:{id:Number(id),first_name:'Анастасия 🔥'}}),bind:()=>{},patch:(t,f)=>Object.assign(cards.find(c=>c.token===t),f),createLifetime:p=>{cards.push({...p,token:'free',paid:true,status:'active',lifetime:true,payments:[]});return'free'},updateUser:(_id,f)=>Object.assign(users[0],f),now:()=>100})
 return{cards,users,work,history}
}
test('confirmed ID and actual surname create one complimentary 350 grant without rewriting money',async()=>{const f=fixture(),before=structuredClone(f.history);assert.equal((await f.work()).complimentary,'lifetime_nominal_350');assert.equal(f.cards[1].name,'Шемонаева Анастасия');assert.equal(f.cards[1].complimentary.nominalAmount,350);assert.deepEqual(f.cards[1].payments,[]);assert.deepEqual(f.cards[0].payments,before);await f.work();assert.equal(f.cards.length,2)})
test('other residents with the same name are not granted this owner exception',async()=>{const f=fixture({id:'199962895'});assert.equal((await f.work()).complimentary,'not_found');assert.equal(f.cards.length,1)})
test('numeric ID with conflicting stored identity does not receive a grant',async()=>{const f=fixture({name:'Другой человек'});assert.equal((await f.work()).complimentary,'not_found')})
test('a previously removed target gets a durable service invitation, without a payment receipt',async()=>{const f=fixture({status:'left'});await f.work();assert.equal(f.cards[1].inChat,false);assert.equal(f.cards[1].inviteDelivery.pending,true);assert.equal(f.cards[1].inviteDelivery.mailPending,false);f.cards[1].inviteDelivery.pending=false;await f.work();assert.equal(f.cards[1].inviteDelivery.pending,false)})
test('a grant ended by departure is not resurrected by rerunning maintenance',async()=>{const f=fixture();await f.work();f.cards[1].lifetime=false;f.cards[1].complimentary.revokedAt=200;assert.equal((await f.work()).complimentary,'grant_ended_on_departure');assert.equal(f.cards.length,2)})

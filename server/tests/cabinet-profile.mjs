import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { hashPassword } from '../lib/password.js'
const repo = fileURLToPath(new URL('../..', import.meta.url)), root = fs.mkdtempSync(path.join(os.tmpdir(), 'cabinet-profile-'))
fs.mkdirSync(path.join(root,'server/data'), { recursive: true })
fs.writeFileSync(path.join(root,'package.json'), '{"type":"module"}')
fs.cpSync(path.join(repo,'server/lib'), path.join(root,'server/lib'), { recursive: true })
fs.cpSync(path.join(repo,'server/content'), path.join(root,'server/content'), { recursive: true })
fs.copyFileSync(path.join(repo,'server/index.js'), path.join(root,'server/index.js'))
fs.symlinkSync(path.join(repo,'server/node_modules'), path.join(root,'server/node_modules'))
const file = n => path.join(root,'server/data',n), write = (n,v) => fs.writeFileSync(file(n),JSON.stringify(v))
const now = Date.now(), password = 'Synthetic-Cabinet-2026!', aid='a'.repeat(16), bid='b'.repeat(16)
write('accounts.json', Object.fromEntries([[aid,'alpha'],[bid,'beta']].map(([id,name])=>[id,{id,email:name+'@example.invalid',name,passwordHash:hashPassword(password),verifiedAt:now,createdAt:now}])))
write('pending-joins.json', { fixture: { token:'fixture',email:'alpha@example.invalid',paid:true,status:'active',tariffId:'1m',nextPaymentAt:now+86400000*30,payments:[{at:now,amount:500,subscriptionId:'2611880'}] } })
const moneyBefore=fs.readFileSync(file('pending-joins.json'))
const users = await import(pathToFileURL(path.join(root,'server/lib/accountUsers.js')))
let child, logs=''
const pause=ms=>new Promise(r=>setTimeout(r,ms))
try {
 assert.equal(users.requestContactEmail(aid,'next@example.invalid','incorrect',now).error,'bad_password')
 let change=users.requestContactEmail(aid,'next@example.invalid',password,now)
 assert.match(change.code,/^[0-9]{8}$/)
 assert.ok(!fs.readFileSync(file('accounts.json'),'utf8').includes(change.code))
 assert.equal(users.confirmContactEmail(bid,change.code,now+1).error,'bad_code')
 assert.equal(users.confirmContactEmail(aid,change.code,now+600001).error,'bad_code')
 assert.equal(users.confirmContactEmail(aid,change.code,now+2).email,'next@example.invalid')
 assert.equal(users.confirmContactEmail(aid,change.code,now+3).error,'bad_code')
 assert.equal(users.getAccount(aid).email,'alpha@example.invalid')
 change=users.requestContactEmail(aid,'again@example.invalid',password,now+61000)
 for(let i=0;i<5;i++) assert.equal(users.confirmContactEmail(aid,'not-a-code',now+61001+i).error,'bad_code')
 assert.equal(users.confirmContactEmail(aid,change.code,now+61010).error,'bad_code')
 console.log('PASS verified contact email: password, account binding, expiry, one-time code, attempt limit; billing login retained')
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r))
 const env={PATH:process.env.PATH,HOME:root,PORT:String(port),SITE_URL:'http://127.0.0.1:'+port,TELEGRAM_POLLING:'0',DISABLE_DAILY_REPORT:'1',DISABLE_BACKUP:'1',AUTO_EXCLUDE:'0',AUTO_RESIDENT_REMINDERS:'0',EXPIRY_NOTICES:'0',RETENTION_AUTO:'0'}
 child=spawn(process.execPath,[path.join(root,'server/index.js')],{cwd:path.join(root,'server'),env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b)
 const origin='http://127.0.0.1:'+port
 async function request(route,method='GET',body,token){const r=await fetch(origin+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
 let ready=false;for(let i=0;i<120;i++){try { if((await request('/api/health')).status===200){ready=true;break} }catch{}await pause(50)}assert.ok(ready,logs)
 const login=async(name)=>(await request('/api/account/login','POST',{login:name+'@example.invalid',password})).data.token
 const a=await login('alpha'), b=await login('beta');assert.ok(a&&b)
 assert.equal((await request('/api/account/profile')).status,401)
 const contact={id:'contact_123',name:'Test Contact',company:'Test Firm',role:'Lawyer',email:'contact@example.invalid',phone:'+70000000000',telegram:'@test',metWhere:'Conference',notes:'Private note'}
 let r=await request('/api/account/profile','PUT',{networking:{intro:'About me',contacts:[contact],version:0}},a)
 assert.equal(r.data.error,'consent_required')
 r=await request('/api/account/profile','PUT',{networking:{intro:'About me',contacts:[contact],version:0},consent:{processing:true,policy:true}},a)
 assert.equal(r.data.profile.networking.version,1)
 assert.deepEqual((await request('/api/account/profile','GET',undefined,a)).data.profile.networking.contacts,[contact])
 assert.deepEqual((await request('/api/account/profile','GET',undefined,b)).data.profile.networking.contacts,[])
 r=await request('/api/account/profile','PUT',{networking:{intro:'stale',contacts:[],version:0}},a);assert.equal(r.data.error,'profile_conflict')
 r=await request('/api/account/profile','PUT',{networking:{intro:'updated',contacts:[{...contact,notes:'Edited note'}],version:1}},a);assert.equal(r.data.profile.networking.contacts[0].notes,'Edited note')
 r=await request('/api/account/profile','PUT',{networking:{intro:'updated',contacts:[],version:2}},a);assert.equal(r.data.profile.networking.contacts.length,0)
 const bulk=Array.from({length:100},(_,i)=>({...contact,id:'bulk_contact_'+i,notes:'Заметка'.repeat(280)}))
 r=await request('/api/account/profile','PUT',{networking:{intro:'bulk',contacts:bulk,version:3}},a);assert.equal(r.status,200);assert.equal(r.data.profile.networking.contacts.length,100)
 r=await request('/api/account/profile','PUT',{networking:{intro:'',contacts:[],version:4}},a);assert.equal(r.data.profile.networking.version,5)
 console.log('PASS private address book payload larger than default 100KB JSON limit')
 assert.equal((await request('/api/account/contact-email/request','POST',{email:'new@example.invalid',password},a)).data.error,'mail_unavailable')
 assert.deepEqual(fs.readFileSync(file('pending-joins.json')),moneyBefore)
 assert.equal((await request('/api/account/me','GET',undefined,a)).data.resident.status,'active')
 assert.equal((await request('/api/account/me','GET',undefined,a)).data.contact.email,'next@example.invalid')
 const accountsForMail=JSON.parse(fs.readFileSync(file('accounts.json'),'utf8'));delete accountsForMail[aid].contactEmailPending;write('accounts.json',accountsForMail)
 const routes = new Map(); const { registerContactEmail } = await import(pathToFileURL(path.join(root,'server/lib/accountEmail.js')))
 const sent = []; registerContactEmail({ post: (route, handler) => routes.set(route, handler) }, { requireAccount: () => ({ login:'u:'+aid }), mailConfigured: () => true, sendMail: async message => { sent.push(message); return { ok:true } } })
 const response = { code:200, status(v){this.code=v;return this}, json(v){this.body=v;return this} }
 await routes.get('/api/account/contact-email/request')({ body:{email:'confirmed@example.invalid',password} },response)
 assert.equal(response.body.ok,true); assert.equal(sent.length,1); assert.ok(!JSON.stringify(response.body).includes('Код подтверждения'))
 const code=sent[0].text.match(/[0-9]{8}/)[0]
 routes.get('/api/account/contact-email/confirm')({ body:{code} },response); assert.equal(response.body.email,'confirmed@example.invalid')
 console.log('PASS email routes with fake mail: code delivered once, response omits code, confirmation succeeds')
 const demoRoutes=new Map(), previousDemo=process.env.RESIDENT_DEMO_MODE;process.env.RESIDENT_DEMO_MODE='1'
 registerContactEmail({post:(route,handler)=>demoRoutes.set(route,handler)},{requireAccount:()=>{throw Error('Demo reached account mutation')},mailConfigured:()=>true,sendMail:async()=>{throw Error('Demo sent a real email')}})
 if(previousDemo===undefined)delete process.env.RESIDENT_DEMO_MODE;else process.env.RESIDENT_DEMO_MODE=previousDemo
 const accountsBeforeDemo=fs.readFileSync(file('accounts.json'))
 for(const handler of demoRoutes.values()){await handler({body:{email:'demo@example.invalid',password,code:'12345678'}},response);assert.equal(response.code,403);assert.equal(response.body.error,'demo_shared_account')}
 assert.deepEqual(fs.readFileSync(file('accounts.json')),accountsBeforeDemo)
 console.log('PASS both demo email routes blocked without modifying legacy sandbox, sending mail or changing accounts')
 console.log('PASS HTTP: authentication, private address book CRUD, reload, account isolation, conflict protection, billing untouched')
 if(process.argv.includes('--serve')) { fs.mkdirSync('/tmp/cabinet-redesign',{recursive:true});fs.writeFileSync('/tmp/cabinet-redesign/fixture.json',JSON.stringify({origin,token:a,root}));console.log('FIXTURE_READY '+origin);await new Promise(resolve=>{process.on('SIGTERM',resolve);process.on('SIGINT',resolve)}) }
} finally {if(child){child.kill('SIGTERM');await pause(100)}fs.rmSync(root,{recursive:true,force:true})}

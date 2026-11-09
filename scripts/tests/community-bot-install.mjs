import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const repo=fileURLToPath(new URL('../..',import.meta.url)),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'community-bot-install-'))
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'updates/community-bot/manifest.json')))
const write=(f,b)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,b)}
let checks=0
async function scenario(kind){
 const root=path.join(tmp,kind),bin=path.join(root,'bin'),cmds=path.join(root,'commands.jsonl'),apps=[],original=[]
 for(const [i,name]of ['legalcareerist-api','legalcareerist-resident-demo'].entries()){
  const server=path.join(root,name,'server');write(path.join(server,'package.json'),'{"type":"module"}');write(path.join(server,'data/pending-joins.json'),'{}');write(path.join(server,'data/bot-users.json'),'{}');write(path.join(server,'data/payments.json'),'SYNTHETIC MONEY HISTORY');write(path.join(server,'lib/protected.js'),'export const untouched=true\n')
  for(const f of manifest.backend){
   if(f.edits){let s=fs.readFileSync(path.join(repo,'server',f.path),'utf8');for(const [a,b]of [...f.edits].reverse()){assert.equal(s.split(b).length,2,'Reverse patch '+b.slice(0,60));s=s.replace(b,a)}if(kind==='unknown-source')s=s.replace('async function sendInviteLink(chatId, join) {','async function sendInviteLink(chatId, changed) {');write(path.join(server,f.path),s)}
   else if(f.beforeSha256[0]!==null)write(path.join(server,f.path),fs.readFileSync(path.join(repo,'scripts/tests/fixtures/community-bot-before',path.basename(f.path))))
   const file=path.join(server,f.path);original.push({file,before:fs.existsSync(file)?fs.readFileSync(file):null})
  }
  apps.push({name,pid:100+i,pm2_env:{status:'online',pm_exec_path:path.join(server,'index.js'),PORT:0,PRODAMUS_SECRET_KEY:'SYNTHETIC_PRIVATE_KEY',TELEGRAM_BOT_TOKEN:'SYNTHETIC_ONLY',COMMUNITY_CHAT_ID:'-100900000001',COMMUNITY_INVITE_LINK:'https://t.me/+SYNTHETIC',AUTO_EXCLUDE:'1',SITE_URL:''}})
 }
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json')
  const updated=fs.readFileSync(apps[0].pm2_env.pm_exec_path,'utf8').includes('subscriptionExpiry: 3,')
  if(req.url==='/api/health'){res.end(JSON.stringify({ok:!(kind==='health-failure'&&updated),subscriptionExpiry:updated?3:2,automaticProviderCancellation:!updated}));return}
  if(req.url==='/api/community/subscribe'||req.url==='/api/prodamus/webhook'){res.statusCode=400;res.end(JSON.stringify({ok:false,error:req.url.includes('subscribe')?'consent_required':'invalid_signature'}));return}
  if(req.url==='/api/internal/subscription-policy'){req.resume();req.on('end',()=>res.end(JSON.stringify({ok:true,complimentary:'not_found',financialHistoryReplaced:false})));return}
  res.statusCode=404;res.end('{}')
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port
 for(const a of apps){a.pm2_env.PORT=port;a.pm2_env.SITE_URL='http://127.0.0.1:'+port}
 write(path.join(root,'pm2.json'),JSON.stringify(apps));write(path.join(bin,'package.json'),'{"type":"module"}')
 write(path.join(bin,'pm2'),`#!/usr/bin/env node\nimport fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(cmds)},JSON.stringify(args)+'\\n');if(args[0]==='jlist')process.stdout.write(fs.readFileSync(${JSON.stringify(path.join(root,'pm2.json'))}));else if(${JSON.stringify(kind)}==='restart-failure'&&args[0]==='restart'&&!fs.existsSync(${JSON.stringify(path.join(root,'failed'))})){fs.writeFileSync(${JSON.stringify(path.join(root,'failed'))},'1');process.exit(1)}\n`);fs.chmodSync(path.join(bin,'pm2'),0o755)
 const stub=path.join(root,'outbound.mjs');write(stub,`const original=globalThis.fetch;globalThis.fetch=(url,options)=>{if(new URL(String(url)).hostname==='api.telegram.org'){const method=new URL(String(url)).pathname.split('/').at(-1);return Promise.resolve(Response.json({ok:true,result:method==='getMe'?{id:900000001,username:'synthetic_bot'}:method==='getWebhookInfo'?{pending_update_count:0}:{status:'administrator',can_invite_users:true,can_restrict_members:true}}))}return original(url,options)}\n`)
 const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,NODE_OPTIONS:'--import '+stub,BOT_FIX_BACKUP_ROOT:path.join(root,'backups')}
 const install=()=>new Promise(resolve=>{const child=spawn(process.execPath,[path.join(repo,'scripts/install-community-bot-fix.mjs'),path.join(repo,'updates/community-bot')],{env});let out='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>out+=b);child.on('close',code=>resolve({code,out}))})
 try{
  let result=await install();assert.ok(!result.out.includes('SYNTHETIC_PRIVATE_KEY'),result.out)
  if(kind==='success'){assert.equal(result.code,0,result.out);assert.ok(result.out.includes('BOT_FIX_READY'));result=await install();assert.equal(result.code,0,result.out);for(const a of apps){const text=fs.readFileSync(a.pm2_env.pm_exec_path,'utf8');assert.equal(text.split("import { createCommunityAdmission }").length,2)}}
  else{assert.equal(result.code,1,result.out);for(const f of original)assert.deepEqual(fs.existsSync(f.file)?fs.readFileSync(f.file):null,f.before,f.file)}
  for(const a of apps){const server=path.dirname(a.pm2_env.pm_exec_path);assert.equal(fs.readFileSync(path.join(server,'data/payments.json'),'utf8'),'SYNTHETIC MONEY HISTORY');assert.equal(fs.readFileSync(path.join(server,'lib/protected.js'),'utf8'),'export const untouched=true\n')}
  console.log('PASS bot installer '+kind+': code guards, both runtimes, idempotence/rollback, immutable financial history and no secret output');checks++
 }finally{await new Promise(r=>server.close(r))}
}
try{for(const kind of ['success','unknown-source','restart-failure','health-failure'])await scenario(kind);console.log(checks+' bot installation scenarios passed')}finally{fs.rmSync(tmp,{recursive:true,force:true})}

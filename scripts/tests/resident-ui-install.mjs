import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const repo=fileURLToPath(new URL('../..',import.meta.url)),temp=fs.mkdtempSync(path.join(os.tmpdir(),'resident-ui-install-'))
const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data)}
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'updates/resident-ui/manifest.json')))
const installer=path.join(repo,'scripts/install-resident-ui.mjs')
let checks=0
async function scenario(kind){
 const root=path.join(temp,kind),site=path.join(root,'site'),builds=path.join(root,'builds'),publicRoot=path.join(root,'public-releases'),conf=path.join(root,'nginx.conf'),bin=path.join(root,'bin'),log=path.join(root,'commands.jsonl')
 for(const d of ['src','scripts','public','dist','node_modules'])fs.mkdirSync(path.join(site,d),{recursive:true})
 write(path.join(site,'package.json'),'{"type":"module"}')
 write(path.join(site,'dist/index.html'),'<html>ORIGINAL</html>')
 write(conf,'server {\n server_name legalcareerist.ru;\n root '+path.join(site,'dist')+';\n}\n')
 const configBefore=fs.readFileSync(conf),apps=[]
 for(const [i,name]of ['legalcareerist-api','legalcareerist-resident-demo'].entries()){
  const appRoot=path.join(root,name,'server');fs.mkdirSync(path.join(appRoot,'data'),{recursive:true});fs.mkdirSync(path.join(appRoot,'lib'))
  write(path.join(appRoot,'package.json'),'{"type":"module"}')
  for(const f of manifest.backend.filter(f=>f.edits)){
   let before
   if(f.path==='lib/residentDemo.js')before=fs.readFileSync(path.join(repo,'server/lib/residentDemo.js'),'utf8').replace("['/api/account/contact-email/request', '/api/account/contact-email/confirm', '/api/account/password',","['/api/account/password',")
   else before=execFileSync('git',['show','HEAD:server/'+f.path],{cwd:repo,encoding:'utf8'})
   if(kind==='unknown-source'&&f.path==='index.js')before=before.replace('import { startRegistration, startReset','import { startRegistration, /* changed */ startReset')
   write(path.join(appRoot,f.path),before)
  }
  write(path.join(appRoot,'lib/residentDemo.js'), '// Arbitrary existing minified sandbox; installer must preserve every byte\nexport const legacySandbox=()=>true;\n')
  write(path.join(appRoot,'lib/protected-billing.js'),'export const paid = true\n')
  write(path.join(appRoot,'data/payments.json'),'SYNTHETIC FINANCIAL HISTORY')
  write(path.join(appRoot,'data/event-catalog.json'),JSON.stringify([{slug:'dzhazovyy-vecher-dlya-yuristov-2',title:'Jazz fixture',price:2490,registrationLink:'',tariffs:[{id:'light',name:'Билет',price:2490}]},{slug:'unrelated-fixture',price:500,tariffs:[]}]))
  write(path.join(appRoot,'.env'),'SYNTHETIC_SECRET=do-not-log')
  apps.push({name,pid:i+100,pm2_env:{status:'online',pm_exec_path:path.join(appRoot,'index.js'),pm_cwd:appRoot,PORT:0}})
 }
 const beforeFiles=apps.flatMap(a=>manifest.backend.map(f=>{const file=path.join(path.dirname(a.pm2_env.pm_exec_path),f.path);return {file,body:fs.existsSync(file)?fs.readFileSync(file):null}}))
 const server=http.createServer((req,res)=>{
  if(/^\/api\/event\/[^/]+\/(promo|checkout)$/.test(req.url)){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,error:kind==='checkout-stale'?'not_for_sale':req.url.endsWith('/promo')?'invalid_promo':'consent_required'}));return}
  if(req.url.startsWith('/api/health')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,autoExclude:true,graceDays:4,cardBlockHours:72,providerStopBeforeRemoval:true}));return}
  const folder=/^\s*root\s+([^;]+);/m.exec(fs.readFileSync(conf,'utf8'))[1]
  const requested=path.join(folder,req.url.split('?')[0]);const file=fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(folder,'index.html')
  if(kind==='public-failure'&&!fs.readFileSync(conf).equals(configBefore)){res.end('old cache');return}
  if(!fs.existsSync(file)){res.statusCode=404;res.end();return}res.end(fs.readFileSync(file))
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port
 for(const app of apps)app.pm2_env.PORT=port
 write(path.join(root,'pm2.json'),JSON.stringify(apps))
 const common=`#!/usr/bin/env node\nimport fs from 'node:fs';import path from 'node:path';const root=${JSON.stringify(root)},args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({cmd:path.basename(process.argv[1]),args})+'\\n');\n`
 write(path.join(bin,'package.json'),'{"type":"module"}')
 write(path.join(bin,'pm2'),common+`if(args[0]==='jlist')process.stdout.write(fs.readFileSync(path.join(root,'pm2.json')));else if(${JSON.stringify(kind)}==='restart-failure'&&!fs.existsSync(path.join(root,'restart.failed'))){fs.writeFileSync(path.join(root,'restart.failed'),'1');process.exit(1)}`)
 write(path.join(bin,'nginx'),common+`if(args[0]==='-T')process.stdout.write('# configuration file '+${JSON.stringify(conf)}+':\\n'+fs.readFileSync(${JSON.stringify(conf)},'utf8'))`)
 write(path.join(bin,'npm'),common+`if(${JSON.stringify(kind)}==='build-failure')process.exit(1);const dest=path.join(process.cwd(),'dist');fs.mkdirSync(path.join(dest,'assets'),{recursive:true});fs.cpSync(path.join(process.cwd(),'public'),dest,{recursive:true});fs.writeFileSync(path.join(dest,'index.html'),'<html><script src="/assets/index-release.js"></script></html>');fs.writeFileSync(path.join(dest,'assets/index-release.js'),${JSON.stringify(['https://legalcareerist.mave.digital/ep-19','https://legalcareerist.mave.digital/ep-22','/api/account/contact-email/request','Моя записная книжка'].join('\n'))});`)
 const fakeNpm=path.join(bin,'npm');fs.appendFileSync(fakeNpm,`fs.mkdirSync(path.join(process.cwd(),'server/data'),{recursive:true});fs.writeFileSync(path.join(process.cwd(),'server/data/event-catalog.json'),${JSON.stringify(JSON.stringify((manifest.catalogUpdates||[]).map(u=>({...u,tariffs:[{id:'light',name:'Билет',price:u.price}]}))))});`);
 for(const name of ['pm2','nginx','npm'])fs.chmodSync(path.join(bin,name),0o755)
 const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,UI_SITE_ROOT:site,UI_BUILD_ROOT:builds,UI_PUBLIC_ROOT:publicRoot,UI_PUBLIC_URL:'http://127.0.0.1:'+port}
 async function install(){return await new Promise(resolve=>{let output='';const c=spawn(process.execPath,[installer,path.join(repo,'updates/resident-ui')],{env});c.stdout.on('data',b=>output+=b);c.stderr.on('data',b=>output+=b);c.on('close',code=>resolve({code,output}))})}
 try{
  let r=await install();assert.ok(!r.output.includes('do-not-log'),r.output)
  if(kind==='success'){
   assert.equal(r.code,0,r.output);assert.ok(r.output.includes('ОБНОВЛЕНИЕ_ГОТОВО'))
   for(const app of apps){const base=path.dirname(app.pm2_env.pm_exec_path);assert.ok(fs.readFileSync(path.join(base,'index.js'),'utf8').includes('registerContactEmail(app'));assert.ok(fs.existsSync(path.join(base,'lib/accountEmail.js')))}
   r=await install();assert.equal(r.code,0,r.output)
   for(const app of apps){const value=fs.readFileSync(app.pm2_env.pm_exec_path,'utf8');assert.equal(value.split("import { registerContactEmail }").length,2);assert.equal(value.split('registerContactEmail(app').length,2)}
   console.log('PASS installation: frontend build, both API runtimes, protected data, public verification and idempotent rerun')
  }else{
   assert.equal(r.code,1,r.output);assert.deepEqual(fs.readFileSync(conf),configBefore)
   for(const f of beforeFiles)assert.deepEqual(fs.existsSync(f.file)?fs.readFileSync(f.file):null,f.body,f.file)
   console.log('PASS installation failure '+kind+': original site and API code preserved/restored')
  }
  for(const app of apps){const base=path.dirname(app.pm2_env.pm_exec_path);const catalog=JSON.parse(fs.readFileSync(path.join(base,'data/event-catalog.json')));const jazz=catalog.find(e=>e.slug==='dzhazovyy-vecher-dlya-yuristov-2');assert.equal(jazz.price,kind==='success'?3990:2490);assert.equal(jazz.tariffs[0].price,kind==='success'?3990:2490);assert.equal(jazz.collectTicketLead,kind==='success'?true:undefined);assert.equal(jazz.registrationLink,kind==='success'?'https://payform.ru/obcMOZJ/':'');assert.deepEqual(catalog.find(e=>e.slug==='unrelated-fixture'),{slug:'unrelated-fixture',price:500,tariffs:[]});assert.equal(fs.readFileSync(path.join(base,'data/payments.json'),'utf8'),'SYNTHETIC FINANCIAL HISTORY');assert.equal(fs.readFileSync(path.join(base,'.env'),'utf8'),'SYNTHETIC_SECRET=do-not-log');assert.equal(fs.readFileSync(path.join(base,'lib/protected-billing.js'),'utf8'),'export const paid = true\n');assert.equal(fs.readFileSync(path.join(base,'lib/residentDemo.js'),'utf8'),'// Arbitrary existing minified sandbox; installer must preserve every byte\nexport const legacySandbox=()=>true;\n')}
  checks++
 }finally{await new Promise(r=>server.close(r))}
}
try{for(const kind of ['success','unknown-source','build-failure','restart-failure','public-failure','checkout-stale'])await scenario(kind);console.log(checks+' release-installation scenarios passed')}finally{fs.rmSync(temp,{recursive:true,force:true})}

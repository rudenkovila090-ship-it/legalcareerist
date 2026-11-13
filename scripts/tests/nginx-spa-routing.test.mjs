import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {patchSpaFallback,nginxRoutingChanges,applyRoutingChanges,directoryIndexEvidence} from '../lib/nginx-spa-routing.mjs'

const config=(host,root,port='443')=>`server { listen ${port} ssl; server_name ${host}; root "${root}";
location /api/ { proxy_pass http://127.0.0.1:3001; }
location / { add_header X-Test "unchanged"; try_files $uri $uri/ /index.html; }
location ~ /private { deny all; } }`
test('only matching HTTPS SPA directory fallback is changed, API and restrictions are preserved',()=>{
  const target=config('legalcareerist.ru','/site/dist'),other=config('other.test','/site/dist'),http=config('legalcareerist.ru','/site/dist','80')
  const source=target+'\n'+other+'\n'+http
  const patched=patchSpaFallback(source,'legalcareerist.ru','/site/dist')
  assert.equal(patched.count,1)
  assert.equal(patched.after,target.replace('try_files $uri $uri/ /index.html','try_files $uri /index.html')+'\n'+other+'\n'+http)
  assert.equal(patchSpaFallback(patched.after,'legalcareerist.ru','/site/dist').count,0)
  for(const query of ['?$args','?$query_string']){
    const withQuery=target.replace('/index.html;','/index.html'+query+';')
    assert.equal(patchSpaFallback(withQuery,'legalcareerist.ru','/site/dist').after,withQuery.replace('$uri/ ',''))
  }
  for(const unknown of [target.replace('/index.html;','@backend;'),target.replace('location / {','location / { proxy_pass http://example.test;'),target.replace('location / {','location / { alias /somewhere;')])assert.equal(patchSpaFallback(unknown,'legalcareerist.ru','/site/dist').count,0)
})
test('only fresh directory-index errors for this events directory and hostname authorize the repair',()=>{
  const now=new Date(),timestamp=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('/')+' '+[now.getHours(),now.getMinutes(),now.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':')
  const line=timestamp+' [error] directory index of "/site/dist/events/" is forbidden, server: legalcareerist.ru, request: "GET /events/ HTTP/1.1"'
  assert.equal(directoryIndexEvidence(line,['/site/dist'],'legalcareerist.ru',Date.now()),true)
  for(const changed of [line.replace('/site/dist/events/','/private/events/'),line.replace('server: legalcareerist.ru','server: other.test'),line.replace('GET /events/','GET /other/'),line.replace(/^\d{4}/,'2000'),line.replace('directory index of','access forbidden by rule')])assert.equal(directoryIndexEvidence(changed,['/site/dist'],'legalcareerist.ru',Date.now()),false)
})
test('config backup, validation, reload and idempotence use loaded source files and preserve mode',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nginx-route-'))
  try{
    const file=path.join(root,'site.conf'),before=config('legalcareerist.ru',root),calls=[]
    fs.writeFileSync(file,before,{mode:0o640})
    fs.chmodSync(file,0o640)
    const dump='# configuration file '+file+':\n'+before+'\n'
    const changes=nginxRoutingChanges(dump,'legalcareerist.ru',root)
    assert.equal(changes.length,1)
    // chown to our existing uid/gid works without root too.
    assert.equal(await applyRoutingChanges(changes,{backup:root,run:(name,args)=>{calls.push(args);return {status:0}},verify:()=>true}),1)
    assert.deepEqual(calls,[['-t'],['-s','reload']])
    assert.equal(fs.readFileSync(path.join(root,'nginx-0.before'),'utf8'),before)
    assert.equal(fs.statSync(file).mode&0o777,0o640)
    assert.equal(nginxRoutingChanges('# configuration file '+file+':\n'+fs.readFileSync(file,'utf8'),'legalcareerist.ru',root).length,0)
    fs.writeFileSync(file,before+'\n# changed')
    assert.throws(()=>nginxRoutingChanges(dump,'legalcareerist.ru',root),/изменилась/)
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})
for(const failure of ['syntax','reload','verification'])test('failed '+failure+' restores the previous config and reloads it',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nginx-rollback-'))
  try{
    const file=path.join(root,'site.conf'),before=config('legalcareerist.ru',root),calls=[]
    fs.writeFileSync(file,before)
    const changes=nginxRoutingChanges('# configuration file '+file+':\n'+before,'legalcareerist.ru',root)
    await assert.rejects(applyRoutingChanges(changes,{backup:root,run:(name,args)=>{calls.push(args);return {status:failure==='syntax'&&calls.length===1||failure==='reload'&&calls.length===2?1:0}},verify:()=>failure!=='verification'}),/Прежняя конфигурация восстановлена/)
    assert.equal(fs.readFileSync(file,'utf8'),before)
    assert.deepEqual(calls.slice(-2),[['-t'],['-s','reload']])
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})

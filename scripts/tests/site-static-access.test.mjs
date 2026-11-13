import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {staticAccessPlan,applyStaticAccess,ancestorDirectories,nginxWorkerUser,traversalAcl} from '../lib/site-static-access.mjs'
import {publishStatic,nginxRoots} from '../repair-community-promo-static.mjs'

function fixture(run) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-access-'))
  try{
    fs.mkdirSync(path.join(root,'dist/assets'),{recursive:true})
    fs.writeFileSync(path.join(root,'dist/index.html'),'<div id="root"></div><script type="module" src="/assets/index.js"></script>')
    fs.writeFileSync(path.join(root,'dist/assets/index.js'),'ENTRY')
    fs.writeFileSync(path.join(root,'secret.env'),'PRIVATE',{mode:0o600})
    run(root,path.join(root,'dist'))
  }finally{fs.rmSync(root,{recursive:true,force:true})}
}
test('403 permission repair includes root and identical index, preserves bytes and private files',()=>fixture((root,dist)=>{
  fs.chmodSync(dist,0o700);fs.chmodSync(path.join(dist,'index.html'),0o600);fs.chmodSync(path.join(dist,'assets'),0o700);fs.chmodSync(path.join(dist,'assets/index.js'),0o600)
  const plan=staticAccessPlan(dist),records=[]
  assert.equal(plan.changes.length,4)
  assert.equal(applyStaticAccess(plan,c=>records.push(c)),4)
  assert.equal(records.length,4)
  for(const c of records)assert.equal(fs.statSync(c.path).mode&0o777,c.after)
  assert.equal(fs.statSync(path.join(root,'secret.env')).mode&0o777,0o600)
  assert.equal(fs.statSync(root).mode&0o777,0o700)
  assert.equal(fs.readFileSync(path.join(dist,'assets/index.js'),'utf8'),'ENTRY')
  assert.equal(staticAccessPlan(dist).changes.length,0)
  assert.equal(applyStaticAccess(staticAccessPlan(dist),()=>assert.fail('no writes on repeat')),0)
  assert.ok(ancestorDirectories(dist).includes(root))
}))
test('unsafe roots, private files, symlinks and hardlinks fail before permission writes',()=>fixture((root,dist)=>{
  assert.throws(()=>staticAccessPlan(root))
  for(const name of ['.env','server','node_modules','pending-joins.json']){
    fs.writeFileSync(path.join(dist,name),'PRIVATE',{mode:0o600})
    assert.throws(()=>staticAccessPlan(dist),/закрытые/i)
    fs.rmSync(path.join(dist,name))
  }
  fs.symlinkSync(path.join(root,'secret.env'),path.join(dist,'assets/leak'))
  assert.throws(()=>staticAccessPlan(dist),/тип файла/);fs.rmSync(path.join(dist,'assets/leak'))
  fs.linkSync(path.join(root,'secret.env'),path.join(dist,'assets/leak'))
  assert.throws(()=>staticAccessPlan(dist),/тип файла/)
  assert.equal(fs.statSync(path.join(root,'secret.env')).mode&0o777,0o600)
}))
test('a concurrently changed tree is refused before the first permission change',()=>fixture((root,dist)=>{
  fs.chmodSync(path.join(dist,'index.html'),0o600)
  const plan=staticAccessPlan(dist)
  fs.appendFileSync(path.join(dist,'index.html'),'NEW RELEASE')
  assert.throws(()=>applyStaticAccess(plan,()=>assert.fail('no partial repair')),/изменилась/)
  assert.equal(fs.statSync(path.join(dist,'index.html')).mode&0o777,0o600)
}))
test('nginx worker parsing and ancestor ACL only add execute without expanding masked read/write',()=>{
  assert.equal(nginxWorkerUser('# user root;\nuser www-data;\nhttp {}'),'www-data')
  assert.equal(nginxWorkerUser('worker_processes auto;\nuser nginx nginx;'),'nginx')
  assert.equal(nginxWorkerUser('http {}'),null)
  assert.deepEqual(traversalAcl('user::rwx\ngroup::---\nmask::---\nother::---\n','www-data'),['--no-mask','-m','u:www-data:--x,m::--x'])
  assert.deepEqual(traversalAcl('user::rwx\nuser:www-data:r--\ngroup::rwx\nmask::r--\nother::---','www-data'),['--no-mask','-m','u:www-data:r-x,m::r-x'])
  assert.deepEqual(traversalAcl('user::rwx\ngroup::r-x\nother::---','www-data'),['--no-mask','-m','u:www-data:--x,m::r-x'])
})
test('HTTPS root discovery excludes unrelated HTTP redirect roots and handles IPv6 listen',()=>{
  const config='# configuration file /etc/nginx/nginx.conf:\nuser www-data;\nhttp {\nserver { listen 80; server_name legalcareerist.ru; root /wrong; return 301 https://$host$request_uri; }\nserver { listen [::]:443 ssl; server_name legalcareerist.ru; root "/var/www/site/dist"; location / { try_files $uri /index.html; } } }'
  assert.deepEqual(nginxRoots(config,'legalcareerist.ru',443),['/var/www/site/dist'])
  assert.deepEqual(nginxRoots(config,'legalcareerist.ru',80),['/wrong'])
})
test('the publisher repairs permissions even when every byte is unchanged',()=>fixture((root,dist)=>{
  const source=path.join(root,'built');fs.cpSync(dist,source,{recursive:true})
  fs.chmodSync(dist,0o700);fs.chmodSync(path.join(dist,'assets'),0o700);fs.chmodSync(path.join(dist,'assets/index.js'),0o600);fs.chmodSync(path.join(dist,'index.html'),0o600)
  const old=fs.readFileSync(path.join(dist,'index.html'))
  assert.equal(publishStatic(source,dist,path.join(root,'backup')),0)
  assert.equal(fs.statSync(dist).mode&0o777,0o755)
  assert.equal(fs.statSync(path.join(dist,'assets')).mode&0o777,0o755)
  assert.equal(fs.statSync(path.join(dist,'index.html')).mode&0o777,0o644)
  assert.equal(fs.statSync(path.join(dist,'assets/index.js')).mode&0o777,0o644)
  assert.deepEqual(fs.readFileSync(path.join(dist,'index.html')),old)
  assert.equal(fs.statSync(path.join(root,'secret.env')).mode&0o777,0o600)
}))

import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {nginxRoots,publishStatic} from '../repair-community-promo-static.mjs'
test('nginx discovery respects server names, nested locations and inherited roots',()=>{
 const text=`http { root /default; server { server_name other.test; root /wrong; } server { server_name legalcareerist.ru www.legalcareerist.ru; root "/site/live"; location /api/ { proxy_pass http://127.0.0.1:3001; } } server { server_name legalcareerist.ru; root /site/live; } server { server_name inherited.test; } }`
 assert.deepEqual(nginxRoots(text,'legalcareerist.ru'),['/site/live'])
 assert.deepEqual(nginxRoots(text,'inherited.test'),['/default'])
 assert.deepEqual(nginxRoots('http { server { server_name legalcareerist.ru; location / { root /site/real; } } }','legalcareerist.ru'),['/site/real'])
 assert.deepEqual(nginxRoots('server { server_name other.test; root /wrong; }','legalcareerist.ru'),[])
})
test('static publication keeps unrelated files and old chunks, backs up changed files and remains readable under private umask',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'promo-static-')),source=path.join(dir,'source'),target=path.join(dir,'target'),backup=path.join(dir,'backup'),oldMask=process.umask(0o077)
 try{
  fs.mkdirSync(source);fs.mkdirSync(target);fs.mkdirSync(path.join(source,'assets'));fs.mkdirSync(path.join(target,'assets'))
  fs.writeFileSync(path.join(source,'index.html'),'NEW');fs.writeFileSync(path.join(source,'assets/new.js'),'PROMO')
  fs.writeFileSync(path.join(target,'index.html'),'OLD');fs.writeFileSync(path.join(target,'assets/old.js'),'OLD_CHUNK');fs.writeFileSync(path.join(target,'unrelated.txt'),'PRESERVE')
  assert.equal(publishStatic(source,target,backup),2)
  assert.equal(fs.readFileSync(path.join(target,'index.html'),'utf8'),'NEW');assert.equal(fs.readFileSync(path.join(backup,'index.html'),'utf8'),'OLD')
  assert.equal(fs.readFileSync(path.join(target,'assets/old.js'),'utf8'),'OLD_CHUNK');assert.equal(fs.readFileSync(path.join(target,'unrelated.txt'),'utf8'),'PRESERVE')
  assert.equal(fs.statSync(path.join(target,'assets/new.js')).mode&0o777,0o644);assert.equal(fs.statSync(path.join(target,'assets')).mode&0o777,0o755)
  assert.equal(publishStatic(source,target,path.join(dir,'repeat-backup')),0)
 }finally{process.umask(oldMask);fs.rmSync(dir,{recursive:true,force:true})}
})
test('a public-path symlink cannot overwrite a file outside the document root',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'promo-static-link-'))
 try{const source=path.join(dir,'source'),target=path.join(dir,'target'),outside=path.join(dir,'outside');fs.mkdirSync(source);fs.mkdirSync(target);fs.mkdirSync(outside);fs.mkdirSync(path.join(source,'assets'));fs.writeFileSync(path.join(source,'assets/private'),'bad');fs.writeFileSync(path.join(outside,'private'),'untouched');fs.symlinkSync(outside,path.join(target,'assets'));assert.throws(()=>publishStatic(source,target,path.join(dir,'backup')),/выходит/);assert.equal(fs.readFileSync(path.join(outside,'private'),'utf8'),'untouched')}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
})

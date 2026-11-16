import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'

const repo=path.resolve(import.meta.dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'resident-knowledge-install-'))
const manifest=JSON.parse(fs.readFileSync(path.join(repo,'updates/resident-knowledge-20261116/manifest.json')))
const articlePaths=new Set(manifest.files.map(f=>path.join(repo,'server/content/knowledge',f.path)))
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const write=(file,body)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body)}
const inventory=root=>{
  const out={}
  const walk=(dir,rel='')=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const next=path.join(rel,e.name)
    if(e.isDirectory())walk(path.join(dir,e.name),next)
    else out[next]=e.isSymbolicLink()?'LINK:'+fs.readlinkSync(path.join(dir,e.name)):hash(fs.readFileSync(path.join(dir,e.name)))
  }}
  walk(root);return out
}

async function scenario(kind){
  const root=path.join(temp,kind),runtime=path.join(root,'server'),baseKb=path.join(runtime,'content/knowledge')
  const kb=kind==='custom-root'?path.join(root,'custom/knowledge'):baseKb
  fs.mkdirSync(kb,{recursive:true});fs.mkdirSync(path.join(runtime,'lib'),{recursive:true})
  fs.cpSync(path.join(repo,'server/content/knowledge'),kb,{recursive:true,filter:file=>!articlePaths.has(file)})
  write(path.join(runtime,'index.js'),'// Existing API entry; never executed by the installer.\n')
  write(path.join(runtime,'package.json'),'{"type":"module"}')
  write(path.join(runtime,'lib/knowledgeBase.js'),fs.readFileSync(path.join(repo,'server/lib/knowledgeBase.js')))
  write(path.join(runtime,'.env'),'SYNTHETIC_SECRET=never-print-fixture-secret\n')
  write(path.join(runtime,'data/payments.json'),'{"existing":"PRESERVE ALL PAYMENTS"}')
  write(path.join(root,'public/index.html'),'EXISTING PUBLIC SITE')
  if(kind==='custom-root')write(path.join(baseKb,'preserve.txt'),'UNUSED DEFAULT KB')
  const first=path.join(kb,manifest.files[0].path)
  if(kind==='conflict')write(first,'OWNER EDITED ARTICLE')
  if(kind==='symlink')fs.symlinkSync(path.join(root,'missing-file'),first)
  if(kind==='duplicate-id')write(path.join(path.dirname(first),'99-kak-zarabatyvat-bolshe.md'),'---\ntitle: Existing article\n---\nExisting text\n')
  const before=inventory(runtime),beforeKb=inventory(kb),publicBefore=inventory(path.join(root,'public'))
  let healthCalls=0,httpCalls=0
  const server=http.createServer((req,res)=>{
    httpCalls++;res.setHeader('Content-Type','application/json')
    if(req.url==='/api/health'){
      healthCalls++
      if(['post-health-failure','concurrent-edit'].includes(kind)&&healthCalls>1){
        if(kind==='concurrent-edit')fs.writeFileSync(first,'CONCURRENT OWNER EDIT')
        res.statusCode=503;res.end('{"ok":false}');return
      }
      res.end('{"ok":true}');return
    }
    res.statusCode=kind==='open-api'?200:401;res.end('{"ok":false,"error":"unauthorized"}')
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const port=server.address().port,bin=path.join(root,'bin'),log=path.join(root,'pm2.log')
  fs.mkdirSync(bin)
  const state={status:'online',pm_exec_path:path.join(runtime,'index.js'),pm_cwd:root,PORT:port,...(kind==='custom-root'?{KB_DIR:'custom/knowledge'}:{})}
  write(path.join(bin,'pm2'),'#!/usr/bin/env node\nconst fs=require("node:fs");const args=process.argv.slice(2);fs.appendFileSync('+JSON.stringify(log)+',JSON.stringify(args)+"\\n");if(JSON.stringify(args)!==\'["jlist"]\')process.exit(91);process.stdout.write('+JSON.stringify(JSON.stringify([{name:'legalcareerist-api',pm2_env:state}]))+');\n')
  fs.chmodSync(path.join(bin,'pm2'),0o755)
  let installer=path.join(repo,'scripts/install-resident-knowledge.mjs')
  if(kind==='tampered-source'){
    const release=path.join(root,'release')
    for(const file of ['scripts/install-resident-knowledge.mjs','scripts/lib/bot-runtime-settings.mjs','updates/resident-knowledge-20261116/manifest.json',...manifest.files.map(f=>'server/content/knowledge/'+f.path)])write(path.join(release,file),fs.readFileSync(path.join(repo,file)))
    write(path.join(release,'package.json'),'{"type":"module"}')
    fs.appendFileSync(path.join(release,'server/content/knowledge',manifest.files[0].path),'ALTERED CONTENT')
    installer=path.join(release,'scripts/install-resident-knowledge.mjs')
  }
  const backups=path.join(root,'backups')
  const invoke=()=>new Promise(resolve=>{
    let output=''
    const child=spawn(process.execPath,[installer,'--backup-root',backups],{env:{...process.env,PATH:bin+path.delimiter+process.env.PATH}})
    child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b)
    child.on('close',code=>resolve({code,output}))
  })
  try{
    const result=await invoke();assert.ok(!result.output.includes('never-print-fixture-secret'),result.output)
    if(['success','custom-root'].includes(kind)){
      assert.equal(result.code,0,result.output);assert.match(result.output,/RESIDENT_KNOWLEDGE_PUBLISHED/)
      for(const f of manifest.files)assert.equal(hash(fs.readFileSync(path.join(kb,f.path))),f.sha256)
      for(const [rel,sha]of Object.entries(beforeKb))assert.equal(inventory(kb)[rel],sha)
      const snapshot=fs.readdirSync(backups);assert.equal(snapshot.length,1)
      assert.equal(JSON.parse(fs.readFileSync(path.join(backups,snapshot[0],'verified.json'))).articles.length,5)
      const after=inventory(kb),repeat=await invoke()
      assert.equal(repeat.code,0,repeat.output);assert.match(repeat.output,/Повторной записи нет/)
      assert.deepEqual(inventory(kb),after);assert.equal(fs.readdirSync(backups).length,1)
    }else{
      assert.equal(result.code,1,result.output);assert.ok(!result.output.includes('RESIDENT_KNOWLEDGE_PUBLISHED'))
      if(kind==='concurrent-edit'){
        assert.equal(fs.readFileSync(first,'utf8'),'CONCURRENT OWNER EDIT')
        for(const f of manifest.files.slice(1))assert.ok(!fs.existsSync(path.join(kb,f.path)))
        assert.match(result.output,/Откат не подтвержден/)
      }else assert.deepEqual(inventory(kb),beforeKb)
      if(kind==='tampered-source'){assert.equal(httpCalls,0);assert.ok(!fs.existsSync(log))}
    }
    const afterRuntime=inventory(runtime)
    for(const [rel,sha]of Object.entries(before))assert.equal(afterRuntime[rel],sha)
    assert.deepEqual(inventory(path.join(root,'public')),publicBefore)
    if(fs.existsSync(log))assert.ok(fs.readFileSync(log,'utf8').trim().split('\n').every(line=>line==='["jlist"]'))
    console.log('PASS knowledge installer: '+kind+'; existing content, payments, API code and public files preserved')
  }finally{await new Promise(resolve=>server.close(resolve))}
}
try{for(const kind of ['success','custom-root','conflict','symlink','duplicate-id','tampered-source','open-api','post-health-failure','concurrent-edit'])await scenario(kind)}finally{fs.rmSync(temp,{recursive:true,force:true})}

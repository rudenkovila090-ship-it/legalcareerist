// Reproduce the deployed legacy lead-module failure, then build the fixed packet.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const repo=fileURLToPath(new URL('../..',import.meta.url)),root=fs.mkdtempSync(path.join(os.tmpdir(),'resident-ui-legacy-build-'))
const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',maxBuffer:16*1048576})
try{
 const names=git(['ls-tree','--name-only','b14a93b']).trim().split('\n').filter(n=>['src','public','scripts','index.html'].includes(n)||/^(package(?:-lock)?\.json|tsconfig.*\.json|vite\.config\.[cm]?[jt]s)$/.test(n))
 const archive=path.join(root,'source.tar'),fd=fs.openSync(archive,'w')
 try{execFileSync('git',['archive','b14a93b',...names],{cwd:repo,stdio:['ignore',fd,'pipe']})}finally{fs.closeSync(fd)}
 execFileSync('tar',['-xf',archive,'-C',root]);fs.rmSync(archive)
 fs.symlinkSync(fs.realpathSync(path.join(repo,'node_modules')),path.join(root,'node_modules'))
 const oldManifest=JSON.parse(git(['show','9da34a52ac36527ab52f8744cbcf1d12d5009d03:updates/resident-ui/manifest.json']))
 for(const f of oldManifest.frontend){const file=path.join(root,f.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,git(['show','9da34a52ac36527ab52f8744cbcf1d12d5009d03:updates/resident-ui/payload/'+f.path]))}
 const legacy=fs.readFileSync(path.join(root,'src/lib/leads.ts'),'utf8')
 const before=spawnSync('npm',['run','build'],{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:16*1048576})
 fs.writeFileSync(path.join(root,'before.log'),(before.stdout||'')+(before.stderr||''))
 assert.notEqual(before.status,0,'Previous packet unexpectedly built over the legacy source')
 for(const symbol of ['submitDraftLead','leadSubmissionId','withLeadSubmission','requestId'])assert.ok((before.stdout+before.stderr).includes(symbol),symbol)
 console.log('PASS reproduced all reported missing lead exports/types on b14a93b source')
 const next=JSON.parse(fs.readFileSync(path.join(repo,'updates/resident-ui/manifest.json')))
 for(const f of next.frontend){const file=path.join(root,f.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(path.join(repo,'updates/resident-ui/payload',f.path),file)}
 assert.equal(fs.readFileSync(path.join(root,'src/lib/leads.ts'),'utf8'),legacy,'Existing lead transport was overwritten')
 const after=spawnSync('npm',['run','build'],{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:16*1048576})
 fs.writeFileSync(path.join(root,'after.log'),(after.stdout||'')+(after.stderr||''))
 assert.equal(after.status,0,'Fixed packet failed; logs: '+root+'\n'+after.stdout+'\n'+after.stderr)
 console.log('PASS fixed packet builds on the old source, preserving its lead transport byte-for-byte')
}finally{if(!process.argv.includes('--keep'))fs.rmSync(root,{recursive:true,force:true});else console.log('Fixture retained: '+root)}

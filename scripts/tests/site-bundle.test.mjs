import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {currentBundle} from '../lib/site-bundle.mjs'

test('current entry selects both active forms and a shared promo module despite retained old chunks',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'site-bundle-'))
  try{
    fs.mkdirSync(path.join(root,'assets'))
    const write=(name,body)=>fs.writeFileSync(path.join(root,'assets',name),body)
    write('index-new.js','const deps=["assets/CommunityHome-current.js","assets/TariffJoinBlock-current.js"]; import("./other.js");')
    write('CommunityHome-current.js','import "./promo-current.js";')
    write('TariffJoinBlock-current.js','import "./promo-current.js";')
    write('promo-current.js','export const label="Промокод (необязательно)";')
    write('other.js','export default 1;');write('style.css','body{}')
    for(let i=0;i<12;i++){write('CommunityHome-old'+i+'.js','OLD');write('TariffJoinBlock-old'+i+'.js','OLD')}
    const plan={root,entry:'/assets/index-new.js',html:'<script src="/assets/index-new.js"></script><link href="/assets/style.css"><link href="https://external.invalid/foreign.css">'}
    const bundle=currentBundle(plan)
    assert.deepEqual(bundle.missing,[])
    assert.equal(bundle.assets.length,6)
    assert.deepEqual(bundle.forms,{CommunityHome:['/assets/CommunityHome-current.js'],TariffJoinBlock:['/assets/TariffJoinBlock-current.js']})
    assert.equal(bundle.promo,true)
    fs.unlinkSync(path.join(root,'assets/CommunityHome-current.js'))
    const missing=currentBundle(plan)
    assert.deepEqual(missing.missing,['/assets/CommunityHome-current.js'])
    assert.equal(missing.forms.CommunityHome.length,0,'an old chunk cannot stand in for a missing active form')
    write('promo-current.js','OLD WITHOUT PROMO')
    assert.equal(currentBundle(plan).promo,false)
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})

import fs from 'node:fs'
import path from 'node:path'

// Follow the installed entry and Vite's dependency-map literals. Old hashed chunks
// retained for existing browser tabs must not be mistaken for the current build.
export function currentBundle(plan) {
  const queue=[plan.entry],seen=new Set(),missing=new Set()
  for(const tag of plan.html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)=["']([^"']+\.(?:js|css))["']/g)){
    const url=new URL(tag[1],'https://bundle.invalid')
    if(url.origin==='https://bundle.invalid'&&url.pathname.startsWith('/assets/'))queue.push(url.pathname)
  }
  while(queue.length){
    const asset=queue.shift()
    if(seen.has(asset))continue
    seen.add(asset)
    const file=path.join(plan.root,asset)
    if(!fs.existsSync(file)){missing.add(asset);continue}
    const text=fs.readFileSync(file,'utf8')
    for(const match of text.matchAll(/["']((?:\/?assets\/|\.\.?\/)?[a-zA-Z0-9_./-]+\.(?:js|css))["']/g)){
      const value=match[1]
      if(value.startsWith('../')||value.includes('/../'))continue
      const relative=value.startsWith('assets/')?'/'+value:new URL(value,new URL(asset,'https://bundle.invalid')).pathname
      if(relative.startsWith('/assets/')&&!seen.has(relative))queue.push(relative)
    }
  }
  const scripts=[...seen].filter(f=>f.endsWith('.js')&&!missing.has(f))
  const forms=Object.fromEntries(['CommunityHome','TariffJoinBlock'].map(name=>[name,scripts.filter(f=>new RegExp('/'+name+'-[^/]+\\.js$').test(f))]))
  return {assets:[...seen],missing:[...missing],forms,promo:scripts.some(file=>{const text=fs.readFileSync(path.join(plan.root,file),'utf8');return text.includes('Промокод (необязательно)')||text.includes('Промокод')&&text.includes('promoCode')&&text.includes('autoCapitalize')})}
}

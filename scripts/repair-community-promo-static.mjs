// Repair only public static files. No bot, database, payment or nginx configuration writes.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
const sha=b=>crypto.createHash('sha256').update(b).digest('hex')
export function nginxRoots(text,host) {
 const tokens=text.match(/#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{};]|[^\s{};]+/g)||[],stack=[],servers=[]
 let words=[]
 for(const token of tokens){
  if(token.startsWith('#'))continue
  if(token==='{'){const header=words;words=[];const frame={header,root:null,names:[],parent:stack.at(-1),locations:[]};if(header[0]==='server')servers.push(frame);stack.push(frame)}
  else if(token==='}') {stack.pop();words=[]}
  else if(token===';'){
   const f=stack.at(-1);if(f&&words[0]==='server_name')f.names=words.slice(1)
   if(f&&words[0]==='root'&&words.length===2){f.root=words[1];const server=[...stack].reverse().find(x=>x.header[0]==='server');if(server&&f.header[0]==='location'&&f.header.slice(1).join(' ')==='/')server.locations.push(f.root)}
   words=[]
  }else words.push(token.replace(/^(["'])(.*)\1$/,'$2'))
 }
 const roots=[]
 for(const s of servers.filter(s=>s.names.includes(host)||s.names.includes('www.'+host))){let parent=s;while(parent&&!parent.root)parent=parent.parent;roots.push(...s.locations,...(parent?.root?[parent.root]:[]))}
 return [...new Set(roots.filter(r=>path.isAbsolute(r)&&!r.includes('$')).map(r=>path.resolve(r)))]
}
export function publishStatic(source,target,backup) {
 const root=fs.realpathSync(target),files=[];fs.mkdirSync(backup,{recursive:true,mode:0o700})
 const walk=(dir,relative='')=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('Символьная ссылка в сборке');const rel=path.join(relative,e.name);if(e.isDirectory())walk(path.join(dir,e.name),rel);else files.push(rel)}};walk(source)
 files.sort((a,b)=>(a==='index.html'?1:0)-(b==='index.html'?1:0))
 const changes=[]
 for(const relative of files){
  const dest=path.join(root,relative);let parent=path.dirname(dest);while(!fs.existsSync(parent))parent=path.dirname(parent)
  const real=fs.realpathSync(parent);if(real!==root&&!real.startsWith(root+path.sep))throw Error('Путь публикации выходит из корня сайта')
  if(fs.existsSync(dest)&&fs.lstatSync(dest).isSymbolicLink())throw Error('Ссылка вместо файла сайта')
  const after=fs.readFileSync(path.join(source,relative)),before=fs.existsSync(dest)?fs.readFileSync(dest):null
  if(before&&before.equals(after))continue
  if(before){const saved=path.join(backup,relative);fs.mkdirSync(path.dirname(saved),{recursive:true,mode:0o700});fs.writeFileSync(saved,before,{mode:0o600})}
  changes.push({relative,dest,before,after})
 }
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(changes.map(c=>({path:c.relative,existed:c.before!==null,sha256:sha(c.after)})),null,2),{mode:0o600})
 for(const c of changes){fs.mkdirSync(path.dirname(c.dest),{recursive:true,mode:0o755});for(let dir=path.dirname(c.dest);dir!==root;dir=path.dirname(dir))fs.chmodSync(dir,0o755);const temp=c.dest+'.promo-'+crypto.randomBytes(5).toString('hex');try{fs.writeFileSync(temp,c.after,{mode:0o644,flag:'wx'});fs.chmodSync(temp,0o644);fs.renameSync(temp,c.dest)}finally{fs.rmSync(temp,{force:true})}}
 return changes.length
}
async function main(){
 process.umask(0o077)
 const args=process.argv.slice(2),opt=k=>{const i=args.indexOf(k);return i<0?null:args[i+1]}
 const site=opt('--site-root')||'/var/www/legalcareerist',source=path.join(site,'dist'),origin=new URL('https://legalcareerist.ru/community')
 const localHtml=fs.readFileSync(path.join(source,'index.html'),'utf8'),entry=localHtml.match(/<script[^>]*src=["']([^"']+)["']/)?.[1]
 if(!entry?.startsWith('/assets/'))throw Error('В установленной сборке не найден входной JS')
 const js=fs.readdirSync(path.join(source,'assets')).filter(f=>f.endsWith('.js'))
 const fields=js.filter(f=>fs.readFileSync(path.join(source,'assets',f),'utf8').includes('Промокод (необязательно)'))
 const forms=js.filter(f=>/^(CommunityHome|TariffJoinBlock)-/.test(f))
 if(!fields.length||forms.length!==2)throw Error('В dist отсутствует новая форма; требуется повторная сборка, публикация не изменена')
 const required=[...new Set([entry,...forms.map(f=>'/assets/'+f),...fields.map(f=>'/assets/'+f)])]
 const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});if(!r.ok){const e=Error('Публичная проверка: HTTP '+r.status);e.status=r.status;throw e}return Buffer.from(await r.arrayBuffer())}
 const verify=async url=>{try{const html=(await get(url)).toString();if(!html.includes(entry))return false;for(const asset of required)if(!(await get(new URL(asset,origin))).equals(fs.readFileSync(path.join(source,asset))))return false;return true}catch(e){if(e.status===404)return false;throw e}}
 if(await verify(origin)){console.log('PUBLIC_PROMO_VERIFIED: сайт отдаёт новые формы и JS с полем промокода.');console.log('Откройте заново: '+origin.href+'?release='+sha(localHtml).slice(0,12));return}
 const nginx=spawnSync('nginx',['-T'],{encoding:'utf8',maxBuffer:16*1024*1024});if(nginx.status!==0)throw Error('Не удалось прочитать действующую конфигурацию nginx')
 const candidates=nginxRoots(nginx.stdout+'\n'+nginx.stderr,origin.hostname).filter(r=>fs.existsSync(path.join(r,'index.html')))
 let roots=[...new Set(candidates.map(r=>fs.realpathSync(r)))]
 if(roots.length>1){const publicHtml=await get(origin);roots=roots.filter(r=>fs.readFileSync(path.join(r,'index.html')).equals(publicHtml))}
 if(roots.length!==1)throw Error('Нельзя однозначно определить корень сайта nginx: '+candidates.join(', '))
 const target=roots[0],base=opt('--backup-root')||'/root/legalcareerist-bot-backups';fs.mkdirSync(base,{recursive:true,mode:0o700});const backup=fs.mkdtempSync(path.join(base,'promo-static-20261111-'))
 const changed=publishStatic(source,target,backup)
 const fresh=new URL(origin);fresh.searchParams.set('release',sha(localHtml).slice(0,12))
 if(!await verify(fresh))throw Error('Публичный сайт всё ещё отдаёт другую сборку; локально обновлено '+changed+' файлов в '+target+'; резервная копия '+backup)
 console.log('PUBLIC_PROMO_VERIFIED: публичные JS обеих форм совпадают с новой сборкой. Обновлено файлов: '+changed+'. Корень nginx: '+target+'. Резервная копия: '+backup)
 console.log('Откройте: '+fresh.href)
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error('ПУБЛИКАЦИЯ НЕ ПОДТВЕРЖДЕНА: '+e.message);process.exitCode=1})

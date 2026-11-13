import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

function blocks(text) {
  const result=[],stack=[];let words=[]
  for(const match of text.matchAll(/#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{};]|[^\s{};]+/g)){
    const token=match[0];if(token.startsWith('#'))continue
    if(token==='{'){const block={header:words.map(w=>w.value),parent:stack.at(-1),directives:[]};result.push(block);stack.push(block);words=[]}
    else if(token==='}'){stack.pop();words=[]}
    else if(token===';'){stack.at(-1)?.directives.push(words);words=[]}
    else words.push({value:token.replace(/^(["'])(.*)\1$/,'$2'),start:match.index,end:match.index+token.length})
  }
  return result
}

export function patchSpaFallback(text,host,root,resolve=p=>path.resolve(p)) {
  const all=blocks(text),edits=[]
  for(const block of all){
    if(block.header.join(' ')!=='location /')continue
    const server=block.parent
    if(server?.header[0]!=='server')continue
    const directive=(frame,key)=>frame?.directives.find(words=>words[0]?.value===key)?.slice(1).map(w=>w.value)
    const names=directive(server,'server_name')||[],listens=server.directives.filter(w=>w[0]?.value==='listen').map(w=>w[1]?.value)
    if(!names.includes(host)&&!names.includes('www.'+host)||!listens.some(l=>l==='443'||l?.endsWith(':443')))continue
    let current=block,configuredRoot
    while(current&&!configuredRoot){configuredRoot=directive(current,'root')?.[0];current=current.parent}
    if(!configuredRoot||configuredRoot.includes('$')||resolve(configuredRoot)!==resolve(root))continue
    // Do not alter locations with proxy/alias semantics.
    if(block.directives.some(w=>['alias','proxy_pass','fastcgi_pass'].includes(w[0]?.value)))continue
    for(const words of block.directives){
      const values=words.map(w=>w.value)
      if(values.length!==4||values[0]!=='try_files'||values[1]!=='$uri'||values[2]!=='$uri/'||!['/index.html','/index.html?$args','/index.html?$query_string'].includes(values[3]))continue
      const token=words[2],after=text.slice(token.end).match(/^\s*/)[0]
      edits.push({start:token.start,end:token.end+after.length})
    }
  }
  let after=text
  for(const edit of edits.sort((a,b)=>b.start-a.start))after=after.slice(0,edit.start)+after.slice(edit.end)
  return {after,count:edits.length}
}

export function nginxRoutingChanges(dump,host,root) {
  const files=new Map()
  for(const match of dump.matchAll(/^# configuration file (.+):\r?\n([\s\S]*?)(?=^# configuration file |$(?![\s\S]))/gm)){
    const file=fs.realpathSync(match[1]);if(files.has(file))continue
    const before=fs.readFileSync(file,'utf8'),stat=fs.statSync(file)
    if(before.trim()!==match[2].trim())throw Error('Конфигурация nginx изменилась после чтения: '+file)
    const patched=patchSpaFallback(before,host,root,p=>fs.realpathSync(p))
    if(patched.count)files.set(file,{file,before,after:patched.after,mode:stat.mode&0o777,uid:stat.uid,gid:stat.gid,count:patched.count})
  }
  return [...files.values()]
}

export function directoryIndexEvidence(text,roots,host,since) {
  return text.split('\n').some(line=>{
    const timestamp=line.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})/)
    if(!timestamp)return false
    const time=new Date(timestamp[1]+'-'+timestamp[2]+'-'+timestamp[3]+'T'+timestamp[4]).getTime()
    return time>=since-2000&&time<=Date.now()+60000&&line.includes('is forbidden')&&(line.includes('server: '+host)||line.includes('server: www.'+host))&&roots.some(root=>line.includes('directory index of "'+path.join(root,'events')+'/"'))&&/request: "GET \/events\/(?:\?[^ ]*)? HTTP\//.test(line)
  })
}

export async function applyRoutingChanges(changes,{run,backup,verify,record=()=>{}}) {
  if(!changes.length)throw Error('Не найдено подтверждённое правило try_files $uri $uri/ /index.html для этого сайта; nginx сохранён')
  const write=(item,body)=>{
    const temp=item.file+'.spa-'+crypto.randomBytes(5).toString('hex')
    try{fs.writeFileSync(temp,body,{mode:item.mode,flag:'wx'});fs.chmodSync(temp,item.mode);fs.chownSync(temp,item.uid,item.gid);fs.renameSync(temp,item.file)}finally{fs.rmSync(temp,{force:true})}
  }
  for(const [i,item]of changes.entries()){
    if(fs.readFileSync(item.file,'utf8')!==item.before)throw Error('Конфигурация изменена параллельно; исправление остановлено')
    const saved=path.join(backup,'nginx-'+i+'.before');fs.writeFileSync(saved,item.before,{mode:0o600})
    record({type:'nginx-spa-fallback',file:item.file,beforeFile:saved,removedDirectoryTests:item.count})
  }
  const written=[]
  try{
    for(const item of changes){if(fs.readFileSync(item.file,'utf8')!==item.before)throw Error('Конфигурация изменена параллельно');written.push(item);write(item,item.after)}
    if(run('nginx',['-t']).status!==0)throw Error('nginx -t не принял точечное исправление')
    if(run('nginx',['-s','reload']).status!==0)throw Error('Не подтверждён reload nginx')
    if(!await verify())throw Error('После reload не подтверждены страница мероприятий, обложка, главная и API')
  }catch(error){
    let restored=true
    for(const item of written.reverse())try{
      const current=fs.readFileSync(item.file,'utf8')
      if(current===item.after)write(item,item.before)
      else if(current!==item.before)throw Error('Параллельное изменение')
    }catch{restored=false}
    if(run('nginx',['-t']).status!==0||run('nginx',['-s','reload']).status!==0)restored=false
    throw Error(error.message+'. '+(restored?'Прежняя конфигурация восстановлена.':'Откат nginx не подтверждён; резервная копия: '+backup))
  }
  return changes.reduce((sum,item)=>sum+item.count,0)
}

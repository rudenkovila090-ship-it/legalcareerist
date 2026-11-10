import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

export function runtimeSettings(state, ambient = process.env) {
  const runtime = path.dirname(state.pm_exec_path)
  const cwd = state.pm_cwd || runtime
  // Tokenize trusted PM2 node arguments; never execute them or shell-source an env file.
  const words = text => String(text || '').match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(s=>s.replace(/"([^"]*)"|'([^']*)'/g,(_m,a,b)=>a??b)) || []
  const args = Array.isArray(state.node_args) ? state.node_args : words(state.node_args)
  const envFiles = []
  for (let i=0;i<args.length;i++) {
    const arg = String(args[i])
    if (/^--env-file(?:-if-exists)?=/.test(arg)) envFiles.push(path.resolve(cwd,arg.slice(arg.indexOf('=')+1)))
    else if (/^--env-file(?:-if-exists)?$/.test(arg) && args[i+1]) envFiles.push(path.resolve(cwd,String(args[++i])))
  }
  const files = envFiles.length ? envFiles : [path.join(runtime,'.env')]
  let values = {}
  const errors=[]
  for(const file of files)try{values={...values,...parseEnv(fs.readFileSync(file,'utf8'))}}catch(e){errors.push({file,code:e.code||'unreadable'})}
  // PM2's inherited environment takes precedence over Node --env-file, as in Node itself.
  const value = key => state[key] ?? state.env?.[key] ?? values[key] ?? ambient[key]
  const source = fs.readFileSync(state.pm_exec_path,'utf8')
  const fallbackChat = source.match(/const COMMUNITY_CHAT_ID\s*=\s*process\.env\.COMMUNITY_CHAT_ID\s*\|\|\s*['"]([^'"]+)/)?.[1]
  const chat = value('COMMUNITY_CHAT_ID') || fallbackChat
  return { runtime, cwd, files, errors, value, chat,
    chatSource: state.COMMUNITY_CHAT_ID !== undefined ? 'pm2' : state.env?.COMMUNITY_CHAT_ID !== undefined ? 'pm2.env' : values.COMMUNITY_CHAT_ID !== undefined ? 'node_env_file' : ambient.COMMUNITY_CHAT_ID !== undefined ? 'shell_environment' : 'code_default' }
}

export async function telegramRead(token,method,body={},dependencies={}) {
  if(!['getMe','getWebhookInfo','getChat','getChatMember'].includes(method))throw Error('read_only_method_required')
  const fetcher=dependencies.fetch||fetch,wait=dependencies.wait||(ms=>new Promise(r=>setTimeout(r,ms)))
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)})
      const b=await r.json()
      const result={ok:r.ok&&b.ok===true,result:b.result,http:r.status,errorCode:b.error_code||null,
        description:typeof b.description==='string'?b.description.split(token).join('[redacted]').slice(0,180):null,
        retryAfter:Number(b.parameters?.retry_after)||null,migrateTo:b.parameters?.migrate_to_chat_id||null}
      if(result.ok)return result
      if(result.errorCode===429&&result.retryAfter>0&&result.retryAfter<=30&&attempt<2){await wait(result.retryAfter*1000);continue}
      return result
    }catch{if(attempt===2)return{ok:false,errorCode:'network_or_timeout',description:'Telegram connection failed'};await wait(1000)}
  }
}

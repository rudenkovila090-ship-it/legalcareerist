// Read-only: use the active Node environment files; expose Telegram errors, never credentials.
import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { execFileSync } from 'node:child_process'
import { runtimeSettings, telegramRead } from './lib/bot-runtime-settings.mjs'
const apps=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:10000})).filter(a=>a.name==='legalcareerist-api')
if(apps.length!==1)throw Error('Нужен один основной процесс legalcareerist-api.')
const settings=runtimeSettings(apps[0].pm2_env,{}),token=settings.value('TELEGRAM_BOT_TOKEN')
if(!token)throw Error('Токен не найден в настройках работающего процесса.')
const me=await telegramRead(token,'getMe')
let beside={};try{beside=parseEnv(fs.readFileSync(path.join(settings.runtime,'.env'),'utf8'))}catch{}
const source=fs.readFileSync(apps[0].pm2_env.pm_exec_path,'utf8')
const oldChat=apps[0].pm2_env.COMMUNITY_CHAT_ID??apps[0].pm2_env.env?.COMMUNITY_CHAT_ID??beside.COMMUNITY_CHAT_ID??source.match(/const COMMUNITY_CHAT_ID\s*=\s*process\.env\.COMMUNITY_CHAT_ID\s*\|\|\s*['"]([^'"]+)/)?.[1]
console.log('SETTINGS '+JSON.stringify({chatId:settings.chat||null,chatSource:settings.chatSource,envFiles:settings.files,envReadErrors:settings.errors,previousAuditChatId:oldChat||null,previousAuditUsedDifferentChat:String(oldChat)!==String(settings.chat),bot:me.result?.username||null,telegramOK:me.ok}))
const safe=r=>({ok:r.ok,http:r.http,errorCode:r.errorCode,description:r.description,retryAfter:r.retryAfter,migrateTo:r.migrateTo})
if(!me.ok){console.log('TELEGRAM '+JSON.stringify(safe(me)));process.exitCode=1}
else if(!settings.chat){console.log('ACTION Не установлен ID сообщества в настройках процесса.');process.exitCode=1}
else{
 const group=await telegramRead(token,'getChat',{chat_id:settings.chat})
 const member=await telegramRead(token,'getChatMember',{chat_id:settings.chat,user_id:me.result.id})
 console.log('CHAT '+JSON.stringify({...safe(group),id:group.result?.id,title:group.result?.title,type:group.result?.type}))
 console.log('BOT_RIGHTS '+JSON.stringify({...safe(member),role:member.result?.status,canInvite:member.ok?(member.result?.status==='creator'||member.result?.can_invite_users===true):null,canRemove:member.ok?(member.result?.status==='creator'||member.result?.can_restrict_members===true):null}))
 if(member.ok&&(member.result?.status==='creator'||(member.result?.status==='administrator'&&member.result?.can_invite_users&&member.result?.can_restrict_members)))console.log('ACTION Права бота подтверждены в действующем чате. Повторная установка кода не нужна.')
 else if(member.ok)console.log('ACTION Telegram → сообщество → Управление → Администраторы → @'+me.result.username+': включите приглашение пользователей и блокировку участников.')
 else if(member.migrateTo||group.migrateTo)console.log('ACTION Telegram сообщил о миграции группы; новый ID указан в migrateTo. Старый ID в настройках требует замены.')
 else console.log('ACTION Telegram не подтвердил доступ бота. Точная причина указана в description; права по такому ответу не считаются отсутствующими.')
}
// Wider name search is diagnostic only. Similar names never authorize a free grant.
const data=path.join(settings.runtime,'data'),read=name=>{try{return JSON.parse(fs.readFileSync(path.join(data,name),'utf8'))}catch{return{}}}
const users=Object.values(read('bot-users.json')),cards=Object.values(read('pending-joins.json'))
const text=v=>String([v.name,v.firstName,v.lastName,v.first_name,v.last_name,v.username,v.telegram].filter(Boolean).join(' ')).toLowerCase().replace(/ё/g,'е')
const near=v=>/анаст|наст[ья]|anast|nastya|шемана|шемена|шамана|sheman|shiman/.test(text(v))
const ids=[...new Set([...users.filter(near).map(u=>u.id),...cards.filter(near).map(c=>c.tgUserId)].filter(Boolean).map(String))].slice(0,20)
for(const id of ids){const u=users.find(u=>String(u.id)===id),mine=cards.filter(c=>String(c.tgUserId)===id);console.log('ANASTASIA_CANDIDATE '+JSON.stringify({id,name:u?[u.firstName,u.lastName].filter(Boolean).join(' '):null,username:u?.username||null,cardNames:[...new Set(mine.map(c=>c.name).filter(Boolean))],tags:(u?.tags||[]).filter(t=>/тариф_|цена_|бессроч|резидент/.test(t))}))}
if(!ids.length)console.log('ANASTASIA_CANDIDATE В сохранённых именах совпадений не найдено; бесплатный доступ по догадке не выдавался.')

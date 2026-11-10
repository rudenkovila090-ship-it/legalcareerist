import fs from 'node:fs'
import path from 'node:path'
const data=path.join(import.meta.dirname,'../data')
export const AUTOMATION_POLICY_VERSION=1
export const PERMANENT_MEMBER_IDS=['376201355','1955667679']
export function automationState(){
 try {
  const p=JSON.parse(fs.readFileSync(path.join(data,'community-subscription-automation.json'),'utf8')).policy
  const paused=fs.existsSync(path.join(data,'community-removals-paused.json'))
  const enabled=p?.version===1&&p.enabled===true&&p.graceDays===4
  return {version:1,configured:true,enabled:enabled&&!paused,paused:paused||!enabled,graceDays:4}
 } catch(error) {return {version:1,configured:error.code!=='ENOENT',enabled:false,paused:true,graceDays:4,error:error.code==='ENOENT'?null:'automation_policy_unreadable'}}
}

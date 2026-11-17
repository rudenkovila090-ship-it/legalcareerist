import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'

const repo=path.resolve(import.meta.dirname,'../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'diana-pay-link-'))
const write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data)}
const readLines=file=>fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[]
async function scenario(kind){
  const root=path.join(temp,kind),server=path.join(root,'server'),bin=path.join(root,'bin'),modeFile=path.join(root,'mode'),callsFile=path.join(root,'calls.jsonl'),pm2Log=path.join(root,'pm2.jsonl')
  fs.mkdirSync(server,{recursive:true});fs.cpSync(path.join(repo,'server/lib'),path.join(server,'lib'),{recursive:true})
  write(path.join(server,'package.json'),'{"type":"module"}');write(path.join(server,'index.js'),'// Existing API entry, never executed.\n')
  write(path.join(server,'.env'),'TELEGRAM_BOT_TOKEN=999999:SYNTHETIC_ONLY_TOKEN\nPRODAMUS_SECRET_KEY=SYNTHETIC_ONLY_PAYMENT_KEY\nSITE_URL=https://legalcareerist.ru\n')
  const joins={ownerGrant:{tgUserId:'1955667679',paid:false,status:'active',ownerAccess:{active:true,reason:'keep_member'}}}
  if(['already-paid','estimated-card'].includes(kind)){
    const at=Date.now();joins.paid={tgUserId:'1955667679',paid:true,status:'active',lastPaidAt:at,nextPaymentAt:at+86400000,payments:[{at,amount:350,orderKey:'fixture-order',...(kind==='estimated-card'?{estimated:true}:{})}]}
  }
  const money=JSON.stringify(joins);write(path.join(server,'data/pending-joins.json'),money)
  write(modeFile,kind)
  if(kind==='wrong-price-code')write(path.join(server,'lib/prodamus.js'),"export const buildSubscriptionLink=()=> 'https://legalcareerist.payform.ru/?subscription=2854597&tg_user_id=1955667679';export const createPaymentLink=()=>{throw Error('SHOULD_NOT_CALL')}\n")
  const stub=path.join(root,'stub.mjs')
  write(stub,`import fs from 'node:fs';
const modeFile=${JSON.stringify(modeFile)},callsFile=${JSON.stringify(callsFile)};
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input),kind=fs.readFileSync(modeFile,'utf8');
 if(url.hostname==='api.telegram.org'){
  const method=url.pathname.split('/').at(-1),body=JSON.parse(options.body||'{}');
  if(!['getMe','getChat','sendMessage'].includes(method))throw Error('forbidden method');
  fs.appendFileSync(callsFile,JSON.stringify({method,body})+'\\n');
  if(method==='getMe')return Response.json({ok:true,result:{username:kind==='wrong-bot'?'another_bot':'legalcareerist_bot'}});
  if(method==='getChat')return Response.json({ok:true,result:{id:1955667679,type:'private',username:kind==='wrong-recipient'?'someone_else':'mulanka_7'}});
  if(kind==='blocked')return Response.json({ok:false,error_code:403,description:'blocked fixture'},{status:403});
  if(kind==='ambiguous')throw Error('SYNTHETIC_ONLY_TOKEN must never be logged');
  if(kind==='concurrent')await new Promise(r=>setTimeout(r,100));
  return Response.json({ok:true,result:{message_id:77117,chat:{id:1955667679}}});
 }
 if(url.hostname==='legalcareerist.payform.ru'){
  if(url.searchParams.get('subscription')!=='2611878'||url.searchParams.get('tg_user_id')!=='1955667679')throw Error('wrong signed identifiers');
  fs.appendFileSync(callsFile,JSON.stringify({method:'checkout',subscription:url.searchParams.get('subscription'),telegramId:url.searchParams.get('tg_user_id')})+'\\n');
  if(kind==='provider-failure')throw Error('SYNTHETIC_ONLY_PAYMENT_KEY');
  return new Response('https://payform.ru/SYNTHETIC_DIANA_350/');
 }
 throw Error('unexpected outbound request');
};\n`)
  write(path.join(bin,'pm2'),'#!/usr/bin/env node\nconst fs=require("node:fs"),args=process.argv.slice(2);fs.appendFileSync('+JSON.stringify(pm2Log)+',JSON.stringify(args)+"\\n");if(JSON.stringify(args)!==\'["jlist"]\')process.exit(90);process.stdout.write('+JSON.stringify(JSON.stringify([{name:'legalcareerist-api',pm2_env:{status:'online',pm_exec_path:path.join(server,'index.js'),pm_cwd:server}}]))+');')
  fs.chmodSync(path.join(bin,'pm2'),0o755)
  const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,NODE_OPTIONS:'--import '+stub}
  const invoke=()=>new Promise(resolve=>{
    let output='';const child=spawn(process.execPath,[path.join(repo,'scripts/send-diana-payment-link.mjs')],{env})
    child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('close',code=>resolve({code,output}))
  })
  const journalFile=path.join(server,'data/operator-notices/diana-payment-link-20261117.json')
  if(kind==='concurrent'){
    const both=await Promise.all([invoke(),invoke()]);assert.ok(both.some(r=>r.code===0),JSON.stringify(both))
    assert.equal(readLines(callsFile).filter(c=>c.method==='sendMessage').length,1)
    assert.equal(JSON.parse(fs.readFileSync(journalFile)).state,'sent')
  }else{
    let result=await invoke();assert.ok(!result.output.includes('SYNTHETIC_ONLY_TOKEN')&&!result.output.includes('SYNTHETIC_ONLY_PAYMENT_KEY'),result.output)
    let calls=readLines(callsFile)
    if(['success','estimated-card'].includes(kind)){
      assert.equal(result.code,0,result.output);assert.match(result.output,/DIANA_PAYMENT_LINK_SENT/)
      const sends=calls.filter(c=>c.method==='sendMessage');assert.equal(sends.length,1)
      assert.equal(sends[0].body.chat_id,1955667679)
      assert.match(sends[0].body.text,/350 ₽ в месяц/)
      assert.equal(sends[0].body.reply_markup.inline_keyboard[0][0].url,'https://payform.ru/SYNTHETIC_DIANA_350/')
      assert.equal(JSON.parse(fs.readFileSync(journalFile)).messageId,77117)
      const count=calls.length;result=await invoke();assert.equal(result.code,0,result.output)
      assert.equal(readLines(callsFile).length,count)
    }else if(kind==='already-paid'){
      assert.equal(result.code,0,result.output);assert.match(result.output,/DIANA_ALREADY_PAID/);assert.equal(calls.length,0)
    }else{
      assert.equal(result.code,1,result.output);assert.ok(!result.output.includes('DIANA_PAYMENT_LINK_SENT'))
      if(kind==='ambiguous'){
        assert.equal(JSON.parse(fs.readFileSync(journalFile)).state,'unknown')
        const count=calls.length;result=await invoke();assert.equal(result.code,1)
        assert.equal(readLines(callsFile).length,count)
      }else if(kind==='blocked'){
        assert.equal(JSON.parse(fs.readFileSync(journalFile)).state,'failed')
        write(modeFile,'success');result=await invoke();assert.equal(result.code,0,result.output)
        assert.equal(readLines(callsFile).filter(c=>c.method==='checkout').length,1)
        assert.equal(JSON.parse(fs.readFileSync(journalFile)).state,'sent')
      }else assert.equal(calls.filter(c=>c.method==='sendMessage').length,0)
    }
  }
  assert.equal(fs.readFileSync(path.join(server,'data/pending-joins.json'),'utf8'),money)
  assert.equal(fs.readFileSync(path.join(server,'index.js'),'utf8'),'// Existing API entry, never executed.\n')
  assert.ok(readLines(pm2Log).every(args=>JSON.stringify(args)==='["jlist"]'))
  console.log('PASS Diana payment-link delivery:',kind,'; access and financial history preserved')
}
try{for(const kind of ['success','estimated-card','already-paid','wrong-bot','wrong-recipient','wrong-price-code','provider-failure','blocked','ambiguous','concurrent'])await scenario(kind)}finally{fs.rmSync(temp,{recursive:true,force:true})}

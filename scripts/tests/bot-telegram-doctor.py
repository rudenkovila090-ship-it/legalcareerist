import tempfile,pathlib,json,subprocess,os
repo=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='bot-doctor-e2e-') as d:
 root=pathlib.Path(d);runtime=root/'server';runtime.mkdir();(runtime/'data').mkdir();(root/'bin').mkdir()
 (runtime/'index.js').write_text("const COMMUNITY_CHAT_ID = process.env.COMMUNITY_CHAT_ID || '-100111';")
 (runtime/'.env').write_text('TELEGRAM_BOT_TOKEN=STALE_PRIVATE\nCOMMUNITY_CHAT_ID=-100222')
 (root/'live.env').write_text('TELEGRAM_BOT_TOKEN=ACTUAL_PRIVATE\nCOMMUNITY_CHAT_ID=-100333')
 (runtime/'data'/'bot-users.json').write_text(json.dumps({'12345':{'id':'12345','firstName':'Анастасия','lastName':'Шеманаева','username':'@synthetic','tags':['цена_350']}}))
 (runtime/'data'/'pending-joins.json').write_text('{}')
 app={'name':'legalcareerist-api','pm2_env':{'pm_exec_path':str(runtime/'index.js'),'pm_cwd':str(root),'node_args':['--env-file=live.env']}}
 (root/'pm2.json').write_text(json.dumps([app]))
 shim=root/'bin'/'pm2';shim.write_text('#!/bin/sh\ncat '+str(root/'pm2.json')+'\n');shim.chmod(0o755)
 stub=root/'stub.mjs';stub.write_text('globalThis.fetch=async(url,init)=>{if(!String(url).includes("ACTUAL_PRIVATE"))throw Error("wrong token");const method=new URL(url).pathname.split("/").at(-1),b=JSON.parse(init.body);if(method!=="getMe"&&b.chat_id!=="-100333")throw Error("wrong chat");return Response.json({ok:true,result:method==="getMe"?{id:9000001,username:"synthetic_bot"}:method==="getChat"?{id:-100333,title:"Synthetic community",type:"supergroup"}:{status:"administrator",can_invite_users:true,can_restrict_members:true}})};')
 env={**os.environ,'PATH':str(root/'bin')+os.pathsep+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub)}
 r=subprocess.run(['node',str(repo/'scripts/diagnose-community-telegram.mjs')],env=env,text=True,capture_output=True)
 assert r.returncode==0,r.stderr+r.stdout
 assert 'ACTUAL_PRIVATE' not in r.stdout and 'STALE_PRIVATE' not in r.stdout,r.stdout
 assert '"previousAuditUsedDifferentChat":true' in r.stdout,r.stdout
 assert '"canInvite":true' in r.stdout and '"canRemove":true' in r.stdout,r.stdout
 assert 'ANASTASIA_CANDIDATE' in r.stdout,r.stdout
 assert (runtime/'.env').read_text().endswith('COMMUNITY_CHAT_ID=-100222')
 print('PASS doctor: active environment and actual chat, verified rights, exact diagnostic names, no credential output or settings changes')

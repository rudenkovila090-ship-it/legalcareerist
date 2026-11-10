import tempfile,pathlib,json,subprocess,os
repo=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='bot-audit-identity-') as temp:
 root=pathlib.Path(temp);runtime=root/'server';(runtime/'lib').mkdir(parents=True);(runtime/'data').mkdir();(root/'bin').mkdir()
 (runtime/'index.js').write_text("const COMMUNITY_CHAT_ID = process.env.COMMUNITY_CHAT_ID || '-100123';")
 (runtime/'package.json').write_text('{"type":"module"}')
 (runtime/'lib/subscriptionAccess.js').write_bytes((repo/'server/lib/subscriptionAccess.js').read_bytes())
 (runtime/'lib/communityAccessPolicy.js').write_bytes((repo/'server/lib/communityAccessPolicy.js').read_bytes())
 users={'1287078598':{'id':'1287078598','username':'@svetik_di','firstName':'Svetlana','tags':[]}}
 cards={'private-token':{'name':'Светлана','tgUserId':1287078598,'paid':True,'status':'active','nextPaymentAt':1800000000000,'payments':[{'at':1794168780000,'amount':690,'subscriptionId':'2854597'}]}}
 (runtime/'data/bot-users.json').write_text(json.dumps(users));datafile=runtime/'data/pending-joins.json';datafile.write_text(json.dumps(cards));before=datafile.read_bytes()
 state={'name':'legalcareerist-api','pm2_env':{'pm_exec_path':str(runtime/'index.js'),'pm_cwd':str(runtime),'TELEGRAM_BOT_TOKEN':'PRIVATE_TEST_ONLY','COMMUNITY_CHAT_ID':'-100123','PORT':'3456','SITE_URL':'http://127.0.0.1:3456'}}
 (root/'pm2.json').write_text(json.dumps([state]));shim=root/'bin/pm2';shim.write_text('#!/bin/sh\ncat '+str(root/'pm2.json')+'\n');shim.chmod(0o755)
 stub=root/'stub.mjs';stub.write_text('''globalThis.fetch=async(url,init={})=>{const u=new URL(url);if(u.hostname==='api.telegram.org'){const method=u.pathname.split('/').at(-1),b=JSON.parse(init.body);if(!['getMe','getWebhookInfo','getChatMember'].includes(method))throw Error('Write request forbidden');return Response.json({ok:true,result:method==='getMe'?{id:123456,username:'synthetic_bot'}:method==='getWebhookInfo'?{pending_update_count:0}:b.user_id===123456?{status:'administrator',can_invite_users:true,can_restrict_members:true}:{status:'member'}})}return Response.json({ok:true,subscriptionExpiry:3,automaticProviderCancellation:false})};''')
 env={**os.environ,'PATH':str(root/'bin')+os.pathsep+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub)}
 r=subprocess.run(['node',str(repo/'scripts/audit-community-bot.mjs')],env=env,text=True,capture_output=True,check=True)
 report=json.loads(r.stdout);case=next(c for c in report['cases'] if c['name']=='Светик_DI')
 assert len(case['cards'])==1 and case['cards'][0]['tgUserId']==1287078598,case
 assert case['cards'][0]['lastPayment']['amount']==690,case
 assert 'private-token' not in r.stdout and 'PRIVATE_TEST_ONLY' not in r.stdout
 assert datafile.read_bytes()==before
 print('PASS audit identity: different legal name and Telegram nickname correlate by exact ID; payment data preserved; no secret output or mutations')

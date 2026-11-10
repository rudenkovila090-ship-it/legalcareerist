import tempfile,pathlib,json,subprocess,os,threading,http.server
repo=pathlib.Path(__file__).resolve().parents[2]
old_module=None
old_index=subprocess.check_output(['git','show','c5d91c399aa9285981f88da8e9d4d42ad144946d:server/index.js'],cwd=repo)
for mode in ['success','unknown-source','restart-fail','unconfirmed-payment']:
 with tempfile.TemporaryDirectory(prefix='bot-resume-') as temp:
  root=pathlib.Path(temp);runtime=root/'server';runtime.mkdir();(runtime/'lib').mkdir();(runtime/'data').mkdir();(root/'bin').mkdir()
  (runtime/'index.js').write_bytes(old_index);(runtime/'package.json').write_text('{"type":"module"}')
  
  if mode=='unknown-source':(runtime/'lib/communityPaymentCompletion.js').write_text('// unknown operator library')
  (runtime/'lib/subscriptionAccess.js').write_bytes((repo/'server/lib/subscriptionAccess.js').read_bytes())
  old={'old':{'name':'Шемонаева Анастасия','tgUserId':'376201355','paid':True,'status':'active','lifetime':True,'complimentary':{'nominalAmount':350},'payments':[]},'svetik':{'name':'Светлана','tgUserId':'1287078598','paid':True,'status':'active','nextPaymentAt':4070908800000,'payments':[{'at':1794168780000,'amount':690,'subscriptionId':'2854597'}]}}
  (runtime/'data/pending-joins.json').write_text(json.dumps(old));(runtime/'data/bot-users.json').write_text(json.dumps({'1287078598':{'id':'1287078598','username':'@svetik_di','tags':[]}}))
  class Handler(http.server.BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):self.reply(200,{'ok':True,'subscriptionExpiry':3,'billingAuditVersion':1 if 'billingAuditVersion: 1,' in (runtime/'index.js').read_text() else 0,'automaticProviderCancellation':False})
   def reply(self,code,body):
    self.send_response(code);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
   def do_POST(self):
    self.rfile.read(int(self.headers.get('Content-Length','0')))
    if self.path=='/api/internal/subscription-policy':
     if mode=='unconfirmed-payment':self.reply(503,{'ok':False,'error':'svetik_verified_payment_not_found'});return
     self.reply(200,{'ok':True,'svetik':{'ok':True,'verifiedPaymentAt':1794168780000,'amount':690,'paidUntil':4070908800000},'website':{'ok':True,'unpaidProbeRemoved':True,'realChargePerformed':False}});return
    self.reply(403 if self.path=='/api/prodamus/webhook' else 400,{'ok':False,'error':'consent_required'})
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();port=server.server_port
  (root/'live.env').write_text('PRODAMUS_SECRET_KEY=PRIVATE_KEY\nTELEGRAM_BOT_TOKEN=PRIVATE_BOT\nCOMMUNITY_CHAT_ID=-100123\nAUTO_EXCLUDE=1\nPORT='+str(port)+'\nSITE_URL=http://127.0.0.1:'+str(port))
  state={'name':'legalcareerist-api','pm2_env':{'status':'online','pm_exec_path':str(runtime/'index.js'),'pm_cwd':str(root),'node_args':['--env-file=live.env']}}
  (root/'pm2.json').write_text(json.dumps([state]))
  shim=root/'bin/pm2';shim.write_text('''#!/usr/bin/env python3
import json,sys,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
with (root/'calls').open('a') as f:f.write(json.dumps(sys.argv[1:])+'\\n')
if sys.argv[1]=='jlist':print((root/'pm2.json').read_text())
if sys.argv[1]=='restart' and (root/'fail').exists():(root/'fail').unlink();sys.exit(1)
''');shim.chmod(0o755)
  if mode=='restart-fail':(root/'fail').write_text('1')
  stub=root/'stub.mjs';stub.write_text('const real=globalThis.fetch;globalThis.fetch=async(url,init)=>{if(new URL(url).hostname!=="api.telegram.org")return real(url,init);const method=new URL(url).pathname.split("/").at(-1),b=JSON.parse(init.body);return Response.json({ok:true,result:method==="getMe"?{id:123456,username:"synthetic_bot"}:method==="getWebhookInfo"?{pending_update_count:0}:b.user_id===123456?{status:"administrator",can_invite_users:true,can_restrict_members:true}:{status:"member"}})}')
  env={**os.environ,'PATH':str(root/'bin')+os.pathsep+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub),'BOT_COMPLETION_BACKUP_ROOT':str(root/'backups')}
  run=lambda:subprocess.run(['node',str(repo/'scripts/complete-community-audit.mjs')],env=env,text=True,capture_output=True)
  result=run();assert 'PRIVATE_KEY' not in result.stdout+result.stderr and 'PRIVATE_BOT' not in result.stdout+result.stderr
  if mode=='success':
   assert result.returncode==0,result.stdout+result.stderr;assert 'COMMUNITY_AUDIT_COMPLETE' in result.stdout
   count=(root/'calls').read_text().count('restart');again=run();assert again.returncode==0,again.stderr;assert (root/'calls').read_text().count('restart')==count
  else:
   assert result.returncode!=0,result.stdout
   if mode=='restart-fail':assert (runtime/'index.js').read_bytes()==old_index and not (runtime/'lib/communityPaymentCompletion.js').exists()
  assert json.loads((runtime/'data/pending-joins.json').read_text())['old']['payments']==old['old']['payments']
  server.shutdown();server.server_close()
  print('PASS complete audit:',mode,'— exact ID, actual grant verification, financial history and safe retry/rollback')

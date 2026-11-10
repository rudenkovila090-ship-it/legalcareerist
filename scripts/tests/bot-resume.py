import tempfile,pathlib,json,subprocess,os,threading,http.server
repo=pathlib.Path(__file__).resolve().parents[2]
old_module=subprocess.check_output(['git','show','60d71030cf0a69028e7af1bd74026294c137451b:server/lib/communityMaintenance.js'],cwd=repo)
old_index=subprocess.check_output(['git','show','60d71030cf0a69028e7af1bd74026294c137451b:server/index.js'],cwd=repo)
for mode in ['success','unknown-source','restart-fail','unconfirmed-grant']:
 with tempfile.TemporaryDirectory(prefix='bot-resume-') as temp:
  root=pathlib.Path(temp);runtime=root/'server';runtime.mkdir();(runtime/'lib').mkdir();(runtime/'data').mkdir();(root/'bin').mkdir()
  (runtime/'index.js').write_bytes(old_index);(runtime/'package.json').write_text('{"type":"module"}')
  (runtime/'lib/communityMaintenance.js').write_bytes(old_module if mode!='unknown-source' else old_module+b'\n// operator change\n')
  (runtime/'lib/subscriptionAccess.js').write_bytes((repo/'server/lib/subscriptionAccess.js').read_bytes())
  (runtime/'lib/communityAccessPolicy.js').write_bytes((repo/'server/lib/communityAccessPolicy.js').read_bytes())
  old={'old':{'name':'Шемонаева Анастасия','tgUserId':'376201355','paid':True,'status':'active','nextPaymentAt':1,'payments':[{'at':1,'amount':350,'subscriptionId':'legacy'}]}}
  (runtime/'data/pending-joins.json').write_text(json.dumps(old));(runtime/'data/bot-users.json').write_text('{}')
  class Handler(http.server.BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_GET(self):self.reply(200,{'ok':True,'subscriptionExpiry':3,'automaticProviderCancellation':False})
   def reply(self,code,body):
    self.send_response(code);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
   def do_POST(self):
    self.rfile.read(int(self.headers.get('Content-Length','0')))
    if self.path=='/api/internal/subscription-policy':
     if mode!='unconfirmed-grant':
      data=dict(old);data['free']={'name':'Шемонаева Анастасия','tgUserId':'376201355','paid':True,'status':'active','lifetime':True,'payments':[],'complimentary':{'nominalAmount':350}}
      (runtime/'data/pending-joins.json').write_text(json.dumps(data))
     self.reply(200,{'ok':True,'complimentary':'lifetime_nominal_350','linkedPaidCards':0,'absentReviewsClosed':0});return
    self.reply(400,{'ok':False,'error':'consent_required'})
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();port=server.server_port
  (root/'live.env').write_text('PRODAMUS_SECRET_KEY=PRIVATE_KEY\nTELEGRAM_BOT_TOKEN=PRIVATE_BOT\nCOMMUNITY_CHAT_ID=-100123\nPORT='+str(port)+'\nSITE_URL=http://127.0.0.1:'+str(port))
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
  env={**os.environ,'PATH':str(root/'bin')+os.pathsep+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub),'BOT_RESUME_BACKUP_ROOT':str(root/'backups')}
  run=lambda:subprocess.run(['node',str(repo/'scripts/resume-community-bot.mjs')],env=env,text=True,capture_output=True)
  result=run();assert 'PRIVATE_KEY' not in result.stdout+result.stderr and 'PRIVATE_BOT' not in result.stdout+result.stderr
  if mode=='success':
   assert result.returncode==0,result.stdout+result.stderr;assert 'BOT_FINISH_READY' in result.stdout
   count=(root/'calls').read_text().count('restart');again=run();assert again.returncode==0,again.stderr;assert (root/'calls').read_text().count('restart')==count
  else:
   assert result.returncode!=0,result.stdout
   if mode=='restart-fail':assert (runtime/'index.js').read_bytes()==old_index and (runtime/'lib/communityMaintenance.js').read_bytes()==old_module
  assert json.loads((runtime/'data/pending-joins.json').read_text())['old']['payments']==old['old']['payments']
  server.shutdown();server.server_close()
  print('PASS resume:',mode,'— exact ID, actual grant verification, financial history and safe retry/rollback')

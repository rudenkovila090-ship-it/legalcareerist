import tempfile,pathlib,json,subprocess,os,threading,http.server
repo=pathlib.Path(__file__).resolve().parents[2]
manifest=json.loads((repo/'updates/community-completion/manifest.json').read_text())
for mode in ['success','unknown-module','restart-failure','health-failure','delivery-pending']:
 with tempfile.TemporaryDirectory(prefix='completion-install-') as temp:
  root=pathlib.Path(temp);runtime=root/'server';(runtime/'lib').mkdir(parents=True);(runtime/'data').mkdir();(root/'bin').mkdir()
  (runtime/'package.json').write_text('{"type":"module"}');originals={}
  for entry in manifest['files']:
   if entry['new']:continue
   f=runtime/entry['path'];f.write_bytes(subprocess.check_output(['git','show',manifest['base']+':server/'+entry['path']],cwd=repo));originals[entry['path']]=f.read_bytes()
  data=runtime/'data/pending-joins.json';data.write_text('{"real":{"paid":true,"payments":[{"amount":350,"orderKey":"KEEP"}]}}');financial=data.read_bytes()
  policy=runtime/'data/community-subscription-automation.json';policy.write_text('{"policy":{"version":1,"enabled":true,"graceDays":4}}');settings=policy.read_bytes()
  if mode=='unknown-module':(runtime/'lib/communityCompletion.js').write_text('// unknown operator source')
  class Handler(http.server.BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def reply(self,status,body):
    self.send_response(status);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
   def do_GET(self):
    updated='communityFollowup: 1,' in (runtime/'index.js').read_text()
    self.reply(200,{'ok':not(mode=='health-failure' and updated),'communityFollowup':1 if updated else 0,'subscriptionAutomation':1,'autoExclude':True,'graceDays':4,'automaticAccessRemovalPaused':False})
   def do_POST(self):
    b=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))));assert b['operation']=='finish_community_followup_20261110';assert self.headers.get('X-Recovery-Signature')
    cases=[{'ok':True,'name':'Анастасия','username':'ognevushaa','joined':False,'inviteAcceptedByTelegram':True},{'ok':True,'name':'Диана','username':'mulanka_7','joined':True,'reminder350':'sent'},{'ok':True,'name':'Кристина','username':'civillaw_civile','joined':False,'inviteAcceptedByTelegram':True,'currentPaymentVerified':False}]
    if mode=='delivery-pending':cases[0]['inviteAcceptedByTelegram']=False
    self.reply(200,{'ok':True,'cases':cases,'unverifiedCards':0,'historical':[{'name':n,'telegramId':str(i)} for i,n in enumerate(['Артём','Олеся','Панкрат','Егор'])],'pendingDeliveries':1 if mode=='delivery-pending' else 0,'pendingReminders':0,'bankEvidenceMissing':['civillaw_civile'],'confirmedRenewalsSinceActivation':0})
  server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
  (root/'live.env').write_text('PRODAMUS_SECRET_KEY=PRIVATE_TEST_KEY\nPORT='+str(server.server_port))
  state={'name':'legalcareerist-api','pm2_env':{'status':'online','pm_exec_path':str(runtime/'index.js'),'pm_cwd':str(root),'node_args':['--env-file=live.env']}}
  (root/'pm2.json').write_text(json.dumps([state]));shim=root/'bin/pm2';shim.write_text('''#!/usr/bin/env python3
import json,sys,pathlib
root=pathlib.Path(__file__).resolve().parent.parent
with (root/'calls').open('a') as f:f.write(json.dumps(sys.argv[1:])+'\\n')
if sys.argv[1]=='jlist':print((root/'pm2.json').read_text())
if sys.argv[1]=='restart' and (root/'fail').exists():(root/'fail').unlink();sys.exit(1)
''');shim.chmod(0o755)
  if mode=='restart-failure':(root/'fail').write_text('1')
  env={**os.environ,'PATH':str(root/'bin')+os.pathsep+os.environ['PATH'],'BOT_FINISH_BACKUP_ROOT':str(root/'backups')}
  invoke=lambda:subprocess.run(['node',str(repo/'scripts/install-community-completion.mjs')],env=env,text=True,capture_output=True)
  r=invoke();assert 'PRIVATE_TEST_KEY' not in r.stdout+r.stderr
  if mode=='success':
   assert r.returncode==0,r.stdout+r.stderr;assert 'COMMUNITY_FOLLOWUP_READY' in r.stdout
   calls=(root/'calls').read_text();again=invoke();assert again.returncode==0,again.stdout+again.stderr;assert (root/'calls').read_text().count('restart')==calls.count('restart')
   assert 'банковского подтверждения текущего периода в журнале нет' in r.stdout
  elif mode=='delivery-pending':assert r.returncode==2 and 'FOLLOWUP_PENDING_DELIVERY' in r.stdout and 'COMMUNITY_FOLLOWUP_READY' not in r.stdout
  else:
   assert r.returncode!=0,r.stdout
   for name,b in originals.items():assert (runtime/name).read_bytes()==b,name
   assert 'COMMUNITY_FOLLOWUP_READY' not in r.stdout
  if mode=='unknown-module':assert 'stop' not in (root/'calls').read_text()
  assert data.read_bytes()==financial and policy.read_bytes()==settings
  assert not (runtime/'data/community-removals-paused.json').exists()
  server.shutdown();server.server_close()
  print('PASS completion installer:',mode,'— active automation and money preserved; truthful delivery/bank proof; rollback and repeat')

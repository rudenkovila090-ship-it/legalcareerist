import tempfile,pathlib,json,subprocess,os,threading,http.server
repo=pathlib.Path(__file__).resolve().parents[2]
manifest=json.loads((repo/'updates/community-subscription-automation/manifest.json').read_text())
for mode in ['success','unknown-module','restart-failure','health-failure','activation-failure']:
 with tempfile.TemporaryDirectory(prefix='access-rescue-install-') as temp:
  root=pathlib.Path(temp);runtime=root/'server';(runtime/'lib').mkdir(parents=True);(runtime/'data').mkdir();(root/'bin').mkdir()
  (runtime/'package.json').write_text('{"type":"module"}')
  originals={}
  for entry in manifest['files']:
   if entry['new']:continue
   f=runtime/entry['path'];f.write_bytes(subprocess.check_output(['git','show',manifest['base']+':server/'+entry['path']],cwd=repo));originals[entry['path']]=f.read_bytes()
  (runtime/'data/pending-joins.json').write_text('{"real":{"paid":true,"payments":[{"amount":350,"orderKey":"REAL-PRESERVE"}]}}')
  financial=(runtime/'data/pending-joins.json').read_bytes()
  if mode=='unknown-module':(runtime/'lib/subscriptionAutomation.js').write_text('// unknown operator code')
  class Handler(http.server.BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def reply(self,status,body):
    self.send_response(status);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(body).encode())
   def do_GET(self):
    updated='subscriptionAutomation: 1,' in (runtime/'index.js').read_text()
    self.reply(200,{'ok':not(mode=='health-failure' and updated),'subscriptionAutomation':1 if updated else 0,'autoExclude':not (runtime/'data/community-removals-paused.json').exists(),'graceDays':4,'automationLastCycle':{'ok':True},'automaticAccessRemovalPaused':(runtime/'data/community-removals-paused.json').exists()})
   def do_POST(self):
    body=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))));assert body['operation']=='activate_subscription_automation_v1';assert self.headers.get('X-Recovery-Signature')
    if body['send']:
     (runtime/'data/community-subscription-automation.json').write_text(json.dumps({'policy':{'version':1,'enabled':True,'graceDays':4}}))
     (runtime/'data/community-removals-paused.json').unlink()
     if mode=='activation-failure':self.reply(503,{'ok':False,'error':'synthetic_activation_failure'});return
    self.reply(200,{'ok':True,'enabled':body['send'],'permanentExceptionsConfirmed':True,'cycle':{'ok':True},'reconciliation':{'ok':True},'website':{'ok':True,'realChargePerformed':False},'plan':[]})

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
  env={**os.environ,'PATH':str(root/'bin')+os.pathsep+os.environ['PATH'],'BOT_AUTOMATION_BACKUP_ROOT':str(root/'backups')}
  invoke=lambda:subprocess.run(['node',str(repo/'scripts/install-subscription-automation.mjs')],env=env,text=True,capture_output=True)
  result=invoke()
  assert 'PRIVATE_TEST_KEY' not in result.stdout+result.stderr
  if mode=='success':
   assert result.returncode==0,result.stdout+result.stderr;assert 'SUBSCRIPTION_AUTOMATION_READY' in result.stdout
   again=invoke();assert again.returncode==0,again.stdout+again.stderr
   assert (runtime/'index.js').read_text().count("if (fs.existsSync(path.join(import.meta.dirname,'data/community-removals-paused.json'))) return false")==1
  else:
   assert result.returncode!=0,result.stdout
   assert 'SUBSCRIPTION_AUTOMATION_READY' not in result.stdout
   for name,before in originals.items():
    if name!='index.js' and mode!='activation-failure':assert (runtime/name).read_bytes()==before,name
  assert (runtime/'data/community-removals-paused.json').exists() == (mode!='success')
  assert "if (fs.existsSync(path.join(import.meta.dirname,'data/community-removals-paused.json'))) return false" in (runtime/'index.js').read_text()
  assert (runtime/'data/pending-joins.json').read_bytes()==financial
  calls=[json.loads(l) for l in (root/'calls').read_text().splitlines()]
  assert ['stop','legalcareerist-api'] in calls
  server.shutdown();server.server_close()
  print('PASS subscription automation install:',mode,'— initial containment, safe rollback, persistent pause, immutable financial data')

import pathlib,tempfile,subprocess,json,hashlib,stat
repo=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='promo-rule-') as tmp:
 root=pathlib.Path(tmp);data=root/'server/data';data.mkdir(parents=True)
 sentinel=data/'pending-joins.json';sentinel.write_text('{"existing":{"paid":true,"payments":[{"amount":690}]}}');before=sentinel.read_bytes()
 rules=data/'community-promo-rules.json';rules.write_text(json.dumps({'version':1,'rules':{'another-rule':{'active':True,'amount':500}}}))
 cmd=['node',str(repo/'scripts/configure-community-promo.mjs'),'--runtime',str(data.parent),'--code','synthetic350','--amount','350','--backup-root',str(root/'backups')]
 run=subprocess.run(cmd,text=True,capture_output=True);assert run.returncode==0,(run.stdout,run.stderr)
 saved=json.loads(rules.read_text());key=hashlib.sha256(b'SYNTHETIC350').hexdigest();rule=saved['rules'][key]
 assert rule['subscriptionId']=='2611878' and rule['amount']==350 and rule['months']==1 and rule['baseSubscriptionId']=='2854597' and rule['active'] is True
 assert saved['rules']['another-rule']=={'active':True,'amount':500};assert sentinel.read_bytes()==before;assert stat.S_IMODE(rules.stat().st_mode)==0o600
 first=rules.read_bytes();backup_count=len(list((root/'backups').iterdir()))
 run=subprocess.run(cmd,text=True,capture_output=True);assert run.returncode==0;assert rules.read_bytes()==first;assert len(list((root/'backups').iterdir()))==backup_count
 invalid=cmd.copy();invalid[invalid.index('--amount')+1]='349';run=subprocess.run(invalid,text=True,capture_output=True);assert run.returncode!=0 and rules.read_bytes()==first and sentinel.read_bytes()==before
 print('PASS: private hashed promo rule selects approved monthly 350 plan, preserves other rules and money, applies idempotently and rejects unsupported prices')

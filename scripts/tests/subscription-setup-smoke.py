"""Exercise the setup controller with fake PM2/provider, private disposable data and no network."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[2]
NODE = shutil.which('node')

def run(mode, repeat=False):
    root = pathlib.Path(tempfile.mkdtemp(prefix='subscription-setup-smoke-'))
    try:
        site, bin_dir, backups = root/'site', root/'bin', root/'backups'
        for p in [site/'server/data', site/'dist/assets', bin_dir, backups]: p.mkdir(parents=True, exist_ok=True)
        (site/'server/index.js').write_text("const COMMUNITY_CHAT_ID = process.env.COMMUNITY_CHAT_ID || '-1001'\n")
        (site/'server/.env').write_text('PORT=3999\nSITE_URL=https://example.invalid\nTEST_PRIVATE=SENTINEL_SECRET\n')
        cards = {'active': {'paid':True,'status':'active','nextPaymentAt':1,'payments':[{'at':1,'amount':690,'subscriptionId':'2854597'}]},'unknown':{'paid':True,'status':'active','nextPaymentAt':None,'payments':[]},'founder':{'paid':True,'status':'active','lifetime':True,'payments':[]}}
        (site/'server/data/pending-joins.json').write_text(json.dumps(cards))
        (site/'server/data/bot-users.json').write_text(json.dumps({'61':{'id':'61','username':'@synthetic_owner','tags':['founder']}}))
        (site/'dist/index.html').write_text('<script src="/assets/index.js"></script>')
        (site/'dist/assets/index.js').write_text('const renewal="/api/account/subscription/renew"')
        (root/'state.json').write_text(json.dumps({'online':True,'exclude':'0'}))
        (bin_dir/'pm2').write_text('''#!/usr/bin/env python3
import os,json,pathlib,sys
r=pathlib.Path(os.environ['SETUP_FIXTURE']);s=json.loads((r/'state.json').read_text());a=sys.argv[1]
if a=='jlist':
 print(json.dumps([{'name':'legalcareerist-api','pm2_env':{'status':'online' if s['online'] else 'stopped','exec_mode':'fork_mode','pm_exec_path':str(r/'site/server/index.js'),'PORT':'3999','AUTO_EXCLUDE':s['exclude'],'TELEGRAM_BOT_TOKEN':'SENTINEL_TOKEN','PRODAMUS_SECRET_KEY':'SENTINEL_PAYMENT','COMMUNITY_INVITE_LINK':'https://t.me/+SYNTHETIC','SITE_URL':'https://example.invalid'}}]))
else:
 if a=='save' and os.environ['SETUP_MODE']=='savefail':sys.exit(2)
 if a in ('stop','restart'):s['online']=a=='restart'
 if a=='restart' and '--update-env' in sys.argv:s['exclude']=os.environ.get('AUTO_EXCLUDE','0')
 (r/'state.json').write_text(json.dumps(s))
''')
        (bin_dir/'node').write_text(f'''#!/usr/bin/env python3
import os,pathlib,sys
r=pathlib.Path(os.environ['SETUP_FIXTURE']);args=sys.argv[1:]
if args and pathlib.Path(args[0]).name in ('install-site-reliability.mjs','installer.mjs'):
 if '--verify-files' in args:sys.exit(0)
 if '--rollback' in args:(r/'rollback-done').write_text('yes');sys.exit(0)
 d=r/'backups/deployment-synthetic';d.mkdir(exist_ok=True);(d/'installer.mjs').write_text('// test rollback entry')
 sys.exit(0)
os.execv({NODE!r},[{NODE!r}]+args)
''')
        for f in bin_dir.iterdir(): f.chmod(0o700)
        preload = root/'network.mjs'
        preload.write_text('''import fs from 'node:fs';import path from 'node:path';
const root=process.env.SETUP_FIXTURE,site=path.join(root,'site');
globalThis.fetch=async(input,init={})=>{
 const url=new URL(String(input)),method=url.pathname.split('/').at(-1);let body={};try{body=JSON.parse(init.body||'{}')}catch{}
 if(url.hostname==='api.telegram.org'){
  const results={getMe:{id:99,username:'synthetic_bot'},getWebhookInfo:{url:''},getChat:{id:61,type:'private',username:'synthetic_owner'},getChatMember:{status:'administrator',can_invite_users:true,can_restrict_members:true},sendMessage:{message_id:7}};
  if(!(method in results))throw Error('unexpected API operation');
  if(method==='sendMessage')fs.appendFileSync(path.join(root,'sent.jsonl'),JSON.stringify(body)+String.fromCharCode(10));
  return Response.json({ok:true,result:results[method]});
 }
 if(url.hostname==='127.0.0.1'){
  if(url.pathname==='/api/health')return Response.json({ok:true});
  if(url.pathname==='/api/prodamus/webhook')return new Response('',{status:400});
 }
 if(url.hostname==='example.invalid'){
  if(url.pathname==='/cabinet'){
   if(process.env.SETUP_MODE==='stale'){
    const file=path.join(site,'server/data/pending-joins.json'),cards=JSON.parse(fs.readFileSync(file));cards.active.payments.push({orderKey:'new-payment-after-backup',amount:690});fs.writeFileSync(file,JSON.stringify(cards));
    return new Response('<html>old deployment</html>');
   }
   return new Response(fs.readFileSync(path.join(site,'dist/index.html')));
  }
  if(url.pathname.startsWith('/assets/'))return new Response(fs.readFileSync(path.join(site,'dist',url.pathname.slice(1))));
 }
 throw Error('unexpected network call');
};
''')
        env={**os.environ,'PATH':str(bin_dir)+':'+os.environ['PATH'],'SETUP_FIXTURE':str(root),'SETUP_MODE':mode,'SITE_RELIABILITY_BACKUPS':str(backups),'SUBSCRIPTION_TEST_USERNAME':'wrong_owner' if mode=='wrong' else 'synthetic_owner'}
        command=[NODE,'--env-file='+str(site/'server/.env'),'--import',str(preload),str(REPO/'scripts/setup-community-subscriptions.mjs'),str(site)]
        result=subprocess.run(command,cwd=site,env=env,text=True,capture_output=True,timeout=30)
        assert all(s not in result.stdout+result.stderr for s in ['SENTINEL_TOKEN','SENTINEL_PAYMENT','SENTINEL_SECRET']),result.stdout+result.stderr
        if mode=='wrong':
            assert result.returncode!=0
            assert not (root/'sent.jsonl').exists()
            assert json.loads((site/'server/data/pending-joins.json').read_text())==cards
        elif mode in ('stale','savefail'):
            assert result.returncode!=0,result.stdout+result.stderr
            assert (root/'rollback-done').exists()
            assert (site/'server/.env').read_text().endswith('TEST_PRIVATE=SENTINEL_SECRET\n')
            if mode=='stale':assert json.loads((site/'server/data/pending-joins.json').read_text())['active']['payments'][-1]['orderKey']=='new-payment-after-backup'
            else:
                assert not (site/'server/data/subscription-policy.json').exists()
                assert json.loads((root/'state.json').read_text())['exclude']=='0'
            assert not (root/'sent.jsonl').exists()
        else:
            assert result.returncode==0,result.stdout+result.stderr
            updated=json.loads((site/'server/data/pending-joins.json').read_text())
            assert updated['active']['payments']==cards['active']['payments']
            assert updated['active']['priceLock']['amount']==690
            assert updated['active']['nextPaymentAt']==1
            assert 'transitionAccessUntil' not in updated['unknown']
            assert updated['founder']==cards['founder']
            assert 'AUTO_EXCLUDE=1' in (site/'server/.env').read_text()
            sent=[json.loads(s) for s in (root/'sent.jsonl').read_text().splitlines()]
            assert len(sent)==1 and sent[0]['chat_id']=='61' and sent[0]['text'].startswith('ТЕСТ ПОДПИСКИ')
            subprocess.run(['bash','-n',str(site/'update-subscriptions.local')],check=True)
            if repeat:
                deadline=updated['active']['transitionAccessUntil']
                second=subprocess.run(command,cwd=site,env=env,text=True,capture_output=True,timeout=30)
                assert second.returncode==0,second.stdout+second.stderr
                assert json.loads((site/'server/data/pending-joins.json').read_text())['active']['transitionAccessUntil']==deadline
        print('PASS setup controller:',mode, 'repeat' if repeat else '',flush=True)
    finally: shutil.rmtree(root)

run('valid',True)
run('wrong')
run('stale')
run('savefail')

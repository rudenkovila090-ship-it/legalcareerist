"""Run the incident command on disposable public/private files. No external services."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

repo = pathlib.Path(__file__).resolve().parents[2]
simulate_worker = os.geteuid() != 0 or not shutil.which('runuser')

with tempfile.TemporaryDirectory(prefix='site-403-') as tmp:
    fixture = pathlib.Path(tmp)
    fixture.chmod(0o755)
    live, public, binary = fixture/'site', fixture/'site/dist', fixture/'bin'
    (public/'assets').mkdir(parents=True)
    live.chmod(0o755)
    binary.mkdir()
    (live/'server/data/community-assets').mkdir(parents=True)
    html = '<html><div id="root"></div><script type="module" src="/assets/index-fixture.js"></script></html>'
    (public/'index.html').write_text(html)
    for name, body in [('index-fixture.js','ENTRY'),('CommunityHome-test.js','COMMUNITY'),('TariffJoinBlock-test.js','TARIFFS'),('promo.js','Промокод (необязательно)'),('index.css','BODY')]:
        (public/'assets'/name).write_text(body)
    pdf = os.environ.get('SITE_TEST_QUEST_PDF')
    if pdf:
        shutil.copyfile(pdf, live/'server/data/community-assets/newcomer-quest.pdf')
    else:
        (live/'server/data/community-assets/newcomer-quest.pdf').write_bytes(b'%PDF-synthetic')
    (live/'server/.env').write_text('PRODAMUS_SECRET_KEY=synthetic-private-key\n')
    (live/'server/.env').chmod(0o600)
    (live/'server/index.js').write_text('// synthetic code; not executed')
    (live/'server/data/payments.json').write_text('{"syntheticPayments":"preserve-exactly"}')
    (live/'server/data/payments.json').chmod(0o600)
    (live/'server/data/community-onboarding.json').write_text('{}')
    (live/'server/data').chmod(0o700)
    config = 'user www-data;\nhttp { server { listen 443 ssl; server_name legalcareerist.ru www.legalcareerist.ru; root "'+str(public)+'"; location /api/ { proxy_pass http://127.0.0.1:3001; } location / { try_files $uri $uri/ /index.html; } } }'
    (fixture/'config').write_text(config)
    (binary/'nginx').write_text('#!/usr/bin/env python3\nimport os,pathlib,sys\np=pathlib.Path(os.environ["SITE_HEALTH_FIXTURE"])\nif sys.argv[1]=="-T": print((p/"config").read_text())\n')
    state = [{'name':'legalcareerist-api','pm2_env':{'status':'online','pm_exec_path':str(live/'server/index.js'),'TELEGRAM_BOT_TOKEN':'fake-test-token','COMMUNITY_CHAT_ID':'-100123456','PORT':'3001'}}]
    (fixture/'pm2.json').write_text(json.dumps(state))
    (binary/'pm2').write_text('#!/usr/bin/env python3\nimport os,pathlib,sys\np=pathlib.Path(os.environ["SITE_HEALTH_FIXTURE"])\nassert sys.argv[1:]==["jlist"],"PM2 mutation forbidden"\nprint((p/"pm2.json").read_text())\n')
    (binary/'curl').write_text('''#!/usr/bin/env python3
import os,pathlib,subprocess
p=pathlib.Path(os.environ['SITE_HEALTH_FIXTURE']);f=p/'site/dist/index.html'
ok=subprocess.run(['runuser','-u','www-data','--','test','-r',str(f)]).returncode==0
print('200' if ok and not (p/'deny').exists() else '403',end='')
''')
    for f in binary.iterdir(): f.chmod(0o755)
    if simulate_worker:
        # This cloud shell is unprivileged. Model a different Unix user using the
        # actual other permission bits; production still requires real root/runuser.
        (binary/'runuser').write_text('''#!/usr/bin/env python3
import pathlib,sys
flag,name=sys.argv[-2:];p=pathlib.Path(name)
parents=list(p.parents)
ok=p.exists() and all(parent.stat().st_mode&0o001 for parent in parents)
if flag=='-d':ok=ok and p.is_dir()
if flag=='-x':ok=ok and bool(p.stat().st_mode&0o001)
if flag=='-r':ok=ok and bool(p.stat().st_mode&0o004)
sys.exit(0 if ok else 1)
''')
        (binary/'runuser').chmod(0o755)
    stub = fixture/'network-stub.mjs'
    stub.write_text(('process.getuid=()=>0;\n' if simulate_worker else '')+'''import fs from 'node:fs';import path from 'node:path';
const root=process.env.SITE_HEALTH_FIXTURE,live=path.join(root,'site/dist');
globalThis.fetch=async(input,options={})=>{
 const u=new URL(input),route=u.pathname;
 fs.appendFileSync(path.join(root,'requests.jsonl'),JSON.stringify({host:u.hostname,route,method:options.method||'GET'})+'\\n');
 if(u.hostname==='api.telegram.org'){
  if(route.endsWith('/getMe'))return Response.json({ok:true,result:{id:12345,username:'fixture_bot'}});
  if(route.endsWith('/getWebhookInfo'))return Response.json({ok:true,result:{url:'',pending_update_count:0}});
  if(route.endsWith('/getChatMember'))return Response.json({ok:true,result:{status:'administrator'}});
  throw Error('unexpected Telegram method');
 }
 if(route==='/api/health')return Response.json({ok:true,communityOnboarding:1,newcomerQuestDelayMs:600000,newcomerQuestReady:true});
 if(route==='/api/community/promo'&&options.method==='POST'){
  const {tariffId,promoCode}=JSON.parse(options.body),plans={'1m':[690,1,'2854597'],'3m':[1770,3,'3005286'],'6m':[3180,6,'3005289']},[amount,months,subscriptionId]=promoCode?[350,1,'2611878']:plans[tariffId];
  return Response.json({ok:true,applied:!!promoCode,amount,months,subscriptionId});
 }
 if(options.method&&options.method!=='GET')throw Error('unexpected mutation');
 if(fs.existsSync(path.join(root,'deny')))return new Response('Forbidden',{status:403});
 const file=route.startsWith('/assets/')?path.join(live,route):path.join(live,'index.html');
 if(!fs.existsSync(file)||fs.existsSync(path.join(root,'missing-js'))&&file.endsWith('CommunityHome-test.js'))return new Response('missing',{status:404});
 return new Response(fs.readFileSync(file),{headers:{'Content-Type':route.startsWith('/assets/')?'application/javascript':'text/html'}});
};
''')
    env = {**os.environ,'PATH':str(binary)+':'+os.environ['PATH'],'SITE_HEALTH_FIXTURE':str(fixture),'NODE_OPTIONS':'--import '+str(stub)}
    cmd = ['node',str(repo/'scripts/check-and-repair-site.mjs'),'--backup-root',str(fixture/'reports')]
    def run():
        result = subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=60)
        assert result.returncode == (0 if pdf else 1),result.stdout+result.stderr
        if pdf: assert 'SITE_CHECK_PASSED' in result.stdout,result.stdout
        else: assert 'SITE_CHECK_INCOMPLETE' in result.stdout and 'Квест новичка: точный PDF' in result.stdout
        assert 'fake-test-token' not in result.stdout+result.stderr and 'synthetic-private-key' not in result.stdout+result.stderr
        return result
    before = {p:p.read_bytes() for p in live.rglob('*') if p.is_file()}
    public.chmod(0o700);(public/'index.html').chmod(0o600);(public/'assets').chmod(0o700)
    for f in (public/'assets').iterdir(): f.chmod(0o600)
    result=run()
    assert '[ДО] Локальный nginx: HTTP 403' in result.stdout
    assert 'после проверки: HTTP 200' in result.stdout
    assert 'Права публичной сборки исправлены' in result.stdout
    for p,body in before.items(): assert p.read_bytes()==body
    assert (live/'server/.env').stat().st_mode&0o777==0o600
    assert (live/'server/data').stat().st_mode&0o777==0o700
    assert (live/'server/data/payments.json').stat().st_mode&0o777==0o600
    print('PASS: '+('simulated' if simulate_worker else 'actual')+' worker loses access at 0700/0600; repair restores HTTP 200; code, payments, PDF and private modes preserved')
    repeat=run()
    assert 'исправление не требуется' in repeat.stdout
    reports=[json.loads(p.read_text()) for p in (fixture/'reports').glob('*/report.json')]
    assert sum(len(r['operations'])>0 for r in reports)==1
    print('PASS: repeated audit performs no permission changes, all JS/CSS and routes verified, totals do not hide failed checks')
    (fixture/'deny').touch()
    denied=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=60)
    assert denied.returncode==1 and 'SITE_CHECK_INCOMPLETE' in denied.stdout and 'после проверки: HTTP 403' in denied.stdout
    assert (fixture/'config').read_text()==config
    print('PASS: rule-based 403 never claims success and never rewrites nginx configuration')
    (fixture/'deny').unlink();(fixture/'missing-js').touch()
    missing=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=60)
    assert missing.returncode==1 and 'CommunityHome-test.js HTTP 404' in missing.stdout
    print('PASS: missing lazy JS chunk is detected even when HTML routes return 200')
    (fixture/'config').write_text(config.replace('legalcareerist.ru www.legalcareerist.ru','unrelated.test'))
    wrong=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=60)
    assert wrong.returncode==1 and 'не определены' in wrong.stdout
    for p,body in before.items(): assert p.read_bytes()==body
    requests=[json.loads(l) for l in (fixture/'requests.jsonl').read_text().splitlines()]
    assert all(r['method']=='GET' or r['route']=='/api/community/promo' or r['host']=='api.telegram.org' and r['route'].split('/')[-1] in ['getMe','getWebhookInfo','getChatMember'] for r in requests)
    print('PASS: unrelated virtual host rejected; network requests limited to reads and read-only price quotes')

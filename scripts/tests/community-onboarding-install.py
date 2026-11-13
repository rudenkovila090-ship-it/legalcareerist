import pathlib,tempfile,subprocess,json,hashlib,shutil,os,stat
repo=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='quest-install-') as tmp:
 p=pathlib.Path(tmp);runtime=p/'server';(runtime/'lib').mkdir(parents=True);(runtime/'data/community-assets').mkdir(parents=True);(p/'bin').mkdir()
 packet=p/'packet';shutil.copytree(repo/'updates/community-onboarding',packet/'updates/community-onboarding');(packet/'scripts/lib').mkdir(parents=True)
 for name in ['install-community-onboarding.mjs','lib/bot-runtime-settings.mjs']:shutil.copyfile(repo/'scripts'/name,packet/'scripts'/name)
 manifest=json.loads((packet/'updates/community-onboarding/manifest.json').read_text());baseline={}
 for name in ['index.js','lib/personData.js']:
  baseline[name]=subprocess.check_output(['git','show','2a87025:server/'+name],cwd=repo);(runtime/name).write_bytes(baseline[name])
 (runtime/'index.js').chmod(0o640)
 incoming=b'%PDF-1.4\nPRIVATE SYNTHETIC QUEST\n%%EOF';pdf=p/'quest.pdf';pdf.write_bytes(incoming);manifest['pdf']['size']=len(incoming);manifest['pdf']['sha256']=hashlib.sha256(incoming).hexdigest();(packet/'updates/community-onboarding/manifest.json').write_text(json.dumps(manifest))
 asset=runtime/'data/community-assets/newcomer-quest.pdf';asset.write_bytes(b'OLD_PDF')
 queue=runtime/'data/community-onboarding.json';queue.write_text(json.dumps({'900009000':{'version':1,'telegramId':'900009000','joinedAt':1,'dueAt':600001,'state':'delivered','sentAt':700000}}));queue_before=queue.read_bytes()
 money=runtime/'data/pending-joins.json';money.write_text('{"existing":{"paid":true,"payments":[{"amount":690}]}}');money_before=money.read_bytes()
 state=[{'name':'legalcareerist-api','pm2_env':{'status':'online','pm_exec_path':str(runtime/'index.js'),'pm_cwd':str(runtime),'TELEGRAM_BOT_TOKEN':'SECRET_TEST_ONLY','TELEGRAM_POLLING':'1','COMMUNITY_CHAT_ID':'-100123','PORT':'3456'}}]
 (p/'state.json').write_text(json.dumps(state));actions=p/'actions';actions.write_text('')
 shim=p/'bin/pm2';shim.write_text(f'''#!/usr/bin/env python3
import sys,pathlib
p=pathlib.Path({str(p)!r})
if sys.argv[1]=='jlist':print((p/'state.json').read_text())
else:
 with (p/'actions').open('a') as f:f.write(' '.join(sys.argv[1:])+'\\n')
''');shim.chmod(0o755)
 stub=p/'stub.mjs';stub.write_text("""import fs from 'node:fs';import path from 'node:path';const base=BASE;const root=path.join(base,'server');globalThis.fetch=async url=>{const u=new URL(url);if(u.hostname==='api.telegram.org'){const method=u.pathname.split('/').at(-1);if(!['getMe','getChatMember','getWebhookInfo'].includes(method))throw Error('Write call forbidden');fs.appendFileSync(path.join(base,'telegram-methods'),method+'\\n');return Response.json({ok:true,result:method==='getMe'?{id:900999,username:'synthetic_bot'}:method==='getChatMember'?{status:'administrator'}:{url:fs.existsSync(path.join(base,'foreign'))?'https://other.invalid/hook':''}})}const installed=fs.readFileSync(path.join(root,'index.js'),'utf8').includes('communityOnboarding:1');const fail=fs.existsSync(path.join(base,'fail-health'))&&fs.readFileSync(path.join(base,'actions'),'utf8').includes('restart');return Response.json({ok:true,autoExclude:true,automaticAccessRemovalPaused:false,graceDays:4,subscriptionAutomation:1,communityOnboarding:installed&&!fail?1:0,newcomerQuestDelayMs:600000,newcomerQuestReady:fs.existsSync(path.join(root,'data/community-assets/newcomer-quest.pdf'))})};""".replace('BASE',json.dumps(str(p))))
 env={**os.environ,'PATH':str(p/'bin')+os.pathsep+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub)}
 cmd=['node',str(packet/'scripts/install-community-onboarding.mjs'),'--pdf',str(pdf),'--backup-root',str(p/'backups')]
 def run():
  result=subprocess.run(cmd,env=env,text=True,capture_output=True);assert 'SECRET_TEST_ONLY' not in result.stdout+result.stderr;return result
 pdf.write_bytes(b'NOT_THE_REQUESTED_PDF');result=run();assert result.returncode==1;assert actions.read_text()=='';pdf.write_bytes(incoming)
 # A known Telegram bot bound to another service is never silently migrated.
 (p/'foreign').touch();result=run();assert result.returncode==1;assert actions.read_text()=='';(p/'foreign').unlink()
 # An unrecognized runtime is rejected before PM2 or live files are changed.
 f=runtime/'lib/personData.js';f.write_text('UNKNOWN_RUNTIME');result=run();assert result.returncode==1;assert actions.read_text()=='';f.write_bytes(baseline['lib/personData.js'])
 result=run();assert result.returncode==0,(result.stdout,result.stderr);assert 'NEWCOMER_QUEST_READY' in result.stdout
 assert asset.read_bytes()==incoming and queue.read_bytes()==queue_before and money.read_bytes()==money_before
 assert stat.S_IMODE(asset.stat().st_mode)==0o600 and stat.S_IMODE((runtime/'index.js').stat().st_mode)==0o640
 assert 'communityOnboarding:1' in (runtime/'index.js').read_text();assert next((p/'backups').glob('*/newcomer-quest.before.pdf')).read_bytes()==b'OLD_PDF'
 result=run();assert result.returncode==0,(result.stdout,result.stderr);assert queue.read_bytes()==queue_before and money.read_bytes()==money_before
 # Rollback never restores an old database over new events/payments.
 for name,body in baseline.items():(runtime/name).write_bytes(body)
 (runtime/'lib/communityOnboarding.js').unlink();asset.write_bytes(b'OLD_PDF');actions.write_text('');(p/'fail-health').touch()
 result=run();assert result.returncode==1;assert (runtime/'index.js').read_bytes()==baseline['index.js'];assert asset.read_bytes()==b'OLD_PDF';assert queue.read_bytes()==queue_before and money.read_bytes()==money_before
 assert not (runtime/'lib/communityOnboarding.js').exists()
 assert set((p/'telegram-methods').read_text().splitlines())=={'getMe','getChatMember','getWebhookInfo'}
 print('PASS: exact PDF validation, foreign webhook protection, unknown-code preflight, install, repeat, private file permissions, no mass enqueue/messages, preserved payments/queue and health-failure rollback')

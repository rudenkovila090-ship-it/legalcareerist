import tempfile,pathlib,subprocess,json,os
repo=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='promo-publication-') as tmp:
 p=pathlib.Path(tmp);source=p/'checkout/dist';live=p/'nginx-live';(source/'assets').mkdir(parents=True);(live/'assets').mkdir(parents=True);(p/'bin').mkdir()
 html='<script src="/assets/app.js"></script>'
 (source/'index.html').write_text(html)
 for file,body in [('app.js','NEW_ENTRY'),('CommunityHome-fixture.js','FORM_A'),('TariffJoinBlock-fixture.js','FORM_B'),('field.js','Промокод (необязательно)')]:(source/'assets'/file).write_text(body)
 (live/'index.html').write_text('OLD_SITE');(live/'assets/old.js').write_text('OLD_CHUNK');(live/'unrelated').write_text('KEEP')
 conf='http { server { listen 443 ssl; server_name legalcareerist.ru www.legalcareerist.ru; root '+str(live)+'; location /api/ { proxy_pass http://127.0.0.1:3001; } } }'
 nginx=p/'bin/nginx';nginx.write_text('#!/usr/bin/env python3\nprint('+repr(conf)+')\n');nginx.chmod(0o755)
 stub=p/'stub.mjs';stub.write_text("import fs from 'node:fs';import path from 'node:path';const live="+json.dumps(str(live))+";globalThis.fetch=async url=>{const u=new URL(url);const file=path.join(live,u.pathname.startsWith('/assets/')?u.pathname:'index.html');return fs.existsSync(file)?new Response(fs.readFileSync(file)):new Response('missing',{status:404})};")
 env={**os.environ,'PATH':str(p/'bin')+os.pathsep+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub)}
 cmd=['node',str(repo/'scripts/repair-community-promo-static.mjs'),'--site-root',str(source.parent),'--backup-root',str(p/'backups')]
 run=subprocess.run(cmd,env=env,text=True,capture_output=True);assert run.returncode==0,(run.stdout,run.stderr);assert 'PUBLIC_PROMO_VERIFIED' in run.stdout
 assert (live/'index.html').read_text()==html and (live/'assets/field.js').read_text()=='Промокод (необязательно)'
 assert (live/'unrelated').read_text()=='KEEP' and (live/'assets/old.js').read_text()=='OLD_CHUNK'
 assert next((p/'backups').glob('*/index.html')).read_text()=='OLD_SITE'
 # The exact same HTML with a missing lazy chunk must trigger repair rather than a false success.
 (live/'assets/CommunityHome-fixture.js').unlink();run=subprocess.run(cmd,env=env,text=True,capture_output=True);assert run.returncode==0,(run.stdout,run.stderr);assert (live/'assets/CommunityHome-fixture.js').exists()
 # With publication already matching, the checker must not perform another backup/write.
 before=len(list((p/'backups').iterdir()));run=subprocess.run(cmd,env=env,text=True,capture_output=True);assert run.returncode==0;assert len(list((p/'backups').iterdir()))==before
 # An access denial is not diagnosed as a static-root error and must not cause writes.
 stub.write_text("globalThis.fetch=async()=>new Response('denied',{status:403});")
 run=subprocess.run(cmd,env=env,text=True,capture_output=True);assert run.returncode==1;assert 'HTTP 403' in run.stderr;assert len(list((p/'backups').iterdir()))==before
 print('PASS: wrong nginx document root repaired, missing lazy chunk repaired, exact public JS verified, old assets/unrelated files kept, repeat check read-only, denied access causes no writes')

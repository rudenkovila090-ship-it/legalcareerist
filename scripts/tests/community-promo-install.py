import pathlib,tempfile,json,subprocess,shutil,os,stat
repo=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='community-promo-install-') as tmp:
 p=pathlib.Path(tmp);site=p/'site';server=site/'server';(server/'lib').mkdir(parents=True);(site/'dist').mkdir();(p/'bin').mkdir()
 for name in ['index.js','lib/prodamus.js']:(server/name).write_bytes(subprocess.check_output(['git','show','accf296:server/'+name],cwd=repo))
 (site/'dist/index.html').write_text('OLD_SITE');(server/'package.json').write_text('{"type":"module"}')
 package=p/'package';(package/'scripts/lib').mkdir(parents=True);(package/'dist/assets').mkdir(parents=True)
 for name in ['install-community-promo.mjs','lib/bot-runtime-settings.mjs']:shutil.copyfile(repo/'scripts'/name,package/'scripts'/name)
 shutil.copytree(repo/'updates/community-promo',package/'updates/community-promo');(package/'dist/index.html').write_text('NEW_SITE');(package/'dist/assets/app.js').write_text('const test="promoCode";')
 state=[{'name':'legalcareerist-api','pm2_env':{'status':'online','pm_exec_path':str(server/'index.js'),'pm_cwd':str(server),'PORT':'3456'}}]
 (p/'state.json').write_text(json.dumps(state));actions=p/'actions';actions.write_text('')
 shim=p/'bin/pm2';shim.write_text(f'''#!/usr/bin/env python3
import sys,pathlib
p=pathlib.Path({str(p)!r})
if sys.argv[1]=='jlist':print((p/'state.json').read_text())
else:
 with (p/'actions').open('a') as f:f.write(' '.join(sys.argv[1:])+'\\n')
''');shim.chmod(0o755)
 stub=p/'stub.mjs';stub.write_text("globalThis.fetch=async()=>Response.json({ok:true});")
 env={**os.environ,'PATH':str(p/'bin')+os.pathsep+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub)}
 cmd=['node',str(package/'scripts/install-community-promo.mjs'),'--site-root',str(site),'--backup-root',str(p/'backups')]
 old=(server/'index.js').read_bytes()
 # Unknown files are rejected before stopping the API or moving the live website.
 helper=server/'lib/communityPromo.js';helper.write_text('UNRECOGNIZED')
 run=subprocess.run(cmd,env=env,text=True,capture_output=True);assert run.returncode==1,(run.stdout,run.stderr);assert actions.read_text()=='';assert (server/'index.js').read_bytes()==old;assert (site/'dist/index.html').read_text()=='OLD_SITE';helper.unlink()
 run=subprocess.run(cmd,env=env,text=True,capture_output=True);assert run.returncode==0,(run.stdout,run.stderr)
 assert (site/'dist/index.html').read_text()=='NEW_SITE';assert 'normalizeCommunityPromo(req.body.promoCode)' in (server/'index.js').read_text();assert helper.exists()
 assert stat.S_IMODE((site/'dist').stat().st_mode)==0o755 and stat.S_IMODE((site/'dist/index.html').stat().st_mode)==0o644
 assert next((p/'backups').glob('*/dist-before/index.html')).read_text()=='OLD_SITE'
 # Idempotent narrow edits tolerate unrelated preserved local additions.
 with (server/'index.js').open('a') as f:f.write('\n// preserved local extension\n')
 run=subprocess.run(cmd,env=env,text=True,capture_output=True);assert run.returncode==0,(run.stdout,run.stderr);assert (server/'index.js').read_text().endswith('// preserved local extension\n')
 assert 'COMMUNITY_PROMO_INSTALLED' in run.stdout
 print('PASS: exact-context patch, unknown-version preflight, atomic website install, nginx-readable permissions, private backup, repeat apply and preservation of local additions')

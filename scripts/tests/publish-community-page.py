"""Exercise the frontend publisher with real built assets and simulated public HTTP/nginx."""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

repo=pathlib.Path(__file__).resolve().parents[2]
source=repo/'dist'
assert (source/'index.html').exists(),'Run npm run build first'
with tempfile.TemporaryDirectory(prefix='publish-community-') as tmp:
    root=pathlib.Path(tmp);live=root/'public';binary=root/'bin';binary.mkdir()
    private=root/'private';private.mkdir(mode=0o700)
    (private/'payments.json').write_text('{"payment":"preserve"}')
    (private/'.env').write_text('SYNTHETIC_SECRET=never-print')
    (private/'.env').chmod(0o600)
    oldhtml='<div id="root"></div><script type="module" src="/assets/old.js"></script>'
    def reset():
        if live.exists():shutil.rmtree(live)
        (live/'assets').mkdir(parents=True);live.chmod(0o755);(live/'assets').chmod(0o755)
        (live/'index.html').write_text(oldhtml);(live/'index.html').chmod(0o644)
        (live/'assets/old.js').write_text('OLD_CLIENT_ASSET')
        (live/'unrelated.txt').write_text('PRESERVE')
    reset()
    config='http { server { listen 443 ssl; server_name legalcareerist.ru; root "'+str(live)+'"; location / { try_files $uri /index.html; } } }'
    nginx=binary/'nginx'
    nginx.write_text('#!/usr/bin/env python3\nimport sys\nassert sys.argv[1:] in [["-t"],["-T"]],"nginx mutation forbidden"\nif sys.argv[1]=="-T":print('+repr(config)+')\n')
    nginx.chmod(0o755)
    stub=root/'stub.mjs'
    stub.write_text('''import fs from 'node:fs';import path from 'node:path';
process.getuid=()=>0;
const root=process.env.PAGE_PUBLISH_TEST_ROOT,live=path.join(root,'public');
globalThis.fetch=async(input,options={})=>{
 const u=new URL(input),route=u.pathname,html=fs.readFileSync(path.join(live,'index.html'),'utf8'),updated=!html.includes('/assets/old.js');
 fs.appendFileSync(path.join(root,'requests.jsonl'),JSON.stringify({route,method:options.method||'GET'})+'\\n');
 if(route==='/api/health')return Response.json({ok:true});
 if(route==='/api/community/promo'&&options.method==='POST'){
  if(updated&&fs.existsSync(path.join(root,'fail-quote')))return Response.json({ok:false,error:'synthetic_failure'},{status:503});
  const {tariffId,promoCode}=JSON.parse(options.body),plans={'1m':[690,1,'2854597'],'3m':[1770,3,'3005286'],'6m':[3180,6,'3005289']},[amount,months,subscriptionId]=promoCode?[350,1,'2611878']:plans[tariffId];
  return Response.json({ok:true,applied:!!promoCode,amount,months,subscriptionId});
 }
 if(options.method&&options.method!=='GET')throw Error('unexpected mutation');
 if(fs.existsSync(path.join(root,'wrong-site'))&&!route.startsWith('/assets/'))return new Response('<html>OTHER ORIGIN</html>');
 if(updated&&fs.existsSync(path.join(root,'fail-chunks'))&&route.includes('CommunityHome-'))return new Response('WRONG_CHUNK');
 const file=route.startsWith('/assets/')?path.join(live,route):path.join(live,'index.html');
 return fs.existsSync(file)?new Response(fs.readFileSync(file)):new Response('missing',{status:404});
};
''')
    env={**os.environ,'PATH':str(binary)+':'+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub),'PAGE_PUBLISH_TEST_ROOT':str(root)}
    cmd=['node',str(repo/'scripts/publish-community-page.mjs'),'--dist',str(source),'--backup-root',str(root/'backups'),'--commit','synthetic-reviewed-release']
    def invoke():return subprocess.run(cmd,env=env,text=True,capture_output=True,timeout=60)
    def check_private():
        assert (private/'payments.json').read_text()=='{"payment":"preserve"}'
        assert (private/'.env').read_text()=='SYNTHETIC_SECRET=never-print'
        assert (private/'.env').stat().st_mode&0o777==0o600
        assert (live/'unrelated.txt').read_text()=='PRESERVE'
        assert (live/'assets/old.js').read_text()=='OLD_CLIENT_ASSET'
    result=invoke();assert result.returncode==0,result.stdout+result.stderr
    assert 'COMMUNITY_PAGE_PUBLISHED' in result.stdout
    assert (live/'index.html').read_bytes()==(source/'index.html').read_bytes()
    assert (live/'index.html').stat().st_mode&0o777==0o644 and live.stat().st_mode&0o777==0o755
    check_private()
    first=list((root/'backups').iterdir());assert len(first)==1
    assert (first[0]/'index.html').read_text()==oldhtml
    assert json.loads((first[0]/'verified.json').read_text())['faqQuestions']==11
    print('PASS: actual reviewed build published, all current JS/CSS and quotes verified, old assets/private data preserved')
    repeat=invoke();assert repeat.returncode==0,repeat.stdout+repeat.stderr
    assert 'повторная запись не нужна' in repeat.stdout and len(list((root/'backups').iterdir()))==1
    chunk=next((live/'assets').glob('CommunityHome-*.js'));chunk.unlink()
    repaired=invoke();assert repaired.returncode==0,repaired.stdout+repaired.stderr
    assert chunk.exists()
    print('PASS: repeat is read-only; missing lazy chunk is repaired despite identical index.html')
    for flag in ['fail-quote','fail-chunks']:
        reset();(root/flag).touch()
        failed=invoke();assert failed.returncode==1,failed.stdout+failed.stderr
        assert 'Прежние файлы сайта восстановлены' in failed.stderr
        assert (live/'index.html').read_text()==oldhtml
        check_private();(root/flag).unlink()
        print('PASS: '+flag+' rejects publication and restores old index without discarding browser assets or customer data')
    reset();before=len(list((root/'backups').iterdir()));(root/'wrong-site').touch()
    wrong=invoke();assert wrong.returncode==1 and (live/'index.html').read_text()==oldhtml
    assert len(list((root/'backups').iterdir()))==before
    check_private()
    requests=[json.loads(line) for line in (root/'requests.jsonl').read_text().splitlines()]
    assert all(item['method']=='GET' or item['route']=='/api/community/promo' for item in requests)
    print('PASS: wrong public origin causes no writes; only reads and read-only quote POSTs are allowed')

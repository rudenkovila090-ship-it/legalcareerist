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
 if(updated&&fs.existsSync(path.join(root,'fail-image'))&&route.includes('certificate-raso-lbf-2026-'))return new Response('WRONG_CERTIFICATE');
 if(updated&&fs.existsSync(path.join(root,'fail-thanks'))&&route.includes('conference-thanks-2026-'))return new Response('WRONG_THANKS');
 if(updated&&fs.existsSync(path.join(root,'fail-rating'))&&route.includes('legal-telegram-rating-2025-'))return new Response('WRONG_RATING');
 if(updated&&fs.existsSync(path.join(root,'fail-alena'))&&route.includes('alena-romanova-'))return new Response('WRONG_PORTRAIT');
 if(updated&&fs.existsSync(path.join(root,'fail-jazz-photo'))&&route.includes('advokat-dyavola-'))return new Response('WRONG_JAZZ_PORTRAIT');
 if(updated&&fs.existsSync(path.join(root,'fail-strizh-logo'))&&route.includes('partner-strizh-'))return new Response('WRONG_STRIZH_LOGO');
 if(updated&&fs.existsSync(path.join(root,'fail-advocacy-logo'))&&route.includes('partner-institut-advokatury-'))return new Response('WRONG_ADVOCACY_LOGO');
 if(updated&&fs.existsSync(path.join(root,'fail-jazz-page'))&&route==='/events/dzhazovyy-vecher-dlya-yuristov-2')return new Response('MISSING_JAZZ_PAGE',{status:404});
 if(updated&&fs.existsSync(path.join(root,'fail-event'))&&route==='/events/peresborka-yuridicheskogo-produkta-19-noyabrya-2026')return new Response('MISSING_EVENT',{status:404});
 if(updated&&fs.existsSync(path.join(root,'fail-sitemap'))&&route==='/sitemap.xml')return new Response('OLD_SITEMAP');
 const file=route.startsWith('/assets/')||route==='/sitemap.xml'?path.join(live,route):path.join(live,'index.html');
 return fs.existsSync(file)?new Response(fs.readFileSync(file)):new Response('missing',{status:404});
};
''')
    env={**os.environ,'PATH':str(binary)+':'+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub),'PAGE_PUBLISH_TEST_ROOT':str(root)}
    cmd=['node',str(repo/'scripts/publish-community-page.mjs'),'--dist',str(source),'--backup-root',str(root/'backups'),'--commit','synthetic-reviewed-release']
    def invoke(*extra):return subprocess.run([*cmd,*extra],env=env,text=True,capture_output=True,timeout=60)
    def check_private():
        assert (private/'payments.json').read_text()=='{"payment":"preserve"}'
        assert (private/'.env').read_text()=='SYNTHETIC_SECRET=never-print'
        assert (private/'.env').stat().st_mode&0o777==0o600
        assert (live/'unrelated.txt').read_text()=='PRESERVE'
        assert (live/'assets/old.js').read_text()=='OLD_CLIENT_ASSET'
    result=invoke();assert result.returncode==0,result.stdout+result.stderr
    assert 'COMMUNITY_PAGE_PUBLISHED' in result.stdout
    assert 'JAZZ_PHOTO_PUBLISHED' in result.stdout
    assert 'JAZZ_PARTNERS_PUBLISHED' in result.stdout
    assert (live/'index.html').read_bytes()==(source/'index.html').read_bytes()
    assert (live/'index.html').stat().st_mode&0o777==0o644 and live.stat().st_mode&0o777==0o755
    check_private()
    first=list((root/'backups').iterdir());assert len(first)==1
    assert (first[0]/'index.html').read_text()==oldhtml
    assert json.loads((first[0]/'verified.json').read_text())['faqQuestions']==11
    assert json.loads((first[0]/'verified.json').read_text())['achievementOriginals']==3
    assert json.loads((first[0]/'verified.json').read_text())['portraitFiles']==6
    assert json.loads((first[0]/'verified.json').read_text())['noirOriginalPhotos'][0]['sha256']=='b20aeef1eb725dec0ba6d3a9f409dfcdfbcf2ed66730b7e6ff1d1678317b8be5'
    assert {r['url'] for r in json.loads((first[0]/'verified.json').read_text())['officialPartnerLogos']}=={'https://strizh-legal.ru/','https://legalstudy.ru/'}
    print('PASS: actual reviewed build published, all current JS/CSS and quotes verified, old assets/private data preserved')
    repeat=invoke();assert repeat.returncode==0,repeat.stdout+repeat.stderr
    assert 'повторная запись не нужна' in repeat.stdout and len(list((root/'backups').iterdir()))==1
    chunk=next((live/'assets').glob('CommunityHome-*.js'));chunk.unlink()
    repaired=invoke();assert repaired.returncode==0,repaired.stdout+repaired.stderr
    assert chunk.exists()
    print('PASS: repeat is read-only; missing lazy chunk is repaired despite identical index.html')
    for flag in ['fail-quote','fail-chunks','fail-image','fail-thanks','fail-rating','fail-alena','fail-jazz-photo','fail-jazz-page','fail-strizh-logo','fail-advocacy-logo']:
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
    (root/'wrong-site').unlink();reset()
    tampered=root/'tampered-build';shutil.copytree(source,tampered)
    next((tampered/'assets').glob('conference-thanks-2026-*.png')).write_bytes(b'ALTERED_ORIGINAL')
    alteredcmd=cmd.copy();alteredcmd[alteredcmd.index('--dist')+1]=str(tampered)
    before=len(list((root/'backups').iterdir()))
    before_requests=(root/'requests.jsonl').read_bytes()
    rejected=subprocess.run(alteredcmd,env=env,text=True,capture_output=True,timeout=60)
    assert rejected.returncode==1 and 'Оригинал изменен' in rejected.stderr,rejected.stdout+rejected.stderr
    assert len(list((root/'backups').iterdir()))==before and (live/'index.html').read_text()==oldhtml
    assert (root/'requests.jsonl').read_bytes()==before_requests
    check_private()
    print('PASS: altered archive original is rejected before HTTP requests or any public changes')

    tampered_jazz=root/'tampered-jazz-build';shutil.copytree(source,tampered_jazz)
    next((tampered_jazz/'assets').glob('advokat-dyavola-*.png')).write_bytes(b'ALTERED_PORTRAIT')
    jazzcmd=cmd.copy();jazzcmd[jazzcmd.index('--dist')+1]=str(tampered_jazz)
    rejected_jazz=subprocess.run(jazzcmd,env=env,text=True,capture_output=True,timeout=60)
    assert rejected_jazz.returncode==1 and 'Оригинал фото изменен' in rejected_jazz.stderr,rejected_jazz.stdout+rejected_jazz.stderr
    assert len(list((root/'backups').iterdir()))==before and (live/'index.html').read_text()==oldhtml
    assert (root/'requests.jsonl').read_bytes()==before_requests
    print('PASS: altered devil advocate original is rejected before HTTP requests or writes')

    for stem,ext in [('partner-strizh','png'),('partner-institut-advokatury','jpg')]:
        altered_partner=root/('altered-'+stem);shutil.copytree(source,altered_partner)
        next((altered_partner/'assets').glob(stem+'-*.'+ext)).write_bytes(b'ALTERED_PARTNER_LOGO')
        partnercmd=cmd.copy();partnercmd[partnercmd.index('--dist')+1]=str(altered_partner)
        rejected_partner=subprocess.run(partnercmd,env=env,text=True,capture_output=True,timeout=60)
        assert rejected_partner.returncode==1 and 'Оригинал логотипа изменен' in rejected_partner.stderr,rejected_partner.stdout+rejected_partner.stderr
        assert len(list((root/'backups').iterdir()))==before and (live/'index.html').read_text()==oldhtml
        assert (root/'requests.jsonl').read_bytes()==before_requests
        print('PASS: altered '+stem+' original rejected before HTTP requests or writes')

    checkout=root/'checkout';catalog=checkout/'server/data/event-catalog.json';catalog.parent.mkdir(parents=True)
    # A live paid event may have server-specific fields and a price different from this checkout.
    # Adding an external meeting must preserve that record, permissions and bytes on rollback.
    original=b'[ {"slug":"existing-paid-event","title":"Existing paid event","price":4890,"serverOnly":"PRESERVE","tariffs":[{"id":"light","price":4890}]} ]\n'
    catalog.write_bytes(original);catalog.chmod(0o640)
    event_args=['--event-slug','peresborka-yuridicheskogo-produkta-19-noyabrya-2026','--server-checkout',str(checkout)]
    reset();installed=invoke(*event_args)
    assert installed.returncode==0,installed.stdout+installed.stderr
    assert 'PARTNER_EVENT_PUBLISHED' in installed.stdout
    actual=json.loads(catalog.read_text());assert len(actual)==2
    assert actual[0]==json.loads(original)[0]
    assert actual[1]['slug']==event_args[1] and actual[1]['registrationLink']=='https://go.urbiz.pro/3Jtiw5Px'
    assert actual[1]['price'] is None and not actual[1]['collectTicketLead']
    assert catalog.stat().st_mode&0o777==0o640
    installed_bytes=catalog.read_bytes();before_backups=len(list((root/'backups').iterdir()))
    again=invoke(*event_args);assert again.returncode==0,again.stdout+again.stderr
    assert 'PARTNER_EVENT_PUBLISHED' in again.stdout
    assert catalog.read_bytes()==installed_bytes and len(list((root/'backups').iterdir()))==before_backups
    check_private()
    print('PASS: external event published, live paid-event data and catalog permissions preserved; repeat makes no writes')
    # Identical frontend may still be missing its server catalog entry.
    catalog.write_bytes(original)
    repair=invoke(*event_args);assert repair.returncode==0,repair.stdout+repair.stderr
    assert len(json.loads(catalog.read_text()))==2
    print('PASS: missing catalog entry is repaired even when the frontend is already current')
    for flag in ['fail-event','fail-sitemap','fail-quote']:
        reset();catalog.write_bytes(original);(root/flag).touch()
        failed=invoke(*event_args);assert failed.returncode==1,failed.stdout+failed.stderr
        assert (live/'index.html').read_text()==oldhtml and catalog.read_bytes()==original
        assert catalog.stat().st_mode&0o777==0o640
        backups=sorted((root/'backups').iterdir(),key=lambda path:path.stat().st_mtime_ns)
        assert (backups[-1]/'event-catalog.before.json').read_bytes()==original
        check_private();(root/flag).unlink()
        print('PASS: '+flag+' restores both previous website and exact catalog bytes')
    reset();conflicting=json.loads(original)+[{**actual[1],'price':999}]
    catalog.write_text(json.dumps(conflicting));before_catalog=catalog.read_bytes()
    before_requests=(root/'requests.jsonl').read_bytes();before_backups=len(list((root/'backups').iterdir()))
    refused=invoke(*event_args);assert refused.returncode==1 and 'другими данными' in refused.stderr,refused.stdout+refused.stderr
    assert catalog.read_bytes()==before_catalog and (live/'index.html').read_text()==oldhtml
    assert len(list((root/'backups').iterdir()))==before_backups and (root/'requests.jsonl').read_bytes()==before_requests
    print('PASS: conflicting live event is rejected before HTTP requests or writes')

    # New public jobs must be added to both running API catalogs, without replacing live data.
    slugs=['yurist-v-it-kompaniyu-nomix','yurist-po-korporativnym-sporam','yurist-it-ip-volodin-i-partnery']
    vacancy_args=['--vacancy-slugs',','.join(slugs)]
    vacancy_before=b'[ {"slug":"existing-job","number":46,"title":"Existing job","status":"closed","serverOnly":"PRESERVE"} ]\n'
    vacancy_files=[];processes=[]
    for name in ['legalcareerist-api','legalcareerist-resident-demo']:
        api=root/name;data=api/'data';data.mkdir(parents=True)
        (api/'index.js').write_text('// synthetic API entry')
        (api/'.env').write_text('SYNTHETIC_SECRET=never-print')
        (data/'payments.json').write_text('{"payment":"preserve"}')
        file=data/'vacancy-catalog.json';file.write_bytes(vacancy_before);file.chmod(0o640)
        vacancy_files.append(file)
        processes.append({'name':name,'pm2_env':{'status':'online','pm_exec_path':str(api/'index.js')}})
    pm2=binary/'pm2'
    pm2.write_text('#!/usr/bin/env python3\nimport sys,json\nassert sys.argv[1:]==["jlist"],"process mutation forbidden"\nprint('+repr(json.dumps(processes))+')\n')
    pm2.chmod(0o755)
    reset();published=invoke(*vacancy_args)
    assert published.returncode==0,published.stdout+published.stderr
    assert 'VACANCIES_PUBLISHED: 3' in published.stdout
    for file in vacancy_files:
        rows=json.loads(file.read_text())
        assert len(rows)==4 and rows[0]==json.loads(vacancy_before)[0]
        assert {v['slug'] for v in rows[1:]}==set(slugs)
        assert file.stat().st_mode&0o777==0o640
        assert (file.parent/'payments.json').read_text()=='{"payment":"preserve"}'
        assert (file.parent.parent/'.env').read_text()=='SYNTHETIC_SECRET=never-print'
    check_private()
    previous_bytes=[file.read_bytes() for file in vacancy_files]
    before_backups=len(list((root/'backups').iterdir()))
    again=invoke(*vacancy_args);assert again.returncode==0,again.stdout+again.stderr
    assert 'VACANCIES_PUBLISHED' in again.stdout
    assert [file.read_bytes() for file in vacancy_files]==previous_bytes
    assert len(list((root/'backups').iterdir()))==before_backups
    print('PASS: 3 vacancies published to both API catalogs; live rows, modes, secrets and payments preserved; repeat makes no writes')
    vacancy_files[0].write_bytes(vacancy_before)
    repair=invoke(*vacancy_args);assert repair.returncode==0,repair.stdout+repair.stderr
    assert len(json.loads(vacancy_files[0].read_text()))==4
    assert vacancy_files[1].read_bytes()==previous_bytes[1]
    print('PASS: missing API vacancies repaired even when the frontend and demo are already current')
    for flag in ['fail-sitemap','fail-quote','fail-chunks']:
        reset()
        for file in vacancy_files:file.write_bytes(vacancy_before)
        (root/flag).touch();failed=invoke(*vacancy_args)
        assert failed.returncode==1,failed.stdout+failed.stderr
        assert (live/'index.html').read_text()==oldhtml
        for file in vacancy_files:
            assert file.read_bytes()==vacancy_before and file.stat().st_mode&0o777==0o640
        check_private();(root/flag).unlink()
        print('PASS: '+flag+' restores previous website and exact bytes of both vacancy catalogs')
    reset()
    conflicting=json.loads(vacancy_before)+[{**json.loads(previous_bytes[0])[1],'salaryFrom':1}]
    vacancy_files[0].write_text(json.dumps(conflicting));conflict_before=vacancy_files[0].read_bytes()
    before_backups=len(list((root/'backups').iterdir()));before_requests=(root/'requests.jsonl').read_bytes()
    refused=invoke(*vacancy_args)
    assert refused.returncode==1 and 'другими данными' in refused.stderr,refused.stdout+refused.stderr
    assert vacancy_files[0].read_bytes()==conflict_before and vacancy_files[1].read_bytes()==vacancy_before
    assert len(list((root/'backups').iterdir()))==before_backups and (root/'requests.jsonl').read_bytes()==before_requests
    assert (live/'index.html').read_text()==oldhtml
    print('PASS: conflicting live vacancy rejected before HTTP requests, backup creation or writes')

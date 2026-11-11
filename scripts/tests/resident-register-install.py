"""Isolated PM2/Telegram integration; all service calls are simulated and writes stay in temp."""
import pathlib, tempfile, shutil, json, subprocess, os
repo=pathlib.Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='resident-register-test-') as temp:
    base=pathlib.Path(temp); runtime=base/'server'; (runtime/'lib').mkdir(parents=True); (runtime/'data').mkdir(); (base/'bin').mkdir()
    manifest=json.loads((repo/'updates/resident-register/manifest.json').read_text())
    for entry in manifest['files']:
        target=runtime/entry['path']; target.write_bytes(subprocess.check_output(['git','show',manifest['baseCommit']+':server/'+entry['path']],cwd=repo))
    (runtime/'index.js').write_text("const COMMUNITY_CHAT_ID = process.env.COMMUNITY_CHAT_ID || '-100123';")
    original={'real-private-card':{'name':'Real','tgUserId':'900001','paid':True,'status':'active','nextPaymentAt':1,'payments':[{'amount':350,'at':1,'orderKey':'real-order','subscriptionId':'2611878'}]}}
    joins=runtime/'data/pending-joins.json'; joins.write_text(json.dumps(original))
    users={'900002':{'id':'900002','username':'@free_person'}}
    (runtime/'data/bot-users.json').write_text(json.dumps(users)); (runtime/'data/prodamus-webhooks.jsonl').write_text('')
    state={'name':'legalcareerist-api','pm2_env':{'pm_exec_path':str(runtime/'index.js'),'pm_cwd':str(runtime),'status':'online','TELEGRAM_BOT_TOKEN':'PRIVATE_TEST_TOKEN','PRODAMUS_SECRET_KEY':'BANK_PRIVATE_TEST_KEY','PORT':'3456','COMMUNITY_CHAT_ID':'-100123'}}
    (base/'pm2.json').write_text(json.dumps([state]));actions=base/'actions'; actions.write_text('')
    bankbody={'payment_status':'success','date':'1970-01-01T00:00:00.001Z','sum':'350','tg_user_id':'900001','order_id':'real-order','subscription':{'id':'2611878','profile_id':'provider-profile'}}
    signer="import {HmacHelper} from "+repr(str(repo/'server/lib/hmac.js'))+";console.log(HmacHelper.create(JSON.parse(process.argv[1]),'BANK_PRIVATE_TEST_KEY'));"
    signature=subprocess.check_output(['node','--input-type=module','-e',signer,json.dumps(bankbody)],text=True).strip()
    (runtime/'data/prodamus-webhooks.jsonl').write_text(json.dumps({'body':bankbody,'sign':signature})+'\n')
    shim=base/'bin/pm2'; shim.write_text(f'''#!/usr/bin/env python3
import sys,pathlib
p=pathlib.Path({str(base)!r})
if sys.argv[1]=='jlist': print((p/'pm2.json').read_text())
else:
 with (p/'actions').open('a') as f: f.write(' '.join(sys.argv[1:])+'\\n')
''');shim.chmod(0o755)
    stub=base/'stub.mjs';stub.write_text('''globalThis.fetch=async(url,init={})=>{const u=new URL(url);if(u.hostname==='api.telegram.org'){const method=u.pathname.split('/').at(-1),b=JSON.parse(init.body);if(!['getMe','getChatMember'].includes(method))throw Error('Write call forbidden');return Response.json({ok:true,result:method==='getMe'?{id:123456,username:'test_bot'}:b.user_id==123456?{status:'administrator'}:{status:'member',user:{id:Number(b.user_id),username:String(b.user_id)==='900002'?'free_person':'paid_person'}}})}return Response.json({ok:true,autoExclude:true,automaticAccessRemovalPaused:false,graceDays:4,subscriptionAutomation:1})};''')
    evidence={'version':1,'sourceDate':'2026-11-11','csvSha256':'synthetic','csvRows':[{'key':'csv:2','Телефон':'+79990000001','TG ID':'900001','ID':'2611878','Стоимость':'350.00','Дата подписки':'2026-10-11 12:00:00','Будущий платеж':'11.12.2027 12:00','Активность (пользователь)':'активна','Активность (менеджер)':'активна'}],'screenshotRows':[{'key':'image:free:1','name':'Free','usernameRaw':'free_person','kind':'free','amount':0}],'ownerRows':[]}
    inp=base/'input.json';inp.write_text(json.dumps(evidence))
    env={**os.environ,'PATH':str(base/'bin')+os.pathsep+os.environ['PATH'],'NODE_OPTIONS':'--import '+str(stub)}
    cmd=['node',str(repo/'scripts/install-resident-register.mjs'),'--input',str(inp),'--packet',str(repo/'updates/resident-register'),'--backup-root',str(base/'backups')]
    def run(extra=()):
        p=subprocess.run(cmd+list(extra),env=env,text=True,capture_output=True)
        assert 'PRIVATE_TEST_TOKEN' not in p.stdout+p.stderr and 'BANK_PRIVATE_TEST_KEY' not in p.stdout+p.stderr
        return p
    # A read-only execution reads live membership and writes reports, without stopping PM2.
    before=joins.read_bytes();p=run();assert p.returncode==0,(p.stdout,p.stderr);assert joins.read_bytes()==before;assert actions.read_text()==''
    auditreport=json.loads(next((base/'backups').glob('*/report/reconciliation.json')).read_text())
    paidrow=next(r for r in auditreport['rows'] if r['telegramId']=='900001')
    assert paidrow['receiptChecks'][0]['verified'] is True and paidrow['bankEvents'][0]['verificationSource']=='original_signature'
    assert paidrow['bankEvents'][0]['providerProfileId']=='provider-profile'
    # Unknown installed code must fail before any PM2 mutation or database write.
    f=runtime/manifest['files'][-1]['path'];before_code=f.read_bytes();f.write_bytes(before_code+b'\n// unknown\n')
    p=run(['--apply']);assert p.returncode==1;assert actions.read_text()=='';assert joins.read_bytes()==before;f.write_bytes(before_code)
    p=run(['--apply']);assert p.returncode==0,(p.stdout,p.stderr)
    after=json.loads(joins.read_text());assert after['real-private-card']==original['real-private-card'];grants=[v for k,v in after.items() if k.startswith('owner-roster-')];assert len(grants)==2
    assert all(v['paid'] is False and v['payments']==[] and 'lastPaidAt' not in v and 'nextPaymentAt' not in v for v in grants)
    assert {v['ownerAccess']['kind'] for v in grants}=={'free','provider_snapshot_access'}
    p=run(['--apply']);assert p.returncode==0,(p.stdout,p.stderr);assert 'новых разрешений 0, обновлено 0' in p.stdout;assert json.loads(joins.read_text())==after
    # Removing a required live store is not treated as an empty database.
    userfile=runtime/'data/bot-users.json';saved=userfile.read_bytes();userfile.unlink();actions.write_text('');p=run(['--apply']);assert p.returncode==1;assert actions.read_text()=='';assert json.loads(joins.read_text())==after;userfile.write_bytes(saved)
    print('PASS: live read-only membership, complete coverage, exact-version guard, safe apply, zero fake payments, financial preservation, idempotent reapply, missing-store failure, no messages or secrets')
    # Test the actual store module in a separate filesystem, without production data.
    storetest=base/'storetest';shutil.copytree(repo/'server/lib',storetest/'lib');(storetest/'data').mkdir();(storetest/'package.json').write_text('{"type":"module"}')
    fixtures={'a':{'tgUserId':'900001','phone':'+79990000001','paid':False,'status':'pending','createdAt':20,'tariffId':'1m'},'b':{'tgUserId':'900002','phone':'+79990000001','prodamusProfileId':'profile-b','paid':True,'status':'active','createdAt':10,'tariffId':'1m','payments':[]}}
    (storetest/'data/pending-joins.json').write_text(json.dumps(fixtures))
    check=storetest/'test.mjs';check.write_text('''import assert from 'node:assert/strict';import fs from 'node:fs';import {findJoinForPayment,findPaidJoin,recordPayment} from './lib/store.js';const file=new URL('./data/pending-joins.json',import.meta.url),before=fs.readFileSync(file,'utf8');assert.equal(findJoinForPayment({phone:'+79990000001',tgUserId:'900002',tariffId:'1m'}).join.token,'b');assert.throws(()=>findJoinForPayment({phone:'+79990000001',tariffId:'1m'}),/ambiguous/);assert.throws(()=>findJoinForPayment({profileId:'profile-b',tgUserId:'900001'}),/conflict/);assert.throws(()=>findPaidJoin({profileId:'profile-b',tgUserId:'900001'}),/conflict/);assert.throws(()=>recordPayment('b',{tgUserId:'900001',amount:350,paidAt:1}),/conflict/);assert.equal(fs.readFileSync(file,'utf8'),before);console.log('PASS: direct Telegram ID wins over shared phone; ambiguous contacts and conflicting profile/payment writes fail without altering money');''')
    subprocess.run(['node',str(check)],check=True)
    # A shared verified email must not override an already bound Telegram identity in the cabinet.
    fixtures['a'].update(paid=True,email='shared@example.invalid',nextPaymentAt=9999999999999)
    fixtures['b'].update(email='shared@example.invalid',nextPaymentAt=8888888888888)
    (storetest/'data/pending-joins.json').write_text(json.dumps(fixtures))
    profilecheck=storetest/'profile.mjs';profilecheck.write_text("import assert from 'node:assert/strict';import {residentJoin} from './lib/accountProfile.js';assert.equal(residentJoin('900002','shared@example.invalid').tgUserId,'900002');console.log('PASS: shared email cannot expose another Telegram resident cabinet');")
    subprocess.run(['node',str(profilecheck)],check=True)

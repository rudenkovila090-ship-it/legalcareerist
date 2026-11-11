from playwright.sync_api import sync_playwright
from pathlib import Path
import json, os
preview=os.environ.get("COMMUNITY_PREVIEW_URL", "http://127.0.0.1:4181")
out=Path('/workspace/artifacts/community-promo-20261111');out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width in [390,1440]:
  for route in ['/community','/knowledge/mif-o-soobschestvah-dlya-studentov-yuristov']:
   for choice in range(3):
    ctx=browser.new_context(viewport={'width':width,'height':1000});page=ctx.new_page();captured=[];errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def intercept(r):
     if '/api/community/subscribe' in r.request.url:
      captured.append(r.request.post_data_json);r.fulfill(json={'ok':True,'url':preview+'/community/success?token=0123456789abcdef'})
     elif '/api/community/promo' in r.request.url:
      data=r.request.post_data_json
      r.fulfill(json={'ok':True,'applied':True,'amount':350,'months':1,'subscriptionId':'2611878'} if data['tariffId']=='1m' and data['promoCode']=='SYNTHETIC350' else {'ok':False,'error':'promo_not_available'},status=200 if data['tariffId']=='1m' and data['promoCode']=='SYNTHETIC350' else 400)
     elif '/api/' in r.request.url:r.fulfill(json={'ok':True,'received':True,'receiptId':'synthetic-browser-receipt','items':[]})
     elif r.request.url.startswith(preview):r.continue_()
     else:r.abort()
    page.route('**/*',intercept);page.goto(preview+route)
    page.get_by_role('button',name='Оплатить',exact=True).nth(choice).click()
    promo=page.get_by_role('textbox',name='Промокод (необязательно)');promo.wait_for();promo.fill(' synthetic350 ' if choice==0 else '')
    assert promo.input_value()==('SYNTHETIC350' if choice==0 else '')
    if choice==0:page.get_by_role('heading',name='Тариф «1 месяц» — 350 ₽',exact=True).wait_for()
    form=promo.locator('xpath=ancestor::form')
    form.get_by_label('ФИО',exact=True).fill('Тестовый пользователь')
    form.locator('input[type=tel]').fill('+79000000880')
    form.get_by_label('Почта',exact=True).fill('synthetic@example.invalid')
    form.get_by_label('Ник в Telegram, например @ivanov',exact=True).fill('@synthetic_promo')
    form.locator('input[name=policy]').check();form.locator('input[name=processing]').check()
    page.screenshot(path=str(out/f'promo-{width}-{choice}-{route.strip("/").replace("/","-")}.png'))
    form.get_by_role('button',name='Перейти к оплате',exact=True).click()
    page.wait_for_timeout(700)
    assert captured and captured[0]['promoCode']==('SYNTHETIC350' if choice==0 else '') and captured[0]['tariffId']==['1m','3m','6m'][choice],(route,width,captured)
    assert not errors,errors
    print('PASS tariff and promo:',route,width,['1m','3m','6m'][choice])
    ctx.close()
 browser.close()

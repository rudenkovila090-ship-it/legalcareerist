"""A vacancy click changes the address bar, survives reload and supports browser Back."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base=os.environ.get('VACANCY_PREVIEW_URL','http://127.0.0.1:4198')
out=Path(os.environ.get('VACANCY_ARTIFACTS','/tmp/vacancy-navigation'))
out.mkdir(parents=True,exist_ok=True)
jobs=[
 ('yurist-v-it-kompaniyu-nomix','Юрист в IT-компанию NOMIX'),
 ('yurist-po-korporativnym-sporam','Юрист по корпоративным спорам'),
 ('yurist-it-ip-volodin-i-partnery','Юрист в IT/IP'),
 ('specialist-po-legaltech','Специалист по LegalTech'),
 ('yurist-it-dogovornoe-i-korporativnoe-pravo','Юрист (IT, договорное и корпоративное право)'),
 ('mladshiy-yurist-tim','Младший юрист'),
]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1000})
 context.add_init_script("localStorage.setItem('ky_cookie_consent','declined')")
 def route(r):
  if '/api/' in r.request.url:r.fulfill(json={'views':0,'applications':0,'reviews':[]})
  elif r.request.url.startswith(base):r.continue_()
  else:r.abort()
 context.route('**/*',route)
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 for width in [320,390,1024,1440]:
  page.set_viewport_size({'width':width,'height':1000})
  page.goto(base+'/kadry/candidates?tab=vacancies')
  board=page.get_by_role('region',name='Поиск вакансий')
  board.locator('[data-vacancy-summary]').first.wait_for()
  for slug,title in jobs:
   card=board.get_by_role('link').filter(has=page.get_by_text(title,exact=True))
   assert card.get_attribute('href')=='/vacancies/'+slug
   card.click()
   page.wait_for_url(base+'/vacancies/'+slug)
   page.get_by_role('heading',name=title,exact=True).wait_for()
   assert page.get_by_role('button',name='Скопировать ссылку на вакансию',exact=True).count()==0
   assert page.get_by_role('link',name='Открыть отдельно',exact=True).count()==0
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   if slug==jobs[0][0]:
    nav=page.get_by_role('navigation',name='Навигация по вакансиям',exact=True)
    back=nav.get_by_role('link',name='← Все вакансии',exact=True)
    if width>=1024:
     assert back.bounding_box()['x']+back.bounding_box()['width']<=page.get_by_role('heading',name=title,exact=True).bounding_box()['x']-16
     assert abs(nav.evaluate('e=>e.getBoundingClientRect().top-e.nextElementSibling.getBoundingClientRect().top'))<1
    page.screenshot(path=str(out/f'vacancy-direct-{width}.png'))
    page.mouse.move(width*.6,650);page.mouse.wheel(0,600)
    page.wait_for_function('scrollY>=500')
    box=back.bounding_box();header=page.locator('header').bounding_box()
    assert header['y']+header['height']+8<=box['y']<header['height']+60,(width,box,header)
    assert back.evaluate('e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest("a")===e}')
    assert page.get_by_role('heading',name=title,exact=True).bounding_box()['y']<0
    page.screenshot(path=str(out/f'vacancy-scrolled-{width}.png'))
    page.mouse.wheel(0,-600);page.wait_for_function('scrollY<=1')
   page.reload()
   page.get_by_role('heading',name=title,exact=True).wait_for()
   assert page.url==base+'/vacancies/'+slug
   page.go_back();board.wait_for()
   assert board.locator('[data-vacancy-summary]').count()==6
  print(f'PASS: {width}px, all six cards change the address bar, reload the correct job and return via browser Back; share controls absent')
 # The filtered list must survive both browser Back and the page's return link.
 page.get_by_label('Город',exact=True).select_option('Москва')
 page.get_by_label('Заработная плата, ₽ (например, 100 000)',exact=True).fill('100 000')
 page.get_by_role('button',name='Отрасль компании',exact=True).click()
 page.get_by_label('IT',exact=True).click()
 expect(page.get_by_label('IT',exact=True)).to_be_checked()
 page.get_by_role('button',name='Отрасль компании',exact=False).click()
 cards=board.get_by_role('link').filter(has=page.locator('[data-vacancy-summary]'))
 assert cards.count()==1
 list_url=page.url
 cards.first.click();page.wait_for_url(base+'/vacancies/'+jobs[0][0])
 page.go_back();board.wait_for()
 assert page.url==list_url and cards.count()==1
 assert page.get_by_label('Город',exact=True).input_value()=='Москва'
 assert page.get_by_label('Заработная плата, ₽ (например, 100 000)',exact=True).input_value()=='100 000'
 cards.first.click();page.wait_for_url(base+'/vacancies/'+jobs[0][0])
 page.get_by_role('link',name='← Все вакансии',exact=True).click();board.wait_for()
 assert page.url==list_url and cards.count()==1
 with context.expect_page() as opened:
  cards.first.click(modifiers=['Control'])
 separate=opened.value
 separate.wait_for_url(base+'/vacancies/'+jobs[0][0])
 separate.get_by_role('heading',name=jobs[0][1],exact=True).wait_for()
 separate.close()
 print('PASS: filtered list restored by browser Back and return link; normal link also opens in a new tab')
 assert not errors,errors
 browser.close()

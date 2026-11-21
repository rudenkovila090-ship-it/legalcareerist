"""A copied link opens one vacancy, including when copied from the embedded board."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

base=os.environ.get('VACANCY_PREVIEW_URL','http://127.0.0.1:4198')
out=Path(os.environ.get('VACANCY_ARTIFACTS','/tmp/vacancy-sharing'))
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
 context.add_init_script('''localStorage.setItem('ky_cookie_consent','declined');
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{
   if(window.rejectClipboard)throw new Error('Permission denied');window.copiedVacancy=text;
 }}});''')
 def route(r):
  if '/api/' in r.request.url:r.fulfill(json={'views':0,'applications':0,'reviews':[]})
  elif r.request.url.startswith(base):r.continue_()
  else:r.abort()
 context.route('**/*',route)
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 for slug,title in jobs:
  page.goto(base+'/vacancies/'+slug+'?utm_source=test#details',wait_until='networkidle')
  page.get_by_role('heading',name=title,exact=True).wait_for()
  page.get_by_role('button',name='Скопировать ссылку на вакансию',exact=True).click()
  page.wait_for_function('(url)=>window.copiedVacancy===url',arg='https://legalcareerist.ru/vacancies/'+slug)
  page.get_by_text('Ссылка скопирована',exact=True).wait_for()
  assert page.get_by_role('link',name='Открыть отдельно',exact=True).count()==0
 print('PASS: all six direct pages copy their unique public URL without preview host, query or fragment')
 for width in [320,390,1440]:
  page.set_viewport_size({'width':width,'height':1000})
  page.goto(base+'/kadry/candidates')
  page.get_by_role('button',name='Вакансии',exact=True).click()
  for slug,title in jobs[:2]:
   board=page.get_by_role('region',name='Поиск вакансий')
   board.get_by_role('button').filter(has=page.get_by_text(title,exact=True)).click()
   page.get_by_role('button',name='Скопировать ссылку на вакансию',exact=True).click()
   page.wait_for_function('(url)=>window.copiedVacancy===url',arg='https://legalcareerist.ru/vacancies/'+slug)
   separate=page.get_by_role('link',name='Открыть отдельно',exact=True)
   assert separate.get_attribute('href')=='/vacancies/'+slug
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
   if slug==jobs[0][0]:page.screenshot(path=str(out/f'embedded-share-{width}.png'))
   page.get_by_role('button',name='← Все вакансии',exact=True).click()
  # Open the actual separate page and reload it: it must retain the chosen vacancy.
  board.get_by_role('button').filter(has=page.get_by_text(jobs[0][1],exact=True)).click()
  page.get_by_role('link',name='Открыть отдельно',exact=True).click()
  page.wait_for_url('**/vacancies/'+jobs[0][0]);page.reload()
  page.get_by_role('heading',name=jobs[0][1],exact=True).wait_for()
  print(f'PASS: {width}px embedded copy, switching vacancies, separate navigation and reload')
 page.evaluate('window.rejectClipboard=true')
 page.get_by_role('button',name='Скопировать ссылку на вакансию',exact=True).click()
 manual=page.get_by_role('textbox',name='Ссылка на вакансию',exact=True)
 assert manual.input_value()=='https://legalcareerist.ru/vacancies/'+jobs[0][0]
 page.wait_for_function('''()=>{const e=document.querySelector('input[readonly]');return e && document.activeElement===e && e.selectionStart===0 && e.selectionEnd===e.value.length}''')
 assert not page.get_by_text('Ссылка скопирована',exact=True).count()
 print('PASS: denied clipboard shows the complete selected URL for manual copying')
 assert not errors,errors
 browser.close()

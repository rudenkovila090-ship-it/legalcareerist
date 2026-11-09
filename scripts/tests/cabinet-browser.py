import json, pathlib, os
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
fixture=json.loads(pathlib.Path(os.environ.get('CABINET_TEST_FIXTURE', '/tmp/cabinet-redesign/fixture.json')).read_text())
preview=os.environ.get('CABINET_PREVIEW_URL', 'http://127.0.0.1:4196')
out=pathlib.Path(__file__).resolve().parents[3]/'artifacts';out.mkdir(parents=True,exist_ok=True);errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':1440,'height':1100})
 context.add_init_script("localStorage.setItem('ky_cabinet_token',"+json.dumps(fixture['token'])+");")
 def route(r):
  u=urlsplit(r.request.url)
  if u.path.startswith('/api/'):
   response=r.fetch(url=fixture['origin']+u.path+('?' + u.query if u.query else ''))
   r.fulfill(response=response)
  elif u.hostname in ['127.0.0.1','localhost']:r.continue_()
  else:r.abort()
 context.route('**/*',route)
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def goto(section):
  page.goto(preview+'/cabinet'+section);page.get_by_role('region',name='Профиль и аккаунт',exact=True).wait_for();page.wait_for_timeout(450)
 goto('')
 assert page.get_by_role('region',name='Профиль и аккаунт').count()==1
 assert page.get_by_role('region',name='Личные данные и контакты',exact=True).count()==0
 assert page.locator('a[href="/cabinet/resident"]:visible').count()==1
 page.screenshot(path=str(out/'cabinet-new-dashboard-1440.png'),full_page=True)
 for section in ['/vacancies','/career','/events','/knowledge','/networking','/partner','/profile','/career-profile','/job-profile']:
  goto(section)
  assert page.locator('nav[aria-label="Разделы кабинета"]:visible').count()==1,section
  assert page.locator('a[href="/cabinet/partner"]:visible').evaluate('(e)=>e.scrollWidth <= e.clientWidth+2'),section
  if section=='/knowledge':
   page.get_by_role('region',name='Фильтры базы знаний').wait_for()
   page.get_by_placeholder('Название материала').fill('zzzznotfound')
   assert page.get_by_text('Материалов по этим фильтрам нет.').is_visible()
   page.get_by_role('button',name='Сбросить фильтры').click()
  if section=='/events':
   sizes=page.locator('a[href^="/events/"] h3').evaluate_all('(es)=>es.map(e=>getComputedStyle(e).fontSize)');assert len(set(sizes))<=1,sizes
  if section in ['/knowledge','/networking','/career']:page.screenshot(path=str(out/('cabinet-new-'+section[1:]+'-1440.png')),full_page=True)
 goto('/career-profile')
 page.get_by_role('button',name='Карьерные ожидания',exact=True).click()
 page.get_by_label('Город',exact=True).fill('Тестовый город')
 page.get_by_role('button',name='Сохранить',exact=True).click()
 page.get_by_text('Сохранено',exact=True).wait_for()
 goto('/job-profile')
 page.get_by_role('button',name='Карьерные ожидания',exact=True).click()
 assert page.get_by_label('Город',exact=True).input_value()=='Тестовый город'
 goto('/knowledge')
 first=page.locator('[aria-label="Материалы базы знаний"] a').first
 if first.count():
  first.click();page.wait_for_timeout(450)
  assert page.locator('nav[aria-label="Разделы кабинета"]:visible').count()==1
  assert page.locator('article').inner_text().strip()
 goto('/networking')
 page.get_by_label('Имя и фамилия',exact=True).fill('Тестовый контакт')
 page.get_by_label('Компания',exact=True).fill('Тестовая компания')
 page.get_by_label('Заметки',exact=True).fill('Знакомство на встрече')
 page.get_by_role('button',name='Сохранить',exact=True).click()
 page.get_by_role('heading',name='Тестовый контакт',exact=True).wait_for()
 goto('/networking');assert page.get_by_role('heading',name='Тестовый контакт',exact=True).is_visible()
 page.get_by_role('button',name='Редактировать',exact=True).click()
 page.get_by_label('Должность / специализация',exact=True).fill('Юрист')
 page.get_by_role('button',name='Сохранить',exact=True).click();page.get_by_text('Тестовая компания · Юрист').wait_for()
 page.get_by_role('button',name='Удалить',exact=True).click();page.get_by_role('button',name='Подтвердить удаление',exact=True).click();page.get_by_text('Здесь появятся ваши контакты после сохранения формы.').wait_for()
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':1000})
  for section in ['', '/knowledge','/events','/networking','/partner','/career-profile']:
   goto(section)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),(width,section)
   if width==390 and section in ['', '/knowledge']:page.screenshot(path=str(out/('cabinet-new-'+(section[1:] or 'dashboard')+'-390.png')),full_page=True)
 assert not errors,errors
 print('PASS browser: dashboard, nine sections, fixed navigation, KB filters, uniform event titles, persisted contacts CRUD, 320/390/768/1440 px; no JS errors')
 browser.close()

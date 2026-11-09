import json,os,pathlib,re
from playwright.sync_api import sync_playwright
base=os.environ.get('VACANCY_PREVIEW_URL','http://127.0.0.1:4198')
out=pathlib.Path(os.environ.get('VACANCY_ARTIFACTS','/workspace/artifacts'));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':1440,'height':1000});errors=[];requests=[]
 def route(r):
  if '/api/' in r.request.url:
   requests.append((r.request.method,r.request.url))
   r.fulfill(status=200,content_type='application/json',body=json.dumps({'views':8,'applications':2,'reviews':[]}));return
  if r.request.url.startswith(base):r.continue_()
  else:r.abort()
 c.route('**/*',route);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def enter():
  page.goto(base+'/kadry/candidates');page.get_by_role('button',name='Вакансии',exact=True).click();page.locator('[data-vacancy-summary]').first.wait_for()
 enter()
 if page.get_by_role('button',name='Отклонить',exact=True).count():page.get_by_role('button',name='Отклонить',exact=True).click()
 board=page.get_by_role('region',name='Поиск вакансий');cards=board.locator('button').filter(has=page.locator('[data-vacancy-summary]'))
 assert cards.count()==3
 assert not page.get_by_role('heading',name='Доска вакансий',exact=True).count()
 assert not board.get_by_text(re.compile('просмотр')).count()
 assert not any('/api/vacancies/views' in u for _,u in requests)
 panel=board.locator('.glass').first;assert panel.bounding_box()['height']<=145,panel.bounding_box()
 for field in ['position','company','city','salary','sphere','action']:
  rows=cards.locator('[data-vacancy-row="'+field+'"]');ys=rows.evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().top)');assert max(ys)-min(ys)<1,(field,ys)
 assert max(cards.evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().height)'))<210
 assert cards.get_by_text('Посмотреть вакансию',exact=False).count()==3
 page.screenshot(path=str(out/'vacancy-board-compact-1440.png'),full_page=True)
 page.get_by_label('Направление',exact=True).select_option('inhouse');assert cards.count()==2
 page.get_by_label('Направление',exact=True).select_option('all')
 page.get_by_label('Город',exact=True).select_option('Елабуга');assert cards.count()==1
 cards.first.click();page.get_by_role('button',name='← Все вакансии',exact=True).wait_for();page.get_by_text('8 просмотров',exact=False).wait_for()
 page.get_by_role('button',name='← Все вакансии',exact=True).click();assert page.get_by_label('Город',exact=True).input_value()=='Елабуга';assert cards.count()==1
 page.get_by_label('Город',exact=True).select_option('');assert cards.count()==3
 page.get_by_label('Опыт работы',exact=True).select_option('from1');assert cards.count()==1
 page.get_by_label('Опыт работы',exact=True).select_option('any')
 page.get_by_label('Заработная плата, ₽ (например, 100 000)',exact=True).fill('100 000');assert cards.count()==1
 page.get_by_label('Заработная плата, ₽ (например, 100 000)',exact=True).fill('')
 page.get_by_label('Формат',exact=True).select_option('remote');assert cards.count()==0
 page.get_by_label('Формат',exact=True).select_option('any');assert cards.count()==3
 page.get_by_label('График',exact=True).select_option('5/2');assert cards.count()==3
 page.get_by_label('График',exact=True).select_option('any')
 page.get_by_label('Занятость',exact=True).select_option('part');assert cards.count()==0
 page.get_by_label('Занятость',exact=True).select_option('any')
 page.get_by_role('button',name='Образование',exact=True).click();page.get_by_label('Среднее специальное',exact=True).check();assert cards.count()==0
 page.get_by_label('Среднее специальное',exact=True).uncheck();assert cards.count()==3
 page.get_by_role('button',name='Образование',exact=True).click()
 page.get_by_role('button',name='Отрасль компании',exact=True).click();page.get_by_label('IT',exact=True).check();assert cards.count()==1
 page.get_by_label('IT',exact=True).uncheck();assert cards.count()==3
 page.get_by_role('button',name='Отрасль компании',exact=True).click()
 for width in [320,390,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':1000});enter()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  for label in ['Отрасль компании','Образование']:
   page.get_by_role('button',name=label,exact=True).click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,label);page.get_by_role('button',name=label,exact=True).click()
  if width==390:page.screenshot(path=str(out/'vacancy-board-compact-390.png'),full_page=True)
  page.goto(base+'/kadry/vacancies');page.locator('[data-vacancy-summary]').first.wait_for()
  assert page.locator('[data-vacancy-summary]').count()==3
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),('standalone',width)
 assert not errors,errors
 assert all('/view' in u for method,u in requests if method=='POST'),requests
 print('PASS compact vacancy board: 142px filters, aligned card rows, no list views, detail views retained, nine filters, back-navigation, explicit CTA, two routes, 320–1440px')
 b.close()

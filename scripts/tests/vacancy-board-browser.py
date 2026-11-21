import json,os,pathlib,re
from playwright.sync_api import sync_playwright, expect
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
 board=page.get_by_role('region',name='Поиск вакансий');cards=board.get_by_role('link').filter(has=page.locator('[data-vacancy-summary]'))
 expect(cards).to_have_count(6)
 assert not page.get_by_role('heading',name='Доска вакансий',exact=True).count()
 assert not board.get_by_text(re.compile('просмотр')).count()
 assert not any('/api/vacancies/views' in u for _,u in requests)
 panel=board.locator('.glass').first;assert panel.bounding_box()['height']<=145,panel.bounding_box()
 for field in ['position','company','city','salary','sphere','action']:
  rows=cards.locator('[data-vacancy-row="'+field+'"]');ys=rows.evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().top)')
  for row in [ys[:3],ys[3:]]:assert max(row)-min(row)<1,(field,ys)
 assert max(cards.evaluate_all('(es)=>es.map(e=>e.getBoundingClientRect().height)'))<210
 assert cards.get_by_text('Посмотреть вакансию',exact=False).count()==6
 page.screenshot(path=str(out/'vacancy-board-compact-1440.png'),full_page=True)
 page.get_by_label('Направление',exact=True).select_option('inhouse');expect(cards).to_have_count(3)
 page.get_by_label('Направление',exact=True).select_option('all')
 page.get_by_label('Город',exact=True).select_option('Елабуга');expect(cards).to_have_count(1)
 cards.first.click();page.wait_for_url('**/vacancies/specialist-po-legaltech');page.get_by_role('link',name='← Все вакансии',exact=True).wait_for();page.get_by_text('8 просмотров',exact=False).wait_for()
 page.get_by_role('link',name='← Все вакансии',exact=True).click();assert page.get_by_label('Город',exact=True).input_value()=='Елабуга';expect(cards).to_have_count(1)
 page.get_by_label('Город',exact=True).select_option('');expect(cards).to_have_count(6)
 page.get_by_label('Опыт работы',exact=True).select_option('from1');expect(cards).to_have_count(1)
 page.get_by_label('Опыт работы',exact=True).select_option('any')
 page.get_by_label('Заработная плата, ₽ (например, 100 000)',exact=True).fill('100 000');expect(cards).to_have_count(3)
 page.get_by_label('Заработная плата, ₽ (например, 100 000)',exact=True).fill('');expect(cards).to_have_count(6)
 page.get_by_label('Формат',exact=True).select_option('remote');expect(cards).to_have_count(0)
 page.get_by_label('Формат',exact=True).select_option('any');expect(cards).to_have_count(6)
 page.get_by_label('График',exact=True).select_option('5/2');expect(cards).to_have_count(5)
 page.get_by_label('График',exact=True).select_option('any');expect(cards).to_have_count(6)
 page.get_by_label('Занятость',exact=True).select_option('part');expect(cards).to_have_count(0)
 page.get_by_label('Занятость',exact=True).select_option('any')
 page.get_by_role('button',name='Образование',exact=True).click();page.get_by_label('Среднее специальное',exact=True).click();expect(page.get_by_label('Среднее специальное',exact=True)).to_be_checked();expect(cards).to_have_count(0)
 page.get_by_label('Среднее специальное',exact=True).click();expect(page.get_by_label('Среднее специальное',exact=True)).not_to_be_checked();expect(cards).to_have_count(6)
 page.get_by_role('button',name='Образование',exact=True).click()
 page.get_by_role('button',name='Отрасль компании',exact=True).click();page.get_by_label('IT',exact=True).click();expect(page.get_by_label('IT',exact=True)).to_be_checked();expect(cards).to_have_count(2)
 page.get_by_label('IT',exact=True).click();expect(page.get_by_label('IT',exact=True)).not_to_be_checked();expect(cards).to_have_count(6)
 page.get_by_role('button',name='Отрасль компании',exact=True).click()
 for width in [320,390,768,1024,1440]:
  page.set_viewport_size({'width':width,'height':1000});enter()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  for label in ['Отрасль компании','Образование']:
   page.get_by_role('button',name=label,exact=True).click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(width,label);page.get_by_role('button',name=label,exact=True).click()
  if width==390:page.screenshot(path=str(out/'vacancy-board-compact-390.png'),full_page=True)
  page.goto(base+'/kadry/vacancies');page.locator('[data-vacancy-summary]').first.wait_for()
  assert page.locator('[data-vacancy-summary]').count()==6
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),('standalone',width)
 for width in [390,1440]:
  page.set_viewport_size({'width':width,'height':1000})
  for slug,title,email in [
   ('yurist-v-it-kompaniyu-nomix','Юрист в IT-компанию NOMIX','kabanova.v@nomixvr.ru'),
   ('yurist-po-korporativnym-sporam','Юрист по корпоративным спорам','k.vostrikova@slp-legal.ru'),
   ('yurist-it-ip-volodin-i-partnery','Юрист в IT/IP','info@volodin-ip.ru'),
  ]:
   page.goto(base+'/vacancies/'+slug)
   page.get_by_role('heading',name=title,exact=True).wait_for()
   assert page.get_by_role('link',name=email,exact=True).get_attribute('href')=='mailto:'+email
   assert not page.locator('input[type=file]').count()
   if slug.endswith('nomix'):
    assert page.get_by_role('link',name='@viktoriaknv',exact=True).get_attribute('href')=='https://t.me/viktoriaknv'
    assert page.get_by_role('link',name='Сайт работодателя',exact=True).get_attribute('href')=='https://nomixvr.ru/'
   if 'korporativnym' in slug:assert page.get_by_text('Работодатель не указан · Москва',exact=True).is_visible()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(slug,width)
   page.screenshot(path=str(out/f'{slug}-{width}.png'),full_page=True)
 assert not errors,errors
 assert all('/view' in u for method,u in requests if method=='POST'),requests
 print('PASS six vacancies and three new detail pages with direct contacts; compact vacancy board: 142px filters, aligned card rows, no list views, detail views retained, nine filters, back-navigation, explicit CTA, two routes, 320–1440px')
 b.close()

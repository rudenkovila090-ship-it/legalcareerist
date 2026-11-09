import json, os, pathlib
from playwright.sync_api import sync_playwright
base=os.environ.get('BLOG_PREVIEW_URL','http://127.0.0.1:4196')
artifacts=pathlib.Path(__file__).resolve().parents[3]/'artifacts';artifacts.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 c=b.new_context(viewport={'width':1440,'height':1000});errors=[];requests=[]
 def route(r):
  if '/api/' in r.request.url:
   requests.append((r.request.method,r.request.url));r.fulfill(status=200,content_type='application/json',body=json.dumps({'views':7,'ok':True}));return
  if r.request.url.startswith(base):r.continue_()
  else:r.abort()
 c.route('**/*',route);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/blog?category='+__import__('urllib.parse',fromlist=['quote']).quote('Подкаст'))
 page.get_by_role('region',name='2 сезон подкаста').wait_for()
 assert page.get_by_role('button',name='Маркетплейс',exact=True).count()==0
 second=page.get_by_role('region',name='2 сезон подкаста');first=page.get_by_role('region',name='1 сезон подкаста')
 assert second.get_by_role('link',name='Слушать',exact=True).count()==2
 assert first.get_by_role('link',name='Слушать',exact=True).count()==16
 assert second.locator('a[href="https://legalcareerist.mave.digital/ep-19"]').count()==1
 assert second.locator('a[href="https://legalcareerist.mave.digital/ep-22"]').count()==1
 assert second.get_by_text('1 ноября 2026',exact=True).is_visible()
 assert second.get_by_text('Как попасть в ВТБ: история трудоустройства молодого юриста',exact=True).is_visible()
 description=page.get_by_text('Подкаст, в котором профессионалы',exact=False)
 assert abs(description.bounding_box()['width']-first.bounding_box()['width'])<2
 page.screenshot(path=str(artifacts/'podcast-season-two-1440.png'),full_page=True)
 page.get_by_role('button',name='Все',exact=True).click()
 cards=page.locator('a[href^="/news/"],a[href^="/knowledge/"]')
 cards.first.wait_for();page.wait_for_timeout(250)
 assert cards.locator('p').count()==0
 for i in range(cards.count()):
  card=cards.nth(i)
  rect=card.bounding_box();views=card.locator('div').last.bounding_box()
  assert abs(views['x']-rect['x']-20)<2
  assert abs(rect['y']+rect['height']-(views['y']+views['height'])-20)<2
  if card.locator('img').count():assert card.locator('img').bounding_box()['y']<card.locator('h3').bounding_box()['y']
 page.screenshot(path=str(artifacts/'blog-compact-cards-1440.png'),full_page=True)
 assert not any(method=='POST' and '/view' in url for method,url in requests)
 for width in [320,390,768]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  page.get_by_role('button',name='Подкаст',exact=True).click()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  if width==390:page.screenshot(path=str(artifacts/'podcast-season-two-390.png'),full_page=True)
  page.get_by_role('button',name='Все',exact=True).click()
 assert not errors,errors
 print('PASS blog: season two links/date, all 16 previous episodes, full-width description, no marketplace chip/excerpts, images above headings, bottom-left views, read-only counts, 320–1440px')
 b.close()

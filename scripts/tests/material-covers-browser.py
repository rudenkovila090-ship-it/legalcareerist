import json, os, pathlib
from playwright.sync_api import sync_playwright
base=os.environ.get('MATERIAL_PREVIEW_URL','http://127.0.0.1:4198')
slugs=['longlist-studencheskie-yuridicheskie-meropriyatiya','gaid-kariera-yurista-v-notariate','gaid-stipendii-i-granty','gaid-kariera-yurista-v-privacy','gaid-ilfy-rulfy-nyulfy','gaid-kariera-yurista-v-nko','gaid-karernoe-planirovanie','gaid-poshagovyy-poisk-raboty']
out=pathlib.Path(os.environ.get('MATERIAL_ARTIFACTS','/workspace/artifacts'));out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);c=b.new_context(viewport={'width':1440,'height':1050});errors=[];posts=[]
 def route(r):
  if '/api/' in r.request.url:
   if r.request.method not in ['GET','HEAD']:posts.append(r.request.url)
   r.fulfill(status=200,content_type='application/json',body=json.dumps({'reviews':[]} if '/reviews' in r.request.url else {}));return
  if r.request.url.startswith(base):r.continue_()
  else:r.abort()
 c.route('**/*',route);page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(base+'/marketplace');page.get_by_role('heading',level=1).wait_for()
 if page.get_by_role('button',name='Отклонить',exact=True).count():page.get_by_role('button',name='Отклонить',exact=True).click()
 cards=page.locator('a[href^="/materials/"]').filter(has=page.locator('h3'))
 assert cards.count()==9,cards.count()
 assert cards.locator('img').count()==8
 for i in range(cards.locator('img').count()):
  im=cards.locator('img').nth(i);im.scroll_into_view_if_needed();im.evaluate('(im)=>im.decode()');assert im.evaluate('(im)=>im.naturalWidth===1199 && im.naturalHeight===1312')
 page.evaluate('scrollTo(0,0)');page.screenshot(path=str(out/'material-covers-marketplace-1440.png'),full_page=True)
 for width in [320,390,768,1440]:
  page.set_viewport_size({'width':width,'height':1000});page.goto(base+'/marketplace');page.get_by_role('heading',level=1).wait_for()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),width
  for slug in slugs:
   page.goto(base+'/materials/'+slug);page.get_by_role('heading',level=1).wait_for()
   cover=page.locator('img[alt^="Обложка:"]:visible');assert cover.count()==1,(slug,width)
   cover.evaluate('(im)=>im.decode()');assert cover.evaluate('(im)=>im.naturalWidth===1199')
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(slug,width)
   if slug=='gaid-karernoe-planirovanie' and width==1440:page.screenshot(path=str(out/'material-cover-planning-1440.png'),full_page=True)
   if slug=='gaid-kariera-yurista-v-privacy' and width==390:page.screenshot(path=str(out/'material-cover-privacy-390.png'),full_page=True)
 page.goto(base+'/events/materials');page.get_by_role('heading',level=1).wait_for()
 assert page.locator('a[href^="/materials/"] img').count()==8
 assert not errors,errors
 assert not posts,posts
 print('PASS eight originals: marketplace cards, eight product pages, collage viewport, 320/390/768/1440px, no JS errors or purchase requests')
 b.close()

"""Scroll layers, responsive reading order, carousel and accessible partner motion."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, os

BASE=os.environ.get('COMMUNITY_PREVIEW_URL','http://127.0.0.1:4182')
OUT=Path(os.environ.get('COMMUNITY_MOTION_ARTIFACTS','/tmp/legalcareerist-community-motion'))
OUT.mkdir(parents=True,exist_ok=True)
results=[]

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    def open_page(width,height=1000,motion='no-preference'):
        page=browser.new_page(viewport={'width':width,'height':height},reduced_motion=motion)
        page.add_init_script("localStorage.setItem('ky_cookie_consent','declined')")
        page.route('**/api/**',lambda r:r.fulfill(json={'ok':True,'items':[]}))
        page.goto(BASE+'/community',wait_until='networkidle')
        page.evaluate('document.fonts.ready')
        page.locator('.community-story-art img').evaluate("async e=>{e.loading='eager';await e.decode()}")
        return page

    for width in [1440,1920]:
        page=open_page(width)
        page.screenshot(path=str(OUT/f'hero-{width}.png'))
        story=page.locator('#mvc')
        assert 'is-interactive' in story.get_attribute('class')
        assert story.get_by_role('tab').count()==3
        position=page.locator('.community-story-track').evaluate('''e=>{
          const s=e.querySelector('.community-story-stage');
          return {start:scrollY+e.getBoundingClientRect().top-parseFloat(getComputedStyle(s).top),travel:e.offsetHeight-s.offsetHeight};
        }''')
        stages=[]
        for index,fraction in [(0,0),(1,.44),(2,.85),(0,0)]:
            page.evaluate('(o)=>scrollTo({top:o.start+o.travel*o.fraction,behavior:"instant"})',{**position,'fraction':fraction})
            page.wait_for_function('(i)=>document.querySelector("#mvc").dataset.activeLayer===String(i)',arg=index)
            page.wait_for_timeout(400)  # the authored text reveal is 360 ms
            assert story.get_by_role('tabpanel').count()==1
            assert story.get_by_role('tab').nth(index).get_attribute('aria-selected')=='true'
            stages.append(page.locator('.community-story-stage').evaluate('e=>Math.round(e.getBoundingClientRect().top)'))
            page.locator('.community-story-stage').screenshot(path=str(OUT/f'story-{width}-{index}.png'))
        assert max(stages)-min(stages)<=1,stages
        story.get_by_role('tab').first.focus()
        page.keyboard.press('ArrowRight')
        page.wait_for_function('document.querySelector("#mvc").dataset.activeLayer==="1"')
        assert story.get_by_role('tab',name='Ценности').evaluate('e=>document.activeElement===e')

        track=page.locator('#ambassadors [aria-roledescription="карусель"]')
        bounds=track.bounding_box()
        assert bounds['x']<=41 and bounds['x']+bounds['width']>=width-41,bounds
        assert page.locator('#ambassadors [data-loop-copy="1"] article').count()==10
        for i in range(10):
            page.get_by_role('button',name='Следующие амбассадоры',exact=True).click()
            expected=(i+1)%10+1
            page.wait_for_function('(n)=>document.querySelector("#ambassadors [role=status]").textContent.includes(`Амбассадор ${n} из`)',arg=expected)
        page.locator('#ambassadors').screenshot(path=str(OUT/f'ambassadors-{width}.png'))

        partners=page.locator('#partners')
        partners.scroll_into_view_if_needed();page.mouse.move(0,0)
        groups=page.locator('.community-partners-group').evaluate_all('es=>es.map(e=>e.getBoundingClientRect().width)')
        assert abs(groups[0]-groups[1])<.1 and groups[0]>=width-1,groups
        marquee=page.locator('.community-partners-track')
        before=marquee.evaluate('e=>getComputedStyle(e).transform')
        page.wait_for_timeout(180)
        assert before!=marquee.evaluate('e=>getComputedStyle(e).transform')
        page.get_by_role('button',name='Приостановить ленту партнеров').click()
        assert marquee.evaluate('e=>getComputedStyle(e).animationPlayState')=='paused'
        before=marquee.evaluate('e=>getComputedStyle(e).transform')
        page.wait_for_timeout(180)
        assert before==marquee.evaluate('e=>getComputedStyle(e).transform')
        page.get_by_role('button',name='Продолжить ленту партнеров').click()
        page.mouse.move(0,0)
        assert marquee.evaluate('e=>getComputedStyle(e).animationPlayState')=='running'
        page.get_by_role('button',name='Приостановить ленту партнеров').click()
        partners.screenshot(path=str(OUT/f'partners-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        results.append({'width':width,'scrollLayers':3,'reverseScroll':True,'keyboardTabs':True,'ambassadorLoop':True,'partnerMotionAndPause':True,'pageOverflow':False})
        page.close()

    for width,height,motion in [(320,1000,'no-preference'),(390,1000,'no-preference'),(768,1000,'no-preference'),(1440,1000,'reduce'),(1440,500,'no-preference')]:
        page=open_page(width,height,motion)
        story=page.locator('#mvc')
        assert 'is-static' in story.get_attribute('class')
        assert story.get_by_role('tab').count()==0
        assert page.locator('.community-story-panel[aria-hidden=true]').count()==0
        for label in ['Миссия','Ценности','Цель']:
            assert story.get_by_role('heading',name=label,exact=True).is_visible()
        assert story.get_by_text('В разработке',exact=True).count()==4
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        if motion=='reduce':
            assert page.locator('.community-partners-track').evaluate('e=>getComputedStyle(e).animationName')=='none'
            assert not page.get_by_role('button',name='Приостановить ленту партнеров').is_visible()
        if width in [390,768] or motion=='reduce':
            story.screenshot(path=str(OUT/f'story-static-{width}-{motion}.png'))
        page.screenshot(path=str(OUT/f'page-{width}-{height}-{motion}.png'),full_page=True)
        results.append({'width':width,'height':height,'motion':motion,'allStoryTextInFlow':True,'pageOverflow':False})
        page.close()
    browser.close()

(OUT/'motion-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))

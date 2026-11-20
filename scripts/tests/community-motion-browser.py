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
        return page

    for width,height in [(1440,1000),(1920,900)]:
        page=open_page(width,height)
        page.screenshot(path=str(OUT/f'hero-{width}.png'))
        story=page.locator('#mvc')
        assert 'is-interactive' in story.get_attribute('class')
        assert story.get_by_role('tab').count()==0
        assert story.locator('img,figure').count()==0
        assert story.bounding_box()['height']<=330
        assert story.locator('article').count()==2
        assert story.get_by_role('heading',name='Цель',exact=True,include_hidden=True).count()==0
        stage=page.locator('.community-story-stage')
        assert abs(page.locator('.community-story-track').bounding_box()['height']-stage.bounding_box()['height'])<1
        # Reproduce normal reading, instead of jumping to the old end-of-section thresholds.
        for index,delta in [(0,0),(1,120),(0,-120)]:
            if delta: page.mouse.wheel(0,delta)
            page.wait_for_function('(i)=>document.querySelector("#mvc").dataset.activeLayer===String(i)',arg=index)
            page.wait_for_timeout(300)  # the authored text reveal is 260 ms
            assert story.get_by_role('article').count()==1
            assert story.get_by_role('heading',name=['Миссия','Ценности'][index],exact=True).is_visible()
            box=stage.bounding_box()
            assert abs(story.get_by_role('article').bounding_box()['height']-box['height'])<1
            assert abs(page.locator('.community-story-panels').bounding_box()['height']-box['height'])<1
            assert box['y']>page.locator('header').bounding_box()['height']+16,box
            assert box['y']+box['height']<height,box
            assert page.locator('#benefits h2').bounding_box()['y']>box['y']+box['height']
            stage.screenshot(path=str(OUT/f'story-{width}-{index}.png'))
        stage.focus()
        page.keyboard.press('ArrowRight')
        page.wait_for_function('document.querySelector("#mvc").dataset.activeLayer==="1"')
        assert stage.evaluate('e=>document.activeElement===e')
        for key,index in [('Home',0),('End',1),('ArrowLeft',0)]:
            page.keyboard.press(key)
            page.wait_for_function('(i)=>document.querySelector("#mvc").dataset.activeLayer===String(i)',arg=index)
            assert stage.evaluate('e=>document.activeElement===e')

        track=page.locator('#ambassadors [aria-roledescription="карусель"]')
        bounds=track.bounding_box()
        assert 40<=bounds['x']<=81 and bounds['x']+bounds['width']>=width-81,bounds
        assert page.locator('#ambassadors [data-loop-copy="1"] article').count()==9
        for i in range(9):
            page.get_by_role('button',name='Следующие амбассадоры',exact=True).click()
            expected=(i+1)%9+1
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
        assert partners.get_by_role('button').count()==0
        region=page.locator('.community-partners-marquee')
        region.focus()
        page.keyboard.press('Space')
        page.wait_for_function('getComputedStyle(document.querySelector(".community-partners-track")).animationPlayState==="paused"')
        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        before=marquee.evaluate('e=>getComputedStyle(e).transform')
        page.wait_for_timeout(180)
        assert before==marquee.evaluate('e=>getComputedStyle(e).transform')
        page.keyboard.press('Space')
        page.mouse.move(0,0)
        assert marquee.evaluate('e=>getComputedStyle(e).animationPlayState')=='running'
        page.keyboard.press('Space')
        partners.screenshot(path=str(OUT/f'partners-{width}.png'))
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('#faq').evaluate('e=>e.nextElementSibling.tagName')=='FOOTER'
        assert page.locator('.community-tariff-saving').evaluate_all('es=>es.every(e=>e.scrollWidth<=e.clientWidth)')
        assert page.locator('.community-tariff-saving').evaluate_all('es=>es.every(e=>getComputedStyle(e).backgroundColor==="rgba(0, 0, 0, 0)")')
        assert page.locator('.community-floating-join').bounding_box()['height']>=60
        results.append({'width':width,'height':height,'scrollLayers':2,'naturalWheelWhileVisible':True,'emptyScrollTrack':False,'reverseScroll':True,'keyboardLayers':True,'storyHeight':story.bounding_box()['height'],'ambassadorLoop':True,'partnerMotionAndKeyboardPause':True,'savingBackground':'transparent','pageOverflow':False})
        page.close()

    for width,height,motion in [(320,1000,'no-preference'),(390,1000,'no-preference'),(768,1000,'no-preference'),(1440,1000,'reduce'),(1440,500,'no-preference')]:
        page=open_page(width,height,motion)
        story=page.locator('#mvc')
        assert 'is-static' in story.get_attribute('class')
        assert story.get_by_role('tab').count()==0
        assert page.locator('.community-story-panel[aria-hidden=true]').count()==0
        assert story.locator('article').count()==2
        for label in ['Миссия','Ценности']:
            assert story.get_by_role('heading',name=label,exact=True).is_visible()
        assert story.get_by_text('В разработке',exact=True).count()==4
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        if motion=='reduce':
            assert page.locator('.community-partners-track').evaluate('e=>getComputedStyle(e).animationName')=='none'
            assert page.locator('#partners button').count()==0
        if width in [390,768] or motion=='reduce':
            story.screenshot(path=str(OUT/f'story-static-{width}-{motion}.png'))
        page.screenshot(path=str(OUT/f'page-{width}-{height}-{motion}.png'),full_page=True)
        results.append({'width':width,'height':height,'motion':motion,'allStoryTextInFlow':True,'pageOverflow':False})
        page.close()
    browser.close()

(OUT/'motion-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps(results,ensure_ascii=False,indent=2))

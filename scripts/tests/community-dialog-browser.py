"""Keyboard regressions for the community payment dialog; no real API writes."""
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('COMMUNITY_PREVIEW_URL', 'http://127.0.0.1:4182')
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    for width in [390, 1440]:
        page = browser.new_page(viewport={'width': width, 'height': 1000}, reduced_motion='reduce')
        page.add_init_script("localStorage.setItem('ky_cookie_consent','declined')")
        page.route('**/api/**', lambda route: route.fulfill(json={'ok': True, 'items': []}))
        page.goto(base + '/community', wait_until='networkidle')
        floating = page.get_by_role('button', name='Стать резидентом — выбрать тариф', exact=True)
        page.locator('footer').scroll_into_view_if_needed()
        assert floating.is_visible()
        floating.click()
        assert page.get_by_role('button', name='Выбрать подписку на 6 месяцев').evaluate('e=>document.activeElement===e')
        for choice, period in enumerate(['1 месяц', '6 месяцев', '3 месяца']):
            trigger = page.locator('#join').get_by_role('button', name='Оплатить', exact=True).nth(choice)
            trigger.click()
            dialog = page.get_by_role('dialog', name=f'Тариф «{period}»', exact=False)
            assert dialog.is_visible()
            assert dialog.evaluate('e=>e.matches(":modal")')
            assert not floating.count()
            close = dialog.get_by_role('button', name='Закрыть', exact=True)
            close.focus()
            page.keyboard.press('Shift+Tab')
            assert dialog.get_by_role('button', name='Перейти к оплате', exact=True).evaluate('e=>document.activeElement===e')
            page.keyboard.press('Tab')
            assert close.evaluate('e=>document.activeElement===e')
            page.keyboard.press('Escape')
            assert not dialog.count()
            assert trigger.evaluate('e=>document.activeElement===e')
            assert floating.is_visible()
            assert page.evaluate('document.body.style.overflow') != 'hidden'
        print(f'PASS: {width}px, all 3 periods, modal focus cycle, Escape, focus restoration')
        page.close()
    browser.close()

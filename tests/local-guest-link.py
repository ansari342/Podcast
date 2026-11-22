import asyncio
from playwright.async_api import async_playwright
BASE='http://localhost:3100'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--no-sandbox'])
        host = await (await b.new_context(permissions=['camera','microphone'])).new_page()
        await host.goto(BASE+'/enter'); await host.fill('input[autocomplete=given-name]','Ahsan'); await host.fill('input[type=password]','idiot'); await host.click('text=Enter'); await host.wait_for_url(BASE+'/')
        await host.goto(BASE+'/studio/abc123?title=T'); await host.click('button:has-text("Setup")'); await host.wait_for_timeout(1500)
        link = await host.locator('input[aria-label="Invite link"]').input_value(); print('invite:', link)
        g = await (await b.new_context(permissions=['camera','microphone'])).new_page()
        errs=[]; g.on('pageerror', lambda e: errs.append(str(e)))
        await g.goto(link.replace('http://localhost:3100', BASE)); print('guest lands on', g.url)
        await g.fill('input[autocomplete=given-name]','Bilal'); await g.click('text=Enter studio'); await g.wait_for_timeout(2500); print('guest in', g.url)
        for path in ['/api/topics']:
            print(' guest', path, await g.evaluate(f"fetch('{path}').then(r=>r.status)"))
        print(' guest token other room:', await g.evaluate("fetch('/api/livekit-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({room:'other',identity:'x'})}).then(r=>r.status)"))
        print(' guest token own room:', await g.evaluate("fetch('/api/livekit-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({room:'abc123',identity:'x'})}).then(r=>r.status)"), '(501 = allowed, no LiveKit keys locally)')
        await g.goto(BASE+'/library'); print(' guest /library ->', g.url.split('?')[0])
        await g.goto(BASE+'/studio/other'); print(' guest other room ->', g.url.split('?')[0])
        x = await (await b.new_context()).new_page(); await x.goto(BASE+'/green-room/abc123?k=wrongkey'); print('bad link ->', x.url.split('?')[0])
        print('errors', errs)
        await b.close()
asyncio.run(main())

import asyncio
from playwright.async_api import async_playwright
BASE='http://localhost:3100'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--no-sandbox'])
        ctx = await b.new_context(permissions=['camera','microphone'])
        errs=[]
        pages=[]
        for i,nm in enumerate(['Ahsan','Bilal','Omar']):
            pg = await ctx.new_page(); pages.append(pg)
            pg.on('pageerror', lambda e, nm=nm: errs.append(nm+' pageerror: '+str(e)))
        A,B,C = pages
        await A.goto(BASE+'/enter'); await A.fill('input[autocomplete=given-name]','Ahsan'); await A.fill('input[type=password]','test-pass'); await A.click('text=Enter'); await A.wait_for_url(BASE+'/')
        await A.evaluate("sessionStorage.setItem('st3-name','Ahsan')")
        await A.goto(BASE+'/studio/room1?title=Three'); 
        for pg,nm in [(B,'Bilal'),(C,'Omar')]:
            await pg.goto(BASE+'/green-room/room1'); await pg.evaluate(f"sessionStorage.setItem('st3-name','{nm}')")
            await pg.wait_for_timeout(1500); await pg.click('text=Enter studio')
        await A.wait_for_timeout(4000)
        for pg in pages: print('people count:', await pg.locator('main video').count(), (await pg.locator('aside').count()))
        await A.click('button:has-text("Games")'); await A.wait_for_timeout(300)
        print('playable for 3:', await A.locator('aside button:has-text("Play")').count())
        # Imposter
        await A.locator('aside div:has(> div > span:text-is("Imposter")) button:has-text("Play")').click(); await A.wait_for_timeout(800)
        secrets = [await pg.locator('main div[style*="rgb(42, 26, 18)"]').first.inner_text() for pg in pages]
        print('imposter secrets:', secrets)
        await B.click('main button:has-text("Start voting")'); await A.wait_for_timeout(500)
        for pg in pages: await pg.locator('main button:has-text("Me"), main button:has-text("Bilal")').first.click()
        await A.wait_for_timeout(400); await C.click('main button:has-text("Reveal")'); await A.wait_for_timeout(500)
        print('reveal on A:', await A.locator('main div[style*="rgb(19, 38, 28)"]').first.inner_text())
        # Fast money muting
        await A.click('button:has-text("Games")'); await A.locator('aside div:has(> div > span:text-is("Fast Money, no sound")) button:has-text("Play")').click(); await A.wait_for_timeout(800)
        for nm,pg in zip(['A','B','C'],pages):
            muted = await pg.evaluate("[...document.querySelectorAll('main audio')].map(a=>a.muted)")
            print(' fast money', nm, 'asker?' , await pg.locator('text=Say it out loud').count(), 'audio muted flags', muted)
        # guesses then reveal
        for pg in pages:
            if await pg.locator('main input.input').count(): await pg.fill('main input.input','coffee'); await pg.press('main input.input','Enter')
        await A.wait_for_timeout(300); await B.click('main button:has-text("Reveal question")'); await A.wait_for_timeout(400)
        print(' after reveal muted flags A:', await A.evaluate("[...document.querySelectorAll('main audio')].map(a=>a.muted)"), '| answers:', (await A.locator('main').inner_text()).count('coffee'))
        # Auction draft bids
        await A.click('button:has-text("Games")'); await A.locator('aside div:has(> div > span:text-is("Auction draft")) button:has-text("Play")').click(); await A.wait_for_timeout(600)
        await A.locator('main button.btn').nth(0).click(); await A.wait_for_timeout(300)
        await B.click('main button:has-text("$1")'); await A.wait_for_timeout(200); await C.click('main button:has-text("$3")'); await A.wait_for_timeout(300)
        print(' auction lead (seen by A):', await A.locator('text=/leads at/').inner_text())
        await A.click('main button:has-text("Sold")'); await A.wait_for_timeout(300)
        print(' Omar budget line on B:', 'yes' if await B.locator('text=$17 left').count() else 'no')
        # Snake draft turn order
        await A.click('button:has-text("Games")'); await A.locator('aside div:has(> div > span:text-is("Snake draft")) button:has-text("Play")').click(); await A.wait_for_timeout(600)
        for k in range(4):
            for pg in pages:
                if await pg.locator('main input[placeholder="Your pick"]').count():
                    await pg.fill('main input[placeholder="Your pick"]', f'pick{k}'); await pg.press('main input[placeholder="Your pick"]','Enter'); await A.wait_for_timeout(250); break
        print(' snake picks on C:', (await C.locator('main').inner_text()).count('pick'))
        # Guess the sound: video hidden for guessers
        await A.click('button:has-text("Games")'); await A.locator('aside div:has(> div > span:text-is("Guess the Sound")) button:has-text("Play")').click(); await A.wait_for_timeout(700)
        print(' hidden tiles per page:', [await pg.locator('text=Hidden until the reveal').count() for pg in pages])
        # Plan sync + recording sync
        await A.click('main button:has-text("End game")'); await A.wait_for_timeout(300)
        # sounds: decode all 8 files in page, then key press plays for all
        ok = await A.evaluate("Promise.all(['buzzer','ding','drumroll','applause','rimshot','airhorn','crickets','gasp'].map(n=>fetch('/sfx/'+n+'.mp3').then(r=>r.arrayBuffer()).then(b=>new AudioContext().decodeAudioData(b)).then(x=>x.duration.toFixed(1))))")
        print(' sfx durations:', ok)
        await B.click('button:has-text("● Record")'); await A.wait_for_timeout(7000)
        await A.keyboard.press('2'); await C.keyboard.press('m'); await A.wait_for_timeout(300); await B.keyboard.press('M'); await A.wait_for_timeout(400)
        print(' marker buttons:', [await pg.locator('button:has-text("Mark · 2")').count() for pg in pages])
        print(' set locked on A:', await A.evaluate("(async()=>{})()") , end=' ')
        await A.click('button:has-text("Topics")'); await A.wait_for_timeout(1200)
        await A.locator('aside button:has-text("Show on screen")').first.click(); await A.wait_for_timeout(500)
        print('| debate banner on all:', [await pg.locator("text=TONIGHT’S DEBATE").count() for pg in pages])
        print(' recording on all:', [await pg.locator('text=/● 00:00:0/').count() for pg in pages])
        await C.click('button:has-text("Pause")'); await A.wait_for_timeout(600)
        print(' paused on all:', [await pg.locator('button:has-text("Resume")').count() for pg in pages])
        await A.click('button:has-text("Resume")'); await A.wait_for_timeout(400)
        await A.click('button.btn-rec:has-text("Stop")'); await A.click('[role=alertdialog] button:has-text("Stop")'); await A.wait_for_timeout(2500)
        print(' stopped on all:', [await pg.locator('button:has-text("● Record")').count() for pg in pages])
        await A.wait_for_timeout(500)
        n = await A.evaluate("""async () => { const d = await navigator.storage.getDirectory(); const s = await d.getDirectoryHandle('sessions'); const out=[]; for await (const [k,h] of s.entries()) { const m = JSON.parse(await (await (await h.getFileHandle('manifest.json')).getFile()).text()); out.push([k, m.userId, m.chunks.map(c=>c.track).reduce((a,t)=>(a[t]=(a[t]||0)+1,a),{})]); } return out; }""")
        print(' on disk:', n)
        await B.click('button:has-text("Setup")'); await B.wait_for_timeout(300)
        await B.locator('aside button:has-text("Start")').first.click(); await A.wait_for_timeout(400)
        await A.click('button:has-text("Setup")'); await A.wait_for_timeout(300)
        print(' people statuses on A:', (await A.locator('aside').inner_text()).count('uploaded') + (await A.locator('aside').inner_text()).count('to upload') + (await A.locator('aside').inner_text()).count('Nothing to upload'))
        await A.locator('aside button:has-text("Fix this")').first.click(); await A.wait_for_timeout(3500)
        print(' remote fix result shown:', 'Camera' in (await A.locator('aside').inner_text()))
        print(' plan Now on A:', (await A.locator('aside div:has(> span:text-is("Now"))').first.inner_text())[:60])
        print('ERRORS:', errs[:10])
        await b.close()
asyncio.run(main())

import { chromium } from 'playwright'
const URL = 'http://localhost:5210/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('PAGEERR:', e.message))
page.on('console', (m) => { const t=m.text(); if(/crouch|fail|warn|error/i.test(t)) console.log('LOG:', t) })
await page.goto(URL, { waitUntil: 'load' }); await sleep(3500)
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/play|start match/i.test(x.textContent||'')); if(b) b.click() })
const press=(c,k)=>page.evaluate(({c,k})=>document.dispatchEvent(new KeyboardEvent('keydown',{code:c,key:k,bubbles:true})),{c,k})
const rel=(c,k)=>page.evaluate(({c,k})=>document.dispatchEvent(new KeyboardEvent('keyup',{code:c,key:k,bubbles:true})),{c,k})
// let the player spawn-fall and settle on the ground
await sleep(3000)
// switch to TPP
await press('KeyV','v'); await sleep(60); await rel('KeyV','v'); await sleep(800)
await page.screenshot({ path: '/tmp/cr-stand.png' })
// hold crouch (do NOT release — isDown must stay true)
await press('ControlLeft','Control'); await sleep(1200)
await page.screenshot({ path: '/tmp/cr-idle.png' })
// crouch-walk forward
await press('KeyW','w'); await sleep(900)
await page.screenshot({ path: '/tmp/cr-walk.png' })
await rel('KeyW','w'); await sleep(200)
// crouch-strafe right
await press('KeyD','d'); await sleep(900)
await page.screenshot({ path: '/tmp/cr-strafe.png' })
await rel('KeyD','d'); await sleep(200)
// fire while crouched (mouse down on canvas)
await page.mouse.move(640,360); await page.mouse.down(); await sleep(500)
await page.screenshot({ path: '/tmp/cr-fire.png' })
await page.mouse.up()
await rel('ControlLeft','Control'); await sleep(800)
await page.screenshot({ path: '/tmp/cr-standup.png' })
console.log('DONE')
await browser.close()

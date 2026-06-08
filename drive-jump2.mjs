import { chromium } from 'playwright'
const URL = 'http://localhost:5210/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const browser = await chromium.launch({
  headless: true, executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
page.on('console', (m) => { const t=m.text(); if(/failed to load anim/i.test(t)) errs.push(t) })
page.on('pageerror', (e) => console.log('PAGEERR:', e.message))
await page.goto(URL, { waitUntil: 'load' }); await sleep(3500)
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/play|start match/i.test(x.textContent||'')); if(b) b.click() })
await sleep(4000)
const press=(c,k)=>page.evaluate(({c,k})=>document.dispatchEvent(new KeyboardEvent('keydown',{code:c,key:k,bubbles:true})),{c,k})
const rel=(c,k)=>page.evaluate(({c,k})=>document.dispatchEvent(new KeyboardEvent('keyup',{code:c,key:k,bubbles:true})),{c,k})
await press('KeyV','v'); await sleep(60); await rel('KeyV','v'); await sleep(1000)
await page.screenshot({ path: '/tmp/j2-ground.png' })
// rifle jump
await press('Space',' '); await sleep(80); await rel('Space',' ')
await sleep(130); await page.screenshot({ path: '/tmp/j2-rifle-a.png' })
await sleep(160); await page.screenshot({ path: '/tmp/j2-rifle-b.png' })
await sleep(200); await page.screenshot({ path: '/tmp/j2-rifle-c.png' })
await sleep(700)
// pistol jump
await press('Digit2','2'); await sleep(60); await rel('Digit2','2'); await sleep(800)
await press('Space',' '); await sleep(80); await rel('Space',' ')
await sleep(160); await page.screenshot({ path: '/tmp/j2-pistol.png' })
console.log('LOAD ERRORS:', errs.length?errs:'none')
await browser.close(); console.log('DONE')

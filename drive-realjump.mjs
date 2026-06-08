import { chromium } from 'playwright'
const URL = 'http://localhost:5210/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('PAGEERR:', e.message))
await page.goto(URL, { waitUntil: 'load' }); await sleep(3500)
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/play|start match/i.test(x.textContent||'')); if(b) b.click() })
const press=(c,k)=>page.evaluate(({c,k})=>document.dispatchEvent(new KeyboardEvent('keydown',{code:c,key:k,bubbles:true})),{c,k})
const rel=(c,k)=>page.evaluate(({c,k})=>document.dispatchEvent(new KeyboardEvent('keyup',{code:c,key:k,bubbles:true})),{c,k})
// wait for landing (poll until grounded)
await sleep(1500)
for (let i=0;i<30;i++){ const d=await page.evaluate(()=>window.__dbg); if(d&&d.grounded) break; await sleep(150) }
await press('KeyV','v'); await sleep(60); await rel('KeyV','v'); await sleep(700)
console.log('pre-jump:', await page.evaluate(()=>window.__dbg))
await page.screenshot({ path: '/tmp/rj-ground.png' })
// real jump
await press('Space',' '); await sleep(50); await rel('Space',' ')
let shot=0
for (let i=0;i<25;i++){ const d=await page.evaluate(()=>window.__dbg); if(d&&!d.grounded&&d.vy>0&&shot<3){ await page.screenshot({path:`/tmp/rj-rise${shot}.png`}); shot++ } await sleep(25) }
console.log('captured rise shots:', shot)
await browser.close(); console.log('DONE')

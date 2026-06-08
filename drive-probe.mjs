import { chromium } from 'playwright'
const URL = 'http://localhost:5210/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('PAGEERR:', e.message))
await page.goto(URL, { waitUntil: 'load' }); await sleep(3500)
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/play|start match/i.test(x.textContent||'')); if(b) b.click() })
await sleep(4000)
const press=(c,k)=>page.evaluate(({c,k})=>document.dispatchEvent(new KeyboardEvent('keydown',{code:c,key:k,bubbles:true})),{c,k})
const rel=(c,k)=>page.evaluate(({c,k})=>document.dispatchEvent(new KeyboardEvent('keyup',{code:c,key:k,bubbles:true})),{c,k})
await press('KeyV','v'); await sleep(60); await rel('KeyV','v'); await sleep(800)
console.log('grounded baseline:', await page.evaluate(()=>window.__dbg))
// jump and sample loco state rapidly for ~1.2s
await press('Space',' '); await sleep(50); await rel('Space',' ')
const samples = []
for (let i=0;i<40;i++){ samples.push(await page.evaluate(()=>window.__dbg)); await sleep(30) }
const air = samples.filter(s=>s && !s.grounded)
console.log('airborne frames:', air.length)
console.log('loco states while airborne:', [...new Set(air.map(s=>s.loco))])
console.log('sample vy peaks:', air.slice(0,6).map(s=>s.vy?.toFixed(2)))
await browser.close(); console.log('DONE')

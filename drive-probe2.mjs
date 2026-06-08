import { chromium } from 'playwright'
const URL = 'http://localhost:5210/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('PAGEERR:', e.message))
await page.goto(URL, { waitUntil: 'load' }); await sleep(3500)
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>/play|start match/i.test(x.textContent||'')); if(b) b.click() })
// sample for 6 seconds after spawn, no input
for (let i=0;i<12;i++){ await sleep(500); const d=await page.evaluate(()=>window.__dbg); console.log(`t=${(i+1)*0.5}s`, d) }
await browser.close(); console.log('DONE')

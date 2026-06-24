import { chromium } from 'playwright'
async function diag(url, tag){
  const b = await chromium.launch()
  const p = await (await b.newContext({viewport:{width:1280,height:800}})).newPage()
  await p.goto(url,{waitUntil:'domcontentloaded',timeout:90000})
  await p.waitForSelector('#bubblesSVG',{timeout:60000})
  await p.waitForSelector('.toggle-about',{timeout:60000})
  await p.waitForTimeout(1200)
  await p.locator('.toggle-about').first().click()
  await p.waitForTimeout(700)
  const d = await p.evaluate(()=>{
    const h = document.querySelector('.smartervote-modal-header')
    const m = document.querySelector('#smartervote-modal')
    const hr=h.getBoundingClientRect(), mr=m.getBoundingClientRect()
    const cs = getComputedStyle(h)
    return {
      innerWidth: window.innerWidth,
      docClientWidth: document.documentElement.clientWidth,
      bodyClientWidth: document.body.clientWidth,
      header:{left:Math.round(hr.left),right:Math.round(hr.right),width:Math.round(hr.width)},
      headerCS:{position:cs.position,left:cs.left,right:cs.right,width:cs.width,marginLeft:cs.marginLeft},
      modal:{left:Math.round(mr.left),right:Math.round(mr.right),width:Math.round(mr.width)},
      modalPos: getComputedStyle(m).position,
      smartervotePos: (()=>{const s=document.querySelector('#smartervote'); return s?getComputedStyle(s).position:'none'})(),
    }
  })
  console.log(`[${tag}]`, JSON.stringify(d,null,2))
  await b.close()
}
await diag(process.argv[2], process.argv[3])

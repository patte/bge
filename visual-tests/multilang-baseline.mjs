import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { extractQuestions } from './lib.mjs'
const NEW = JSON.parse(readFileSync('new/state.json','utf8')).questions
const b = await chromium.launch()
const p = await (await b.newContext({viewport:{width:1280,height:800}})).newPage()
await p.goto('http://localhost:4190/', { waitUntil:'domcontentloaded', timeout:60000 })
await p.waitForSelector('#bubblesSVG',{timeout:45000}); await p.waitForSelector('.max',{timeout:45000})
const got = {}
for (const lg of ['de','fr','it']){
  await p.evaluate((l)=>{ try{ if(window.I18NConf) I18NConf.setLanguage(l); else if(window.TAPi18n) TAPi18n.setLanguage(l) }catch(e){} }, lg)
  // wait until the client has this language's fields loaded
  await p.waitForFunction((l)=>{
    if(!window.Questions) return false
    const q = window.Questions.findOne({index:0})
    return q && q.languages && q.languages[l] && q.languages[l].label
  }, lg, { timeout: 20000 }).catch(()=>{})
  await p.waitForTimeout(1500)
  got[lg] = await extractQuestions(p)
}
await b.close()
let diffs=0, checks=0
for (const lg of ['de','fr','it']){
  const arr = got[lg]
  if(!arr){ console.log(lg,'NOT captured'); continue }
  for(let i=0;i<arr.length;i++){
    const bl=(arr[i].languages[lg])||{}, nl=(NEW[i].languages[lg])||{}
    for(const k of ['label','minLabel','maxLabel','info']){
      checks++
      if(JSON.stringify(bl[k])!==JSON.stringify(nl[k])){ diffs++
        const bs=bl[k]==null?'<null>':String(bl[k]), ns=nl[k]==null?'<null>':String(nl[k])
        let di=0; while(di<bs.length&&di<ns.length&&bs[di]===ns[di])di++
        console.log(`DIFF q${i}.${lg}.${k} @${di}: base=${JSON.stringify(bs.slice(Math.max(0,di-10),di+15))} new=${JSON.stringify(ns.slice(Math.max(0,di-10),di+15))}`)
      }
    }
  }
}
console.log(`\nmultilingual question check: ${checks-diffs}/${checks} fields match (${diffs} diffs)`)

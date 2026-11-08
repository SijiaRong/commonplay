import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { plan } from './bubble-city-shots.mjs';

const base=process.argv[2] || 'http://127.0.0.1:8771/';
const frames=process.argv[3];
if(!frames) throw Error('Pass the game URL and a destination directory for JPEG frames.');
const director=await readFile(new URL('./bubble-city-director.js',import.meta.url),'utf8');
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal']});
const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
page.on('pageerror',e=>console.error(e));
page.on('console',message=>{
  if(message.text().startsWith('District '))console.log(message.text());
});
const cdp=await page.context().newCDPSession(page);
function replace(source,needle,value) {
  if(!source.includes(needle))throw Error('Game capture hook missing: '+needle);
  return source.replace(needle,value);
}
await page.route(/\/(solo\/play|slide\/ride|game)\.js(?:\?|$)/,async route=>{
  const response=await route.fetch();
  let src=await response.text();
  if(route.request().url().includes('/solo/play.js')) {
    src=replace(src,"import {openAuthority} from './transport.js';","import {SoloSession} from './backend.js';\nconst openAuthority=()=>({postMessage(){},terminate(){}});");
    src=replace(src,'film.setFrameBudget(1/60,racing);','film.setFrameBudget(1/30,false);');
    src=replace(src,'updateAcrylicBackdrop(course.mats.acrylic,film);','window.applyShotCamera?.(); updateAcrylicBackdrop(course.mats.acrylic,film);');
    src=replace(src,'renderer.setAnimationLoop(now=>{const dt=Math.min(.08,(now-last)/1000);last=now;draw(dt,now)});',director);
  } else {
    // The normal game loops still run controls, animation mixers and rendering.
    src=src.replace("film.setFrameBudget(1/60,mode==='riding');",'film.setFrameBudget(1/30,false);');
    src=replace(src,'renderer.setAnimationLoop(()=>{','window.frameStep=()=>{');
    src=src.replace(/const dt=Math.min\(clock.getDelta\(\),\.[\d]+\);/,'const dt=1/30;');
    src=replace(src,'\n  });\n}', '\n  };\n}');
  }
  await route.fulfill({response,body:src});
});
const selected=process.env.SHOTS ? new Set(process.env.SHOTS.split(',').map(Number)) : null;
const first=Number(process.env.FIRST_SHOT||1), last=Number(process.env.LAST_SHOT||32);
try {
  await mkdir(frames,{recursive:true});
  await page.goto(new URL('?seed=20261108',base).href);
  await page.waitForFunction(()=>!!window.prepareScene);
  for(const [index,shot] of plan.entries()) {
    const id=index+1, kind=shot[1];
    if(id>last)break;
    // Ready, picker, countdown and launch share one continuous session.
    const record=id>=first && (!selected || selected.has(id));
    if(!record && id>4)continue;
    if(kind==='classic'||kind==='practice') {
      await page.goto(new URL(kind==='classic'?'?mode=yard':'practice.html',base).href);
      await page.waitForFunction(()=>!!window.frameStep);
      if(kind==='classic')await page.locator('#go').evaluate(el=>el.click());
      else await page.keyboard.down('d');
    } else {
      if(kind==='picker')await page.locator('#choose-character').evaluate(el=>el.click());
      if(kind==='start')await page.locator('#close-character-picker').evaluate(el=>el.click());
      if(typeof kind==='number' && !(await page.locator('#promo-clean').count())){
        const css=await page.addStyleTag({content:'body > :not(#world):not(script):not(style){visibility:hidden!important}'});
        await css.evaluate(el=>el.id='promo-clean');
      }
      await page.evaluate(s=>window.prepareScene(s),shot);
    }
    for(let f=0;f<(id===32?60:90);f++) {
      if(kind==='practice'&&f===15)await page.keyboard.press('Space');
      await page.evaluate(f=>window.frameStep(f),f);
      if(!record)continue;
      const {data}=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:91});
      await writeFile(path.join(frames,String(index*90+f).padStart(4,'0')+'.jpg'),Buffer.from(data,'base64'));
    }
    console.log(id,shot[0]);
  }
} finally {await browser.close();}

import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

// The HTTP root must include both games so CityPartyShow can import the shared party rules.
const url=process.argv[2],out=process.argv[3];
if(!url || !out)throw Error('Pass the Bubble City game URL and frame output directory.');
const shots=['摩天轮','土星地标','玻璃穹顶馆','弧面商店','星港总站'].map((landmark,i)=>({stage:i+1,landmark,frames:90}));
const race=[
  [1,2,.12,.60],[1,24,2.85,.56],[1,54,-.62,.51],[1,76,3.02,1.05],[1,143,-.24,.42],
  [2,15,-.23,.63],[2,37,2.96,.54,true],[2,156,-.6,.52],[2,475,3.12,1.15],[2,503,-.28,.7],
  [3,13,2.9,.68],[3,36,2.86,.47,true],[3,173,-.26,.44],[3,269,2.64,.76],
  [4,13,-.3,.36],[4,119,2.92,.60,true],[4,264,-.45,.64,false,true],
  [5,33,.24,.86,true,true],[5,442,-.48,.75,true,true],[5,'finish',3.15,.32]
];
shots.push(...race.map(([stage,s,bearing,lift,jump,slow])=>({stage,s,bearing,lift,jump,slow,zoom:1,frames:120})));
const first=Number(process.env.FIRST_SHOT||1),last=Number(process.env.LAST_SHOT||shots.length);
const preview=process.env.PREVIEW==='1';
const selected=process.env.SHOTS?.split(',').map(Number);
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal']});
try {
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  const script=await readFile(new URL('./bubble-city-four-race.js',import.meta.url),'utf8');
  await page.route(/\/slide\/ride\.js(?:\?|$)/,r=>r.fulfill({contentType:'text/javascript',body:script}));
  await page.goto(url);
  await page.addStyleTag({content:'body > :not(#world){display:none!important}#world{display:block!important}'});
  await page.waitForFunction(()=>window.raceCapture||window.captureError,{},{timeout:90000});
  const error=await page.evaluate(()=>window.captureError);if(error)throw Error(error);
  const cdp=await page.context().newCDPSession(page);
  await mkdir(out,{recursive:true});
  let base=0;
  for(const [i,shot] of shots.entries()){
    if(i+1>=first && i+1<=last && (!selected || selected.includes(i+1))){
      await page.evaluate(s=>window.raceCapture.begin(s),shot);
      let allFour=0;
      for(let f=0;f<shot.frames;f++){
        const capture=!preview||[0,Math.floor(shot.frames/2),shot.frames-1].includes(f);
        const {active}=await page.evaluate(([n,draw])=>window.raceCapture.draw(n,draw),[f,capture]);
        if(active===4)allFour++;
        if(capture){
          const {data}=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:91});
          await writeFile(path.join(out,String(base+f).padStart(4,'0')+'.jpg'),Buffer.from(data,'base64'));
        }
      }
      console.log('Shot',i+1,'stage',shot.stage,shot.landmark||shot.s,'four active',allFour);
    }
    base+=shot.frames;
  }
} finally { await browser.close(); }

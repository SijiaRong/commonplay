import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';

// The HTTP root must include both games so CityPartyShow can import the shared party rules.
const url=process.argv[2],out=process.argv[3];
if(!url || !out)throw Error('Pass the Bubble City game URL and frame output directory.');
let shots=['摩天轮','土星地标','玻璃穹顶馆','弧面商店','星港总站'].map((landmark,i)=>({stage:i+1,landmark,frames:90}));
const race=[
  [1,2,.12,.60],[1,24,2.85,.56],[1,54,-.62,.51],[1,76,3.02,1.05],[1,143,-.24,.42],
  [2,15,-.23,.63],[2,37,2.96,.54,true],[2,156,-.6,.52],[2,475,3.12,1.15],[2,503,-.28,.7],
  [3,13,2.9,.68],[3,36,2.86,.47,true],[3,173,-.26,.44],[3,269,2.64,.76],
  [4,13,-.3,.36],[4,119,2.92,.60,true],[4,264,-.45,.64,false,true],
  [5,33,.24,.86,true,true],[5,442,-.48,.75,true,true],[5,'finish',3.15,.32]
];
shots.push(...race.map(([stage,s,bearing,lift,jump,slow])=>({stage,s,bearing,lift,jump,slow,zoom:1,frames:120})));
const teaser=process.argv.includes('--teaser');
const short=teaser || process.argv.includes('--short');
if(short) {
  const cut=(id,frames)=>({...shots[id-1],frames});
  const cannon={stage:3,s:203,cannon:true,slow:true,frames:180,bearing:0,lift:.5,zoom:1};
  if(teaser) {
    shots=[
      ...[1,2,3,4,5].map(id=>cut(id,60)),
      cut(6,60),cut(10,60),cut(15,60),cannon,
      cut(19,60),cut(22,60),cut(23,60),cut(25,60)
    ].map(shot=>({...shot,teaser:true}));
  } else shots=[
    ...[1,2,3,4,5].map(id=>cut(id,60)),
    ...[6,8,10,12].map(id=>cut(id,75)),
    cannon,
    ...[19,20,22,23].map(id=>cut(id,75)),cut(25,120)
  ];
}
const first=Number(process.env.FIRST_SHOT||1),last=Number(process.env.LAST_SHOT||shots.length);
const preview=process.env.PREVIEW==='1';
const selected=process.env.SHOTS?.split(',').map(Number);
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal']});
try {
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  if(short)await page.addInitScript(()=>localStorage.setItem('bubblecity-appearance-v1',JSON.stringify({room:15})));
  const script=await readFile(new URL('./bubble-city-four-race.js',import.meta.url),'utf8');
  await page.route(/\/slide\/ride\.js(?:\?|$)/,r=>r.fulfill({contentType:'text/javascript',body:script}));
  await page.goto(url);
  await page.addStyleTag({content:'body > :not(#world){display:none!important}#world{display:block!important}'});
  if(short) {
    await page.evaluate(async()=>{
      const badge=document.createElement('div');
      badge.style.cssText='position:fixed;z-index:10000;left:40px;top:32px;display:flex;align-items:center;gap:10px;padding:5px 16px 5px 6px;border-radius:36px;background:rgba(20,35,32,.80);color:#fff8e8;font:650 25px/1 "PingFang SC",sans-serif;letter-spacing:1px;pointer-events:none';
      const logo=new Image(48,48);
      logo.src='./bubble-city-logo.png';
      await logo.decode();
      badge.append(logo,document.createTextNode('泡泡星港'));
      document.querySelector('#world').append(badge);
    });
  }
  if(teaser)await page.evaluate(async()=>{
    const {stageNames}=await import('./solo/course-labels.js');
    const title=document.createElement('div');
    title.style.cssText='position:fixed;z-index:10001;bottom:48px;left:42px;border-left:5px solid #a4e6d9;padding:10px 58px 10px 18px;color:#fff9e8;background:linear-gradient(90deg,rgba(17,31,30,.90),rgba(17,31,30,.76) 68%,transparent);font-family:"PingFang SC",sans-serif;text-shadow:0 1px 3px #182321';
    const number=document.createElement('div'),name=document.createElement('div');
    number.style.cssText='font-weight:600;font-size:18px;letter-spacing:3px;color:#bcece0';
    name.style.cssText='font-weight:700;font-size:41px;letter-spacing:2px;line-height:1.35';
    title.append(number,name);document.querySelector('#world').append(title);
    window.showCourseTitle=stage=>{
      title.hidden=!stage;
      if(stage){number.textContent='第 '+stage+' 关';name.textContent=stageNames[stage-1];}
    };
  });
  await page.waitForFunction(()=>window.raceCapture||window.captureError,{},{timeout:90000});
  const error=await page.evaluate(()=>window.captureError);if(error)throw Error(error);
  const lighting=await page.evaluate(()=>window.raceCapture.lighting);
  if(short && (lighting.room!==15 || lighting.background!==.15))throw Error('Unexpected scene brightness');
  console.log('Game lighting',lighting);
  const cdp=await page.context().newCDPSession(page);
  await mkdir(out,{recursive:true});
  let base=0;
  for(const [i,shot] of shots.entries()){
    if(i+1>=first && i+1<=last && (!selected || selected.includes(i+1))){
      await page.evaluate(s=>{window.showCourseTitle?.(s.landmark?s.stage:null);window.raceCapture.begin(s);},shot);
      let allFour=0;
      for(let f=0;f<shot.frames;f++){
        const capture=!preview||[0,Math.floor(shot.frames/2),shot.frames-1].includes(f);
        const {active,muzzleExit}=await page.evaluate(([n,draw])=>window.raceCapture.draw(n,draw),[f,capture]);
        if(muzzleExit) {
          const event={frame:base+f,fps:30};
          await writeFile(path.join(out,'muzzle-exit.json'),JSON.stringify(event)+'\n');
          console.log('Muzzle exit',event);
        }
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

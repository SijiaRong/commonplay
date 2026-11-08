import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const out = fileURLToPath(new URL('../bubble-city/', import.meta.url));
const base = process.argv[2] || 'http://127.0.0.1:8771/';
const seed = 20261108;
// Stage, course piece, position within the piece, camera offset (right, up, forward).
const plan = [
  ['欢迎来到泡泡星城','ready'], ['挑选参赛伙伴','picker'], ['起跑倒数','start'],
  ['冲出起跑门','race'], ['玩具门廊全景',1],
  ['第一道移门',1,'firstDoors',.46,7,5,-13], ['积木绕桩',1,'slalomDeck',.46,13,9,12],
  ['树脂滑梯',1,'shortSlide',.52,15,12,-16], ['钟摆锤廊',1,'hammerDeck',.48,6,6,-12],
  ['波浪地板',1,'tileDeck',.5,12,9,-14], ['回旋滑梯',1,'curvedSlide',.5,23,21,8],
  ['终点门廊',1,'finishDoors',.68,5,5,-13],
  ['蜡笔峡谷全景',2], ['腾空跳台',2,'bigAir',.68,14,9,12],
  ['岔路交会',2,'fork',.55,4,19,-18], ['陡降滑槽',2,'plunge'],
  ['土星弯入口',2,'saturnSlide',.12,11,9,-20], ['土星回旋俯瞰',2,'saturnSlide',.54,9,43,9],
  ['出弯检查线',2,'saturnSlide',.98,2,14,-18],
  ['枕头山口全景',3], ['摆锤阵',3,'hammers',.5,12,6,-11],
  ['旋转杆',3,'spinners',.5,5,14,-13], ['旋涡入口',3,'whirlpool',.5,7,21,9],
  ['地毯回旋全景',4], ['滚筒阵',4,'rollers',.5,11,8,10], ['断崖边缘',4,'cliff',.5,15,9,-12],
  ['玩具箱决赛全景',5], ['跳房子',5,'hopscotch',.48,7,13,-12],
  ['大跳台',5,'megaJump'], ['琴键路段',5,'keys',.5,11,7,-11],
  ['经典滑梯','classic'], ['回到角色练习场','practice']
];

const browser = await chromium.launch({channel: process.env.CHROME_CHANNEL || 'chrome',
  args:['--use-angle=metal','--disable-dev-shm-usage']});
const page = await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
page.setDefaultTimeout(90000);
page.on('pageerror', error=>console.error(error.message));
// Add a camera only to the capture browser's copy of the live game editor.
await page.route('**/editor/scene.js', async route=>{
  const response=await route.fetch();
  const marker="choose(groups[0].entries[0]);sectionView();";
  const source=await response.text();
  if (!source.includes(marker)) throw Error('Editor camera initialization changed');
  const cameraHook = `
    window.composeShot = function(name,fraction,side,height,along) {
      setScope(false); outline.visible=false; fittedSection=false;
      if(!name) {
        yaw=.65; pitch=.88;
        const p=stage.path, bounds=new T.Box3(), points=[];
        for(let i=0;i<p.n;i++) {
          const point=new T.Vector3(p.x[i],p.y[i],p.z[i]);
          points.push(point); bounds.expandByPoint(point);
        }
        bounds.getCenter(focus);
        const back=new T.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
        const right=new T.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
        const up=new T.Vector3().crossVectors(back,right);
        const halfHeight=Math.tan(T.MathUtils.degToRad(camera.fov/2));
        distance=Math.max(...points.map(point=>{
          const d=point.sub(focus);
          return d.dot(back)+Math.max((Math.abs(d.dot(up))+9)/halfHeight,
            (Math.abs(d.dot(right))+9)/(halfHeight*camera.aspect));
        }));
        draw(); return;
      }
      const piece=stage.pieces.find(p=>p.name===name);
      if(fraction===undefined) {
        const group=groups.find(group=>group.piece===piece);
        choose(group.entries[0]); yaw=.85; pitch=.64; sectionView(); return;
      }
      const s=piece.s0+fraction*(piece.s1-piece.s0), p=stage.path;
      let i=0;
      for(let j=1;j<p.n;j++) if(Math.abs(p.s[j]-s)<Math.abs(p.s[i]-s)) i=j;
      focus.set(p.x[i],p.y[i]+1,p.z[i]);
      const dx=p.tz[i]*side+p.tx[i]*along,dz=-p.tx[i]*side+p.tz[i]*along;
      distance=Math.hypot(dx,height,dz); yaw=Math.atan2(dx,dz); pitch=Math.asin(height/distance); draw();
    };
  `;
  await route.fulfill({response,body:source.replace(marker,marker+cameraHook)});
});
async function visit(suffix) {
  await page.goto(new URL(suffix,base).href,{waitUntil:'domcontentloaded'});
}
async function settle() {
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(done)))));
}
const figures=[];
try {
  await mkdir(path.join(out,'shots'),{recursive:true});
  let stage=0;
  for (const [index,[label,scene,...camera]] of plan.entries()) {
    if (typeof scene==='number') {
      if(stage!==scene) {
        await visit('editor/?seed='+seed+'&stage='+scene);
        await page.waitForFunction(()=>typeof window.composeShot==='function');
        await page.addStyleTag({content:'body{display:block}main{width:100vw;height:100vh}aside,header,#views,#loading{display:none}'});
        await settle();
        stage=scene;
      }
      await page.evaluate(args=>window.composeShot(...args),camera);
    } else if (scene==='race') {
      await page.waitForSelector('#gate-countdown[hidden]',{state:'attached'});
      await page.keyboard.down('w'); await page.waitForTimeout(1400); await page.keyboard.up('w');
    } else if (scene==='picker') {
      await page.click('#choose-character'); await page.waitForSelector('dialog[open]');
    } else if (scene==='start') {
      await page.click('#close-character-picker'); await page.click('#go');
      await page.waitForSelector('#gate-countdown:not([hidden])');
    } else {
      await visit(scene==='practice'?'practice.html':scene==='classic'?'?mode=yard':'?seed='+seed);
      await page.waitForSelector(scene==='practice'?'#choose-character:enabled':'#go:enabled');
    }
    await settle();
    const id=String(index+1).padStart(2,'0');
    await page.screenshot({path:path.join(out,'shots',id+'.jpg'),quality:90,timeout:90000});
    figures.push('<figure><a href="shots/'+id+'.jpg"><img src="shots/'+id+'.jpg" alt="'+label+'"></a><figcaption>'+id+' · '+label+'</figcaption></figure>');
    console.log(id,label);
  }
  await writeFile(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>泡泡星城 · 宣传片分镜</title><style>*{box-sizing:border-box}body{background:#182828;color:#f6f1df;font:16px system-ui;margin:4vw}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px}figure{margin:0}img{width:100%;display:block;border-radius:6px}figcaption{margin:.55em 0}</style><h1>泡泡星城 · 宣传片分镜</h1><p>32 镜　·　实机界面与赛道取景　·　种子 20261108</p><main>${figures.join('\n')}</main></html>`);
  await page.setViewportSize({width:1280,height:800});
  await page.goto(pathToFileURL(path.join(out,'index.html')).href);
  await page.addStyleTag({content:'body{margin:22px}main{grid-template-columns:repeat(4,1fr);gap:12px}figcaption{font-size:14px}'});
  await page.screenshot({path:path.join(out,'contact-sheet.jpg'),fullPage:true,quality:88});
} finally { await browser.close(); }

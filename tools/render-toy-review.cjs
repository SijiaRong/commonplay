const path=require('node:path'),fs=require('node:fs');
let playwright;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright-core',path.resolve(__dirname,'../../rea/node_modules/playwright-core')].filter(Boolean)){try{playwright=require(candidate);break}catch{}}
if(!playwright)throw Error('Set PLAYWRIGHT_MODULE');
const [model,output,pose,time]=process.argv.slice(2);
if(!model||!output)throw Error('Usage: node tools/render-toy-review.cjs /assets/model.glb output.png [Slide 0.8]');
(async()=>{
 const browser=await playwright.chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.REVIEW_URL||'http://127.0.0.1:55644';
  await page.goto(base+'/tools/toy-model-review.html?model='+encodeURIComponent(model));
  await page.waitForFunction(()=>window.review?.ready||window.review?.error,null,{timeout:90000});
  const status=await page.evaluate(()=>({ready:window.review.ready,error:window.review.error,animations:window.review.animations,bounds:window.review.bounds}));
  if(!status.ready)throw Error(status.error);
  if(process.env.TWO_SIDED==='1')await page.evaluate(()=>window.review.twoSided());
  if(pose)await page.evaluate(([p,t])=>window.review.pose(p,t),[pose,Number(time)||0]);
  if(errors.length)throw Error(errors.join('\n'));
  fs.mkdirSync(path.dirname(output),{recursive:true});await page.screenshot({path:output});
  if(!pose){
   await page.locator('#labels').evaluate(e=>e.style.display='none');await page.locator('#status').evaluate(e=>e.style.display='none');
   await page.screenshot({path:output.replace(/\.png$/,'.portrait.jpg'),type:'jpeg',quality:90,clip:{x:0,y:0,width:800,height:500}});
  }
  console.log(JSON.stringify({model,output,...status}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

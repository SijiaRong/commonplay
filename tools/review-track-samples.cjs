// Run a local visual review and structural audit of the three original Hi3D samples.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),assetRoot=path.join(root,'assets/track-redesign-validation');
let playwright;for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright-core',path.resolve(root,'../rea/node_modules/playwright-core')].filter(Boolean)){try{playwright=require(candidate);break}catch{}}
if(!playwright)throw Error('Set PLAYWRIGHT_MODULE');
const mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const all=[];
const keys=process.argv.slice(2);
for(const key of (keys.length?keys:['slalom','hammers','loop'])){
 const input=path.join(assetRoot,key+'-raw.glb'),structural=JSON.parse(cp.execFileSync(process.execPath,[path.join(__dirname,'check-track-sample.cjs'),input],{encoding:'utf8',maxBuffer:4e6}));
 const browser=await playwright.chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:2400,height:1800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/tools/track-sample-review.html?model=/assets/track-redesign-validation/${key}-raw.glb`);
 await page.waitForFunction(()=>window.review?.ready||window.review?.error,null,{timeout:120000});const visual=await page.evaluate(()=>window.review);if(visual.error)throw Error(visual.error);if(errors.length)throw Error(errors.join('\n'));
 await page.screenshot({path:path.join(assetRoot,key+'-review.jpg'),type:'jpeg',quality:94});const report={key,...structural,browser:visual};fs.writeFileSync(path.join(assetRoot,key+'-audit.json'),JSON.stringify(report,null,2)+'\n');all.push(report);console.log(JSON.stringify({key,triangles:report.triangles,meshes:report.meshes,bounds:visual.initialBounds,textures:visual.textureDimensions}));
 }finally{await browser.close();}
}
const reports=['slalom','hammers','loop'].map(k=>path.join(assetRoot,k+'-audit.json')).filter(f=>fs.existsSync(f)).map(f=>JSON.parse(fs.readFileSync(f)));
fs.writeFileSync(path.join(assetRoot,'audit-summary.json'),JSON.stringify(reports,null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());

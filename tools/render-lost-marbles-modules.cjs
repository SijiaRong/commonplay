// Render research views using the locally acquired original modules and textures.
// Usage: node tools/render-lost-marbles-modules.cjs
// PLAYWRIGHT_MODULE may point at an installed playwright or playwright-core package.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, '.local/lost-marbles/public');
const output = path.join(root, 'assets/lost-marbles/modules');
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', path.resolve(root, '../rea/node_modules/playwright-core')].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch {}
}
if (!playwright) throw new Error('Install playwright-core or set PLAYWRIGHT_MODULE to its absolute path.');
const types = {'.html':'text/html', '.js':'text/javascript', '.jpg':'image/jpeg', '.png':'image/png', '.hdr':'application/octet-stream', '.json':'application/json'};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (pathname === '/shared/course-research.js') {
    const source=fs.readFileSync(path.join(publicRoot,'shared/course.js'),'utf8');
    res.writeHead(200, {'Content-Type':'text/javascript'});
    res.end(source+'\nexport {StageBuilder,PIECES,addPiece};\n'); return;
  }
  const authored = {'/render-modules.html':'lost-marbles-modules.html','/module-catalog.json':'lost-marbles-module-catalog.json'};
  const target = authored[pathname] ? path.join(__dirname,authored[pathname]) : path.resolve(publicRoot, '.' + decodeURIComponent(pathname));
  if (!authored[pathname] && !target.startsWith(publicRoot + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(target, (error, bytes) => {
    if (error) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(target)] || 'application/octet-stream'}); res.end(bytes);
  });
});
(async () => {
  if (!fs.existsSync(path.join(publicRoot, 'shared/course.js'))) throw new Error('Original runtime required in .local/lost-marbles/public; see assets/lost-marbles/README.md.');
  fs.mkdirSync(output, {recursive:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const launch = {headless:true};
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(chrome)) launch.executablePath = chrome;
  const browser = await playwright.chromium.launch(launch);
  const errors = [], records = [];
  try {
    const page = await browser.newPage({viewport:{width:4096,height:3072},deviceScaleFactor:1});
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/render-modules.html`);
    await page.waitForFunction(() => window.ready, {timeout:120000});
    const catalog=await page.evaluate(()=>window.moduleCatalog), previews=[];
    for (let i=0; i<catalog.length; i++) {
      const record=await page.evaluate(i=>window.renderModule(i),i);
      const filename=`${String(i+1).padStart(2,'0')}-${record.id}.jpg`;
      await page.locator('#output').screenshot({path:path.join(output,filename),type:'jpeg',quality:96,timeout:60000});
      previews.push({label:record.label,id:record.id,thumbnail:record.thumbnail});delete record.thumbnail;
      records.push({...record,file:filename});console.log(`Rendered ${filename} (${record.colliders} colliders)`);
    }
    await page.evaluate(images=>window.makeContact(images),previews);
    await page.setViewportSize({width:2400,height:150+Math.ceil(catalog.length/4)*520});
    await page.locator('#output').screenshot({path:path.join(output,'contact-sheet.jpg'),type:'jpeg',quality:94,timeout:60000});
    if (errors.length) throw new Error(errors.join('\n'));
    const sha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(publicRoot,'shared/course.js'))).digest('hex');
    fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({seed:20261108,laneWidth:16,stageIndex:2,slope:.082,poseSeconds:2,sourceSHA256:sha256,images:records},null,2)+'\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => server.close());

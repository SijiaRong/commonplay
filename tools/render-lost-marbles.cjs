// Render research views using the locally acquired original modules and textures.
// Usage: node tools/render-lost-marbles.cjs
// PLAYWRIGHT_MODULE may point at an installed playwright or playwright-core package.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, '.local/lost-marbles/public');
const output = path.join(root, 'assets/lost-marbles');
let playwright;
for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', path.resolve(root, '../rea/node_modules/playwright-core')].filter(Boolean)) {
  try { playwright = require(candidate); break; } catch {}
}
if (!playwright) throw new Error('Install playwright-core or set PLAYWRIGHT_MODULE to its absolute path.');
const types = {'.html':'text/html', '.js':'text/javascript', '.jpg':'image/jpeg', '.png':'image/png', '.hdr':'application/octet-stream'};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const target = pathname === '/render-gallery.html' ? path.join(__dirname, 'lost-marbles-gallery.html') : path.resolve(publicRoot, '.' + decodeURIComponent(pathname));
  if (pathname !== '/render-gallery.html' && !target.startsWith(publicRoot + path.sep)) { res.writeHead(403); res.end(); return; }
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
    const page = await browser.newPage({viewport:{width:3200,height:4000},deviceScaleFactor:1});
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/render-gallery.html?bg=4k`);
    await page.waitForFunction(() => window.ready, {timeout:120000});
    for (let i=0; i<5; i++) {
      for (const [n,kind] of ['top','overview','details'].entries()) {
        const filename = `stage-${i+1}-${n+1}-${kind}.jpg`;
        const record = await page.evaluate(([stage,kind]) => window.galleryShot(stage,kind), [i,kind]);
        await page.locator('#output').screenshot({path:path.join(output,filename),type:'jpeg',quality:96,timeout:60000});
        records.push({...record,file:filename});
        console.log(`Rendered ${filename}`);
      }
    }
    if (errors.length) throw new Error(errors.join('\n'));
    fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({seed:20261108,poseSeconds:2,images:records},null,2)+'\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => server.close());

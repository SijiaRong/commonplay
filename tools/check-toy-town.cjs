// UI/loader regression checks. Extra selectable riders below are test fixtures
// reusing the checked-in teddy, never substitutes for Hi3D character assets.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let playwright;
for(const candidate of [process.env.PLAYWRIGHT_MODULE,'playwright-core',path.resolve(__dirname,'../../rea/node_modules/playwright-core')].filter(Boolean)){
  try{playwright=require(candidate);break}catch{}
}
if(!playwright)throw Error('Set PLAYWRIGHT_MODULE to playwright-core');
const base=process.env.DEMO_URL||'http://127.0.0.1:8080';
const shipped=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../teddy-playground/dist/slide/characters.json')));
const output=path.resolve(__dirname,'../.local/toy-town-check');
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const browser=await playwright.chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:760}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
    await page.locator('#go:not([disabled])').waitFor({timeout:90000});
    await page.click('#choose-character');
    assert.equal(await page.locator('.character-card').count(),shipped.characters.length);
    assert.equal(await page.locator('.character-card:disabled').count(),shipped.characters.filter(c=>!c.ready).length);
    await page.waitForFunction(()=>[...document.querySelectorAll('.character-card img')].every(i=>i.complete&&i.naturalWidth>0));
    await page.screenshot({path:path.join(output,'picker-desktop.png')});
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#section').innerText(),'起点站台');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#character-picker').evaluate(e=>e.open),false);
    // Check transitions at the supported dt limit. Skip expensive post passes
    // during this state-machine check; restore them for the finish screenshot.
    await page.evaluate(async()=>{
      const T=await import('./slide/film/three.module.js');
      const {Scene3D}=await import('./slide/film/scene.js');
      const original=Scene3D.prototype.render;
      window.restoreTestRender=()=>{Scene3D.prototype.render=original};
      Scene3D.prototype.render=()=>{};T.Clock.prototype.getDelta=()=>.08;
    });
    await page.click('#go');
    await page.waitForFunction(()=>['木板起滑坡','彩条半管'].includes(document.querySelector('#section').textContent));
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>document.querySelector('#section').textContent==='抵达终点',null,{timeout:90000});
    await page.evaluate(()=>window.restoreTestRender());
    await page.screenshot({path:path.join(output,'teddy-finish.png')});
    await page.click('#reset');
    assert.equal(await page.locator('#percent').innerText(),'0%');
    assert.deepEqual(errors,[]);
    console.log('Default catalog, dialog keyboard, slide/finish/reset: passed');
    for(const definition of shipped.characters.filter(c=>c.ready&&c.id!=='teddy')){
      await page.click('#choose-character');await page.click('[data-character="'+definition.id+'"]');
      await page.waitForFunction(()=>!document.querySelector('#character-picker').open,null,{timeout:60000});
      assert.equal(await page.locator('#character-name').innerText(),definition.name);
      await page.screenshot({path:path.join(output,definition.id+'-ready.png')});
      await page.evaluate(async()=>{
        const T=await import('./slide/film/three.module.js'),{Scene3D}=await import('./slide/film/scene.js');
        const render=Scene3D.prototype.render;window.restoreTestRender=()=>Scene3D.prototype.render=render;
        Scene3D.prototype.render=()=>{};T.Clock.prototype.getDelta=()=>.08;window.playedActions=[];
        if(!T.AnimationAction.prototype.testRecorded){
          const play=T.AnimationAction.prototype.play;
          T.AnimationAction.prototype.play=function(){window.playedActions.push(this.getClip().name);return play.call(this)};
          T.AnimationAction.prototype.testRecorded=true;
        }
      });
      await page.click('#go');
      await page.waitForFunction(()=>['木板起滑坡','彩条半管'].includes(document.querySelector('#section').textContent));
      await page.keyboard.press('Space');await page.keyboard.down('KeyD');await page.waitForTimeout(120);await page.keyboard.up('KeyD');
      await page.waitForFunction(()=>document.querySelector('#section').textContent==='抵达终点',null,{timeout:90000});
      assert((await page.evaluate(()=>window.playedActions)).includes('Jump'),definition.id+' jump action did not play');
      await page.evaluate(()=>window.restoreTestRender());
      await page.screenshot({path:path.join(output,definition.id+'-finish.png')});
      await page.click('#reset');assert.equal(await page.locator('#percent').innerText(),'0%');
      console.log(definition.id+' actual model: load/switch, run, sit, slide, jump, turn, finish, reset passed');
    }
    assert.deepEqual(errors,[]);
    await page.close();

    const fixture=await browser.newPage({viewport:{width:1000,height:760}});
    const catalog=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../teddy-playground/dist/slide/characters.json')));
    catalog.characters.push({...catalog.characters[0],id:'fixture',name:'切换测试角色'});
    catalog.characters.push({...catalog.characters[0],id:'broken',name:'加载失败测试',model:'./missing-test-rider.glb'});
    await fixture.route('**/slide/characters.json',r=>r.fulfill({json:catalog}));
    await fixture.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
    await fixture.locator('#go:not([disabled])').waitFor({timeout:90000});
    await fixture.click('#choose-character');
    await fixture.click('[data-character="fixture"]');
    await fixture.waitForFunction(()=>!document.querySelector('#character-picker').open);
    assert.equal(await fixture.locator('#character-name').innerText(),'切换测试角色');
    await fixture.reload({waitUntil:'domcontentloaded',timeout:90000});
    await fixture.locator('#go:not([disabled])').waitFor({timeout:90000});
    assert.equal(await fixture.locator('#character-name').innerText(),'切换测试角色');
    await fixture.click('#choose-character');
    await fixture.click('[data-character="broken"]');
    await fixture.waitForFunction(()=>document.querySelector('#character-status').textContent.includes('暂时没准备好'));
    assert.equal(await fixture.locator('#character-name').innerText(),'切换测试角色');
    await fixture.click('#close-character-picker');
    await fixture.click('#go');
    await fixture.waitForFunction(()=>document.querySelector('#launch').hidden);
    console.log('Switch, persisted selection, failed load retaining current rider: passed (teddy fixtures)');
    await fixture.close();

    const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await mobile.addInitScript(()=>localStorage.setItem('commonplay-rider','not-installed'));
    await mobile.goto(base,{waitUntil:'domcontentloaded',timeout:90000});
    await mobile.locator('#go:not([disabled])').waitFor({timeout:90000});
    assert.equal(await mobile.locator('#character-name').innerText(),'缝线小熊');
    await mobile.locator('#choose-character').tap();
    const box=await mobile.locator('#character-picker').boundingBox();
    assert(box.x>=0 && box.x+box.width<=391 && box.y>=0 && box.y+box.height<=845);
    await mobile.waitForFunction(()=>[...document.querySelectorAll('.character-card img')].every(i=>i.complete&&i.naturalWidth>0));
    await mobile.screenshot({path:path.join(output,'picker-mobile.png')});
    await mobile.locator('#close-character-picker').tap();
    await mobile.locator('#go').tap();
    await mobile.locator('[data-key="KeyD"]').tap();
    await mobile.locator('#reset').tap();
    assert.equal(await mobile.locator('#percent').innerText(),'0%');
    console.log('Mobile dialog, touch controls, unavailable saved selection fallback: passed');
    await mobile.close();
    const solo=await browser.newPage({viewport:{width:1000,height:760}});
    const soloUrl=new URL(base);soloUrl.searchParams.delete('mode');
    await solo.goto(soloUrl.href,{waitUntil:'domcontentloaded',timeout:90000});await solo.locator('#go:not([disabled])').waitFor({timeout:90000});
    assert((await solo.locator('#section').innerText()).includes('1/5'));
    for(const definition of shipped.characters.filter(c=>c.ready&&c.id!=='teddy')){
      await solo.locator('#choose-character').waitFor({state:'visible',timeout:60000});
      await solo.click('#choose-character');await solo.click('[data-character="'+definition.id+'"]');
      await solo.waitForFunction(()=>!document.querySelector('#character-picker').open,null,{timeout:60000});
      await solo.locator('#go:not([disabled])').waitFor({timeout:60000});
      assert.equal(await solo.locator('#character-name').innerText(),definition.name);
    }
    await solo.screenshot({path:path.join(output,'solo-character-ready.png')});
    console.log('Current solo entry: all actual character choices and reset/reload integration passed');
    await solo.close();
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
